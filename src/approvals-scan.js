const APPROVAL_EVENT_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const ERC20_APPROVAL_SCAN_WINDOW = 50000;
const MAX_APPROVAL_PAIRS = 500;
const LOG_CHUNK_SIZE = 5000;
const MAX_LOGS_PER_CHUNK = 9000;

const APPROVAL_SCAN_NETWORKS = {
  ethereum: {
    label: "Ethereum",
    chainId: 1,
    endpoints: ["https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com"],
    explorer: "https://etherscan.io"
  },
  base: {
    label: "Base",
    chainId: 8453,
    endpoints: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
    explorer: "https://basescan.org"
  },
  bnb: {
    label: "BNB Chain",
    chainId: 56,
    endpoints: ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"],
    explorer: "https://bscscan.com"
  }
};

async function approvalRpc(endpoint, method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) {
      const error = new Error(payload.error.message || "RPC request failed");
      error.code = payload.error.code;
      throw error;
    }
    if (!("result" in payload)) throw new Error("RPC returned no result");
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

function isLogRangeError(error) {
  const message = String(error && error.message || "").toLowerCase();
  return error?.code === -32005 ||
    message.includes("too many") ||
    message.includes("range") ||
    message.includes("query timeout") ||
    message.includes("response size") ||
    message.includes("more than") ||
    message.includes("block range");
}

function toHexBlock(value) {
  return "0x" + BigInt(value).toString(16);
}

async function getApprovalLogs(endpoint, fromBlock, toBlock, ownerTopic, depth = 0) {
  try {
    const logs = await approvalRpc(endpoint, "eth_getLogs", [{
      fromBlock: toHexBlock(fromBlock),
      toBlock: toHexBlock(toBlock),
      topics: [APPROVAL_EVENT_TOPIC, ownerTopic]
    }]);

    if (!Array.isArray(logs)) throw new Error("RPC returned an invalid log list");
    if (logs.length < MAX_LOGS_PER_CHUNK || fromBlock === toBlock) return logs;

    // A response close to a provider result cap may be truncated or fail at a wider range.
    throw Object.assign(new Error("Too many logs in one block range"), { code: -32005 });
  } catch (error) {
    const width = toBlock - fromBlock + 1n;
    if (!isLogRangeError(error) || width <= 128n || depth >= 12) throw error;

    const midpoint = fromBlock + width / 2n - 1n;
    const left = await getApprovalLogs(endpoint, fromBlock, midpoint, ownerTopic, depth + 1);
    const right = await getApprovalLogs(endpoint, midpoint + 1n, toBlock, ownerTopic, depth + 1);
    return left.concat(right);
  }
}

function decodeApprovalLog(log) {
  if (!log || !Array.isArray(log.topics) || log.topics.length !== 3) return null;
  if (typeof log.data !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(log.address || "")) return null;
  if (!/^0x[a-fA-F0-9]{64}$/.test(log.topics[2] || "")) return null;

  const token = log.address.toLowerCase();
  const spender = "0x" + log.topics[2].slice(-40).toLowerCase();
  const blockNumber = Number(BigInt(log.blockNumber || "0x0"));
  return { token, spender, blockNumber };
}

function approvalEncodeAddress(address) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function approvalDecodeUint(hexValue) {
  if (typeof hexValue !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hexValue)) {
    throw new Error("Token returned an invalid uint256 value");
  }
  return BigInt(hexValue);
}

async function getTokenDecimals(endpoint, token) {
  try {
    const raw = await approvalRpc(endpoint, "eth_call", [{ to: token, data: "0x313ce567" }, "latest"]);
    if (typeof raw !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(raw)) return null;
    const decimals = Number(BigInt(raw));
    return Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : null;
  } catch {
    return null;
  }
}

function formatApprovalUnits(value, decimals) {
  if (decimals === null) return value.toString() + " raw units";
  if (decimals === 0) return value.toString();

  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) return whole.toString();

  const fractionText = fraction.toString().padStart(decimals, "0");
  const trimmed = fractionText.slice(0, 6).replace(/0+$/, "");
  const hasRemainder = fractionText.length > 6 && /[1-9]/.test(fractionText.slice(6));
  return whole.toString() + (trimmed ? "." + trimmed : "") + (hasRemainder ? "…" : "");
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error: error && error.message ? error.message : "Check failed" };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

async function scanErc20Approvals(networkKey, ownerAddress, onProgress = () => {}) {
  const network = APPROVAL_SCAN_NETWORKS[networkKey];
  if (!network) throw new Error("Automatic approval scans currently support Ethereum, Base, and BNB Chain.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) throw new Error("Enter a valid EVM wallet address.");

  const ownerTopic = "0x" + ownerAddress.slice(2).toLowerCase().padStart(64, "0");
  let lastError = null;

  for (const endpoint of network.endpoints) {
    try {
      const chainId = Number(BigInt(await approvalRpc(endpoint, "eth_chainId", [])));
      if (chainId !== network.chainId) throw new Error("RPC endpoint returned the wrong network.");

      const latestBlock = BigInt(await approvalRpc(endpoint, "eth_blockNumber", []));
      const fromBlock = latestBlock >= BigInt(ERC20_APPROVAL_SCAN_WINDOW - 1)
        ? latestBlock - BigInt(ERC20_APPROVAL_SCAN_WINDOW - 1)
        : 0n;

      const allLogs = [];
      const totalBlocks = latestBlock - fromBlock + 1n;
      let cursor = fromBlock;
      let chunksDone = 0;
      const totalChunks = Number((totalBlocks + BigInt(LOG_CHUNK_SIZE) - 1n) / BigInt(LOG_CHUNK_SIZE));

      while (cursor <= latestBlock) {
        const end = cursor + BigInt(LOG_CHUNK_SIZE - 1) > latestBlock
          ? latestBlock
          : cursor + BigInt(LOG_CHUNK_SIZE - 1);
        const logs = await getApprovalLogs(endpoint, cursor, end, ownerTopic);
        allLogs.push(...logs);
        cursor = end + 1n;
        chunksDone++;
        onProgress({ phase: "logs", done: chunksDone, total: totalChunks, latestBlock: Number(latestBlock) });
      }

      const pairMap = new Map();
      for (const log of allLogs) {
        const decoded = decodeApprovalLog(log);
        if (!decoded) continue;
        const key = decoded.token + ":" + decoded.spender;
        const existing = pairMap.get(key);
        if (!existing || decoded.blockNumber > existing.lastSeenBlock) {
          pairMap.set(key, { ...decoded, lastSeenBlock: decoded.blockNumber });
        }
      }

      const discoveredPairs = [...pairMap.values()].sort((a, b) => b.lastSeenBlock - a.lastSeenBlock);
      const truncated = discoveredPairs.length > MAX_APPROVAL_PAIRS;
      const selectedPairs = discoveredPairs.slice(0, MAX_APPROVAL_PAIRS);

      const decimalsCache = new Map();
      const getDecimals = token => {
        if (!decimalsCache.has(token)) decimalsCache.set(token, getTokenDecimals(endpoint, token));
        return decimalsCache.get(token);
      };

      onProgress({ phase: "allowances", done: 0, total: selectedPairs.length });
      let checked = 0;
      const pairResults = await mapConcurrent(selectedPairs, 5, async pair => {
        const callData = "0xdd62ed3e" + approvalEncodeAddress(ownerAddress) + approvalEncodeAddress(pair.spender);
        const raw = await approvalRpc(endpoint, "eth_call", [{ to: pair.token, data: callData }, "latest"]);
        const allowance = approvalDecodeUint(raw);
        const decimals = await getDecimals(pair.token);
        checked++;
        onProgress({ phase: "allowances", done: checked, total: selectedPairs.length });

        const max = (1n << 256n) - 1n;
        let status = "active";
        if (allowance === 0n) status = "inactive";
        else if (allowance === max) status = "unlimited";
        else if (allowance >= max / 2n) status = "very-large";

        return {
          ...pair,
          allowance: allowance.toString(),
          formattedAllowance: formatApprovalUnits(allowance, decimals),
          decimals,
          status,
          explorer: network.explorer
        };
      });

      const checkedPairs = pairResults.filter(item => !item.error);
      const failedPairs = pairResults.filter(item => item.error).length;
      const activeApprovals = checkedPairs
        .filter(item => item.status !== "inactive")
        .sort((a, b) => {
          const rank = { unlimited: 0, "very-large": 1, active: 2, inactive: 3 };
          return rank[a.status] - rank[b.status] || b.lastSeenBlock - a.lastSeenBlock;
        });

      return {
        network: network.label,
        chainId: network.chainId,
        ownerAddress,
        fromBlock: Number(fromBlock),
        toBlock: Number(latestBlock),
        windowBlocks: Number(totalBlocks),
        approvalEventsFound: allLogs.length,
        discoveredPairs: discoveredPairs.length,
        checkedPairs: checkedPairs.length,
        inactivePairs: checkedPairs.filter(item => item.status === "inactive").length,
        failedPairs,
        activeApprovals,
        truncated,
        maxPairs: MAX_APPROVAL_PAIRS,
        rpcHost: new URL(endpoint).host
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || "No RPC endpoint was available.");
}

window.SafeWalletApprovalScan = {
  scanErc20Approvals,
  scanWindowBlocks: ERC20_APPROVAL_SCAN_WINDOW
};

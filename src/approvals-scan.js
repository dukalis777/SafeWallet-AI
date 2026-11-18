const APPROVAL_EVENT_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const APPROVAL_FOR_ALL_EVENT_TOPIC = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31";
const DEFAULT_APPROVAL_SCAN_WINDOW = 250000;
const MAX_APPROVAL_PAIRS = 500;

const APPROVAL_SCAN_NETWORKS = {
  ethereum: {
    label: "Ethereum",
    chainId: 1,
    endpoints: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com", "https://eth.drpc.org"],
    explorer: "https://etherscan.io"
  },
  base: {
    label: "Base",
    chainId: 8453,
    endpoints: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
    explorer: "https://basescan.org"
  },
  bnb: {
    label: "BNB Chain",
    chainId: 56,
    endpoints: ["https://bsc-rpc.publicnode.com"],
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

    const rawBody = await response.text();
    let payload;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const detail = payload?.error?.message || payload?.message || rawBody.slice(0, 200);
      throw new Error(`RPC HTTP ${response.status}${detail ? ": " + detail : ""}`);
    }
    if (payload.error) throw new Error(payload.error.message || "RPC request failed");
    if (!("result" in payload)) throw new Error("RPC returned no result");
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

async function selectCurrentRpc(network) {
  const errors = [];
  for (const endpoint of network.endpoints) {
    try {
      const chainId = Number(BigInt(await approvalRpc(endpoint, "eth_chainId", [])));
      if (chainId !== network.chainId) throw new Error("RPC endpoint returned the wrong network");
      const latestBlock = BigInt(await approvalRpc(endpoint, "eth_blockNumber", []));
      return { endpoint, latestBlock };
    } catch (error) {
      const host = (() => {
        try { return new URL(endpoint).host; } catch { return "RPC provider"; }
      })();
      errors.push(`${host}: ${error && error.message ? error.message : "request failed"}`);
    }
  }
  throw new Error("Could not read the latest block from available RPC providers: " + errors.join(" | "));
}

function decodeUint256(hexValue) {
  if (typeof hexValue !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hexValue)) {
    throw new Error("Contract returned an invalid uint256 value");
  }
  return BigInt(hexValue);
}

function decodeAddress(hexValue) {
  if (typeof hexValue !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hexValue)) {
    throw new Error("Contract returned an invalid address value");
  }
  return "0x" + hexValue.slice(-40).toLowerCase();
}

function isTrueResult(hexValue) {
  return typeof hexValue === "string" && /^0x0{63}1$/i.test(hexValue);
}

function encodeAddress(address) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function encodeBytes4(value) {
  return value.replace(/^0x/, "").toLowerCase().padEnd(64, "0");
}

function encodeUint256(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function decodeApprovalEvent(log) {
  if (!log || !Array.isArray(log.topics) || log.topics.length < 3) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(log.address || "")) return null;
  if (!/^0x[a-fA-F0-9]{64}$/.test(log.topics[1] || "")) return null;

  const token = log.address.toLowerCase();
  const owner = "0x" + log.topics[1].slice(-40).toLowerCase();
  const blockNumber = Number(BigInt(log.blockNumber || "0x0"));

  // ERC-721 Approval has four topics (owner, approved, tokenId) and empty data.
  if (log.topics.length === 4 && log.data === "0x" &&
      /^0x[a-fA-F0-9]{64}$/.test(log.topics[2]) &&
      /^0x[a-fA-F0-9]{64}$/.test(log.topics[3])) {
    return {
      kind: "nft-token",
      token,
      owner,
      approvedFromEvent: "0x" + log.topics[2].slice(-40).toLowerCase(),
      tokenId: BigInt(log.topics[3]).toString(),
      blockNumber
    };
  }

  // ERC-20 Approval has three topics and one uint256 value in data.
  if (log.topics.length === 3 &&
      /^0x[a-fA-F0-9]{64}$/.test(log.topics[2] || "") &&
      typeof log.data === "string" &&
      /^0x[0-9a-fA-F]{64}$/.test(log.data)) {
    return {
      kind: "erc20",
      token,
      owner,
      spender: "0x" + log.topics[2].slice(-40).toLowerCase(),
      blockNumber
    };
  }

  return null;
}

function decodeApprovalForAllEvent(log) {
  if (!log || !Array.isArray(log.topics) || log.topics.length !== 3) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(log.address || "")) return null;
  if (!/^0x[a-fA-F0-9]{64}$/.test(log.topics[1] || "") ||
      !/^0x[a-fA-F0-9]{64}$/.test(log.topics[2] || "")) return null;
  if (typeof log.data !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) return null;

  return {
    kind: "nft-operator",
    token: log.address.toLowerCase(),
    owner: "0x" + log.topics[1].slice(-40).toLowerCase(),
    operator: "0x" + log.topics[2].slice(-40).toLowerCase(),
    eventApproved: BigInt(log.data) !== 0n,
    blockNumber: Number(BigInt(log.blockNumber || "0x0"))
  };
}

async function getTokenDecimals(endpoint, token) {
  try {
    const raw = await approvalRpc(endpoint, "eth_call", [{ to: token, data: "0x313ce567" }, "latest"]);
    const decimals = Number(decodeUint256(raw));
    return Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : null;
  } catch {
    return null;
  }
}

function formatTokenUnits(value, decimals) {
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

async function checkErc20Allowance(endpoint, ownerAddress, pair) {
  const callData = "0xdd62ed3e" + encodeAddress(ownerAddress) + encodeAddress(pair.spender);
  const raw = await approvalRpc(endpoint, "eth_call", [{ to: pair.token, data: callData }, "latest"]);
  const allowance = decodeUint256(raw);
  const decimals = await getTokenDecimals(endpoint, pair.token);
  const max = (1n << 256n) - 1n;
  let status = "active";
  if (allowance === 0n) status = "inactive";
  else if (allowance === max) status = "unlimited";
  else if (allowance >= max / 2n) status = "very-large";

  return {
    ...pair,
    allowance: allowance.toString(),
    formattedAllowance: formatTokenUnits(allowance, decimals),
    decimals,
    status
  };
}

async function checkNftTokenApproval(endpoint, ownerAddress, item) {
  const tokenIdHex = encodeUint256(item.tokenId);
  const [ownerRaw, approvedRaw] = await Promise.all([
    approvalRpc(endpoint, "eth_call", [{ to: item.token, data: "0x6352211e" + tokenIdHex }, "latest"]),
    approvalRpc(endpoint, "eth_call", [{ to: item.token, data: "0x081812fc" + tokenIdHex }, "latest"])
  ]);
  const currentOwner = decodeAddress(ownerRaw);
  const currentApproved = decodeAddress(approvedRaw);
  const active = currentOwner === ownerAddress.toLowerCase() &&
    currentApproved !== "0x0000000000000000000000000000000000000000";

  return {
    ...item,
    currentOwner,
    currentApproved,
    status: active ? "active" : "inactive",
    inactiveReason: currentOwner !== ownerAddress.toLowerCase()
      ? "NFT is no longer owned by this wallet"
      : "No current token-specific approval"
  };
}

async function checkNftOperatorApproval(endpoint, ownerAddress, item) {
  const callData = "0xe985e9c5" + encodeAddress(ownerAddress) + encodeAddress(item.operator);
  const raw = await approvalRpc(endpoint, "eth_call", [{ to: item.token, data: callData }, "latest"]);
  const active = isTrueResult(raw);

  let standard = "NFT collection";
  if (active) {
    const supportsCall = (interfaceId) =>
      approvalRpc(endpoint, "eth_call", [{
        to: item.token,
        data: "0x01ffc9a7" + encodeBytes4(interfaceId)
      }, "latest"]).then(isTrueResult).catch(() => false);

    const [isErc721, isErc1155] = await Promise.all([
      supportsCall("0x80ac58cd"),
      supportsCall("0xd9b67a26")
    ]);

    if (isErc721 && isErc1155) standard = "ERC-721 / ERC-1155";
    else if (isErc721) standard = "ERC-721";
    else if (isErc1155) standard = "ERC-1155";
  }

  return { ...item, status: active ? "active" : "inactive", standard };
}

async function scanErc20Approvals(networkKey, ownerAddress, apiKey, requestedWindow = DEFAULT_APPROVAL_SCAN_WINDOW, onProgress = () => {}) {
  const network = APPROVAL_SCAN_NETWORKS[networkKey];
  if (!network) {
    throw new Error("Automatic approval scans currently support Ethereum, Base, and BNB Chain.");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
    throw new Error("Enter a valid EVM wallet address.");
  }
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Add your Etherscan API key in the scanner settings first.");
  }

  const scanWindow = Number(requestedWindow);
  const allowedWindows = [50000, 250000, 500000, 1000000];
  if (!allowedWindows.includes(scanWindow)) {
    throw new Error("Choose a supported scan history range.");
  }

  const ownerTopic = "0x" + ownerAddress.slice(2).toLowerCase().padStart(64, "0");
  const currentRpc = await selectCurrentRpc(network);
  const latestBlock = currentRpc.latestBlock;
  const fromBlock = latestBlock >= BigInt(scanWindow - 1)
    ? latestBlock - BigInt(scanWindow - 1)
    : 0n;
  const totalBlocks = latestBlock - fromBlock + 1n;

  onProgress({ phase: "logs", eventLabel: "ERC-20 / ERC-721 token approvals", page: 0, maxPages: 20, eventsFound: 0 });
  const approvalLogResult = await window.SafeWalletEtherscan.getIndexedEventLogs(
    network.chainId, fromBlock, latestBlock, ownerTopic, apiKey,
    APPROVAL_EVENT_TOPIC, "ERC-20 / ERC-721 Approval",
    progress => onProgress(progress)
  );

  onProgress({ phase: "logs", eventLabel: "ERC-721 / ERC-1155 operator approvals", page: 0, maxPages: 20, eventsFound: 0 });
  const operatorLogResult = await window.SafeWalletEtherscan.getIndexedEventLogs(
    network.chainId, fromBlock, latestBlock, ownerTopic, apiKey,
    APPROVAL_FOR_ALL_EVENT_TOPIC, "NFT ApprovalForAll",
    progress => onProgress(progress)
  );

  const erc20Map = new Map();
  const nftTokenMap = new Map();
  const nftOperatorMap = new Map();

  for (const log of approvalLogResult.logs) {
    const item = decodeApprovalEvent(log);
    if (!item) continue;

    if (item.kind === "erc20") {
      const key = item.token + ":" + item.spender;
      const existing = erc20Map.get(key);
      if (!existing || item.blockNumber > existing.lastSeenBlock) {
        erc20Map.set(key, { ...item, lastSeenBlock: item.blockNumber });
      }
    } else if (item.kind === "nft-token") {
      const key = item.token + ":" + item.tokenId;
      const existing = nftTokenMap.get(key);
      if (!existing || item.blockNumber > existing.lastSeenBlock) {
        nftTokenMap.set(key, { ...item, lastSeenBlock: item.blockNumber });
      }
    }
  }

  for (const log of operatorLogResult.logs) {
    const item = decodeApprovalForAllEvent(log);
    if (!item) continue;
    const key = item.token + ":" + item.operator;
    const existing = nftOperatorMap.get(key);
    if (!existing || item.blockNumber > existing.lastSeenBlock) {
      nftOperatorMap.set(key, { ...item, lastSeenBlock: item.blockNumber });
    }
  }

  const erc20Pairs = [...erc20Map.values()].sort((a, b) => b.lastSeenBlock - a.lastSeenBlock);
  const nftTokenPairs = [...nftTokenMap.values()].sort((a, b) => b.lastSeenBlock - a.lastSeenBlock);
  const nftOperatorPairs = [...nftOperatorMap.values()].sort((a, b) => b.lastSeenBlock - a.lastSeenBlock);

  const truncatedErc20Pairs = erc20Pairs.length > MAX_APPROVAL_PAIRS;
  const truncatedNftTokenPairs = nftTokenPairs.length > MAX_APPROVAL_PAIRS;
  const truncatedNftOperators = nftOperatorPairs.length > MAX_APPROVAL_PAIRS;

  const selectedErc20 = erc20Pairs.slice(0, MAX_APPROVAL_PAIRS);
  const selectedNftTokens = nftTokenPairs.slice(0, MAX_APPROVAL_PAIRS);
  const selectedNftOperators = nftOperatorPairs.slice(0, MAX_APPROVAL_PAIRS);

  onProgress({ phase: "allowances", eventLabel: "ERC-20", done: 0, total: selectedErc20.length });
  let erc20Checked = 0;
  const erc20Results = await mapConcurrent(selectedErc20, 4, async pair => {
    const result = await checkErc20Allowance(currentRpc.endpoint, ownerAddress, pair);
    erc20Checked++;
    onProgress({ phase: "allowances", eventLabel: "ERC-20", done: erc20Checked, total: selectedErc20.length });
    return result;
  });

  onProgress({ phase: "allowances", eventLabel: "NFT token approvals", done: 0, total: selectedNftTokens.length });
  let nftTokenChecked = 0;
  const nftTokenResults = await mapConcurrent(selectedNftTokens, 4, async item => {
    const result = await checkNftTokenApproval(currentRpc.endpoint, ownerAddress, item);
    nftTokenChecked++;
    onProgress({ phase: "allowances", eventLabel: "NFT token approvals", done: nftTokenChecked, total: selectedNftTokens.length });
    return result;
  });

  onProgress({ phase: "allowances", eventLabel: "NFT operator approvals", done: 0, total: selectedNftOperators.length });
  let nftOperatorChecked = 0;
  const nftOperatorResults = await mapConcurrent(selectedNftOperators, 4, async item => {
    const result = await checkNftOperatorApproval(currentRpc.endpoint, ownerAddress, item);
    nftOperatorChecked++;
    onProgress({ phase: "allowances", eventLabel: "NFT operator approvals", done: nftOperatorChecked, total: selectedNftOperators.length });
    return result;
  });

  const checkedErc20 = erc20Results.filter(item => !item.error);
  const checkedNftTokens = nftTokenResults.filter(item => !item.error);
  const checkedNftOperators = nftOperatorResults.filter(item => !item.error);

  const activeApprovals = checkedErc20
    .filter(item => item.status !== "inactive")
    .sort((a, b) => {
      const rank = { unlimited: 0, "very-large": 1, active: 2, inactive: 3 };
      return rank[a.status] - rank[b.status] || b.lastSeenBlock - a.lastSeenBlock;
    });
  const activeNftTokenApprovals = checkedNftTokens
    .filter(item => item.status === "active")
    .sort((a, b) => b.lastSeenBlock - a.lastSeenBlock);
  const activeNftOperators = checkedNftOperators
    .filter(item => item.status === "active")
    .sort((a, b) => b.lastSeenBlock - a.lastSeenBlock);

  const failedPairs = erc20Results.filter(item => item.error).length;
  const failedNftTokenPairs = nftTokenResults.filter(item => item.error).length;
  const failedNftOperatorPairs = nftOperatorResults.filter(item => item.error).length;

  return {
    network: network.label,
    chainId: network.chainId,
    ownerAddress,
    fromBlock: Number(fromBlock),
    toBlock: Number(latestBlock),
    windowBlocks: Number(totalBlocks),
    approvalEventsFound: approvalLogResult.logs.length,
    nftOperatorEventsFound: operatorLogResult.logs.length,
    discoveredPairs: erc20Pairs.length,
    checkedPairs: checkedErc20.length,
    inactivePairs: checkedErc20.filter(item => item.status === "inactive").length,
    failedPairs,
    activeApprovals,
    discoveredNftTokenApprovals: nftTokenPairs.length,
    checkedNftTokenApprovals: checkedNftTokens.length,
    inactiveNftTokenApprovals: checkedNftTokens.filter(item => item.status === "inactive").length,
    failedNftTokenPairs,
    activeNftTokenApprovals,
    discoveredNftOperators: nftOperatorPairs.length,
    checkedNftOperators: checkedNftOperators.length,
    inactiveNftOperators: checkedNftOperators.filter(item => item.status === "inactive").length,
    failedNftOperatorPairs,
    activeNftOperators,
    truncatedErc20Pairs,
    truncatedNftTokenPairs,
    truncatedNftOperators,
    truncatedLogs: approvalLogResult.truncated || operatorLogResult.truncated,
    maxPairs: MAX_APPROVAL_PAIRS,
    indexer: "Etherscan API V2",
    explorer: network.explorer,
    rpcHost: new URL(currentRpc.endpoint).host
  };
}

window.SafeWalletApprovalScan = {
  scanErc20Approvals,
  defaultScanWindow: DEFAULT_APPROVAL_SCAN_WINDOW
};

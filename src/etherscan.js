const ETHERSCAN_API_BASE = "https://api.etherscan.io/v2/api";
const ETHERSCAN_APPROVAL_EVENT_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const ETHERSCAN_PAGE_SIZE = 1000;
const ETHERSCAN_MAX_PAGES = 20;
const ETHERSCAN_MIN_PAGE_DELAY_MS = 400;
let lastEtherscanRequestAt = 0;

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitedEtherscanRequest(params) {
  const elapsed = Date.now() - lastEtherscanRequestAt;
  if (elapsed < ETHERSCAN_MIN_PAGE_DELAY_MS) {
    await pause(ETHERSCAN_MIN_PAGE_DELAY_MS - elapsed);
  }

  const url = new URL(ETHERSCAN_API_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal
    });
    lastEtherscanRequestAt = Date.now();

    const raw = await response.text();
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error("Etherscan returned an unreadable response.");
    }

    if (!response.ok) {
      throw new Error(`Etherscan HTTP ${response.status}: ${payload.message || raw.slice(0, 180)}`);
    }

    if (String(payload.status) === "0") {
      const detail = typeof payload.result === "string" ? payload.result : payload.message;
      if (/no records found/i.test(detail || "")) return [];
      throw new Error(detail || payload.message || "Etherscan API request failed.");
    }

    if (String(payload.status) !== "1" || !Array.isArray(payload.result)) {
      throw new Error(payload.message || "Etherscan returned an unexpected response.");
    }

    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

async function getIndexedApprovalLogs(chainId, fromBlock, toBlock, ownerTopic, apiKey, onProgress = () => {}) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Add your free Etherscan API key in the scanner settings first.");
  }

  const allLogs = [];
  let truncated = false;

  for (let page = 1; page <= ETHERSCAN_MAX_PAGES; page++) {
    const logs = await rateLimitedEtherscanRequest({
      chainid: chainId,
      module: "logs",
      action: "getLogs",
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      topic0: ETHERSCAN_APPROVAL_EVENT_TOPIC,
      topic0_1_opr: "and",
      topic1: ownerTopic,
      page,
      offset: ETHERSCAN_PAGE_SIZE,
      apikey: apiKey.trim()
    });

    allLogs.push(...logs);
    onProgress({
      phase: "logs",
      page,
      maxPages: ETHERSCAN_MAX_PAGES,
      eventsFound: allLogs.length
    });

    if (logs.length < ETHERSCAN_PAGE_SIZE) break;
    if (page === ETHERSCAN_MAX_PAGES) truncated = true;
  }

  return { logs: allLogs, truncated };
}

window.SafeWalletEtherscan = { getIndexedApprovalLogs };

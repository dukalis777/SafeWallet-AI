const form = document.getElementById("scan-form");
const addressInput = document.getElementById("address");
const networkInput = document.getElementById("network");
const scanButton = document.getElementById("scan-button");
const result = document.getElementById("result");

const NETWORKS = {
  ethereum: { label: "Ethereum", chainId: "1" },
  base: { label: "Base", chainId: "8453" },
  bnb: { label: "BNB Chain", chainId: "56" }
};

function isEvmAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

function addText(parent, tagName, text, className = "") {
  const node = document.createElement(tagName);
  node.textContent = text;
  if (className) node.className = className;
  parent.appendChild(node);
  return node;
}

function renderMessage(title, message, tone = "info") {
  result.replaceChildren();
  result.classList.remove("hidden");
  const card = document.createElement("div");
  card.className = `summary ${tone}`;
  addText(card, "h3", title);
  addText(card, "p", message);
  result.appendChild(card);
}

function renderScan(scan, networkLabel) {
  result.replaceChildren();
  result.classList.remove("hidden");

  let heading = "Insufficient security data";
  let tag = "LIMITED DATA";
  let tone = "unknown";

  if (scan.hasHighRiskFlag) {
    heading = "High-risk indicators found";
    tag = "HIGH RISK SIGNALS";
    tone = "danger";
  } else if (scan.signals.length) {
    heading = "Review recommended";
    tag = "RISK SIGNALS";
    tone = "warning";
  } else if (scan.hasAddressData && scan.hasTokenData) {
    heading = "No listed risk flags returned";
    tag = "ADDRESS + TOKEN CHECKED";
    tone = "caution";
  } else if (scan.hasAddressData) {
    heading = "Partial check: address reputation only";
    tag = "PARTIAL CHECK";
    tone = "unknown";
  } else if (scan.hasTokenData) {
    heading = "Partial check: token security only";
    tag = "PARTIAL CHECK";
    tone = "unknown";
  }

  const summary = document.createElement("div");
  summary.className = `summary ${tone}`;
  addText(summary, "span", tag, "tag");
  addText(summary, "h3", heading);
  addText(summary, "p", `${networkLabel} · ${scan.address.slice(0, 10)}…${scan.address.slice(-6)}`);
  result.appendChild(summary);

  if (scan.signals.length) {
    const section = document.createElement("div");
    section.className = "details";
    addText(section, "h4", "Signals reported by GoPlus");
    const list = document.createElement("ul");
    scan.signals.forEach(signal => {
      const item = document.createElement("li");
      const copy = document.createElement("div");
      copy.className = "signal-copy";
      addText(copy, "span", signal.label, "signal-title");

      let explanation = "This signal deserves review. Check the contract details and permissions before interacting.";
      if (signal.key === "is_mintable") {
        explanation = "The contract exposes a token-minting function. Check who is authorized to mint, whether supply limits exist, and whether minting is controlled. This feature alone does not prove the token is malicious.";
      } else if (signal.key === "hidden_owner") {
        explanation = "The contract may contain owner privileges that are not immediately obvious. Review the verified source code and the privileges available to the owner.";
      } else if (signal.key === "can_take_back_ownership") {
        explanation = "Ownership may be recoverable or reassigned through contract logic. Review who can trigger this and what privileges ownership grants.";
      } else if (signal.key === "owner_change_balance") {
        explanation = "The contract may allow an owner to modify token balances. This can create significant holder risk; inspect the relevant source code and permissions.";
      } else if (signal.key === "is_honeypot") {
        explanation = "The provider flags potential honeypot behavior. Selling or transferring may be restricted. Do not interact until the contract has been independently reviewed.";
      } else if (signal.key === "is_blacklisted") {
        explanation = "The contract may allow selected addresses to be blocked from transfers. Check who controls this feature and how it can be used.";
      } else if (signal.key === "slippage_modifiable") {
        explanation = "Buy or sell fees may be changeable. Check who can change them and whether there are enforceable limits.";
      } else if (signal.key === "is_proxy") {
        explanation = "This contract appears to use a proxy pattern. Its implementation may be upgradeable, so review who controls upgrades and whether changes are timelocked.";
      } else if (signal.key === "is_open_source") {
        explanation = "The provider reports that verified source code is unavailable. This limits independent review of the contract's behavior.";
      }

      addText(copy, "p", explanation, "signal-explanation");
      item.appendChild(copy);
      addText(item, "small", signal.source);
      list.appendChild(item);
    });
    section.appendChild(list);
    result.appendChild(section);
  }

  const checks = document.createElement("div");
  checks.className = "check-status";
  addText(checks, "p", `Address reputation: ${scan.hasAddressData ? "data returned; no listed flags found" : "no record returned"}`);
  addText(checks, "p", `Token security: ${scan.hasTokenData ? "token record returned" : "not assessed — no token record returned"}`);
  result.appendChild(checks);

  if (scan.addressError || scan.tokenError) {
    const errors = [scan.addressError, scan.tokenError].filter(Boolean).join(" · ");
    addText(result, "p", `Some checks were unavailable: ${errors}`, "error-text");
  }

  const notice = document.createElement("p");
  notice.className = "notice";
  notice.textContent = "A missing flag or an empty result does not prove an address is safe. This check does not simulate your transaction or inspect the exact permissions you are about to sign.";
  result.appendChild(notice);

  addText(result, "p", "Data provider: GoPlus Security", "provider");
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  const networkKey = networkInput.value;
  const address = addressInput.value.trim();

  if (networkKey === "supra") {
    renderMessage(
      "Supra checks are not connected yet",
      "The current GoPlus lookup integration covers selected EVM networks. Supra-specific security analysis is planned as a separate integration."
    );
    return;
  }

  if (!isEvmAddress(address)) {
    renderMessage(
      "Check the address format",
      "Enter a valid EVM address: 0x followed by 40 hexadecimal characters.",
      "warning"
    );
    return;
  }

  const network = NETWORKS[networkKey];
  if (!network) {
    renderMessage("Unsupported network", "Choose one of the currently supported networks.", "warning");
    return;
  }

  scanButton.disabled = true;
  scanButton.textContent = "Checking security data…";
  renderMessage("Checking address", "Requesting address reputation and token-risk data from GoPlus.");

  try {
    const scan = await window.SafeWalletGoPlus.scanAddress(address, network.chainId);
    renderScan(scan, network.label);
  } catch (error) {
    renderMessage(
      "Security lookup unavailable",
      error && error.message ? error.message : "The security provider could not be reached. Try again later.",
      "warning"
    );
  } finally {
    scanButton.disabled = false;
    scanButton.innerHTML = 'Run security checks <span>→</span>';
  }
});

const allowanceForm = document.getElementById("allowance-form");
const ownerInput = document.getElementById("owner-address");
const tokenInput = document.getElementById("token-address");
const spenderInput = document.getElementById("spender-address");
const allowanceButton = document.getElementById("allowance-button");
const allowanceResult = document.getElementById("allowance-result");

function renderAllowanceMessage(title, message, tone = "unknown") {
  allowanceResult.replaceChildren();
  allowanceResult.classList.remove("hidden");
  const card = document.createElement("div");
  card.className = `summary ${tone}`;
  addText(card, "h3", title);
  addText(card, "p", message);
  allowanceResult.appendChild(card);
}

function renderAllowance(data) {
  allowanceResult.replaceChildren();
  allowanceResult.classList.remove("hidden");

  const tone = data.status === "zero" ? "caution" : data.status === "unlimited" || data.status === "very-large" ? "danger" : "warning";
  const title = data.status === "zero"
    ? "No allowance for this pair"
    : data.status === "unlimited"
      ? "Unlimited token allowance"
      : data.status === "very-large"
        ? "Very large token allowance"
        : "Active token allowance";

  const card = document.createElement("div");
  card.className = `summary ${tone}`;
  addText(card, "span", "ON-CHAIN READ", "tag");
  addText(card, "h3", title);
  addText(card, "p", `${data.network} · Chain ID ${data.chainId}`);
  allowanceResult.appendChild(card);

  const details = document.createElement("div");
  details.className = "check-status";
  addText(details, "p", `Allowance: ${data.formattedAllowance}`);
  addText(details, "p", `Wallet: ${data.ownerAddress}`);
  addText(details, "p", `Token: ${data.tokenAddress}`);
  addText(details, "p", `Spender: ${data.spenderAddress}`);
  addText(details, "p", `RPC: ${data.rpcHost}`);
  allowanceResult.appendChild(details);

  const explanation = data.status === "zero"
    ? "The token contract reports zero allowance for this exact wallet and spender pair. This does not check other tokens or other spenders."
    : data.status === "unlimited"
      ? "The token contract reports the maximum uint256 allowance. The spender may transfer any amount of this token from the wallet, subject to the token contract's rules. Review whether this approval is still needed."
      : data.status === "very-large"
        ? "The allowance is extremely large. Confirm that the spender is trusted and that this level of access is necessary."
        : "A non-zero allowance is active for this exact spender. Compare it with the amount you intended to approve.";
  addText(allowanceResult, "p", explanation, "notice");
  addText(allowanceResult, "p", "Read-only eth_call. No transaction was sent and no approval was changed.", "provider");
}

allowanceForm.addEventListener("submit", async event => {
  event.preventDefault();

  const networkKey = networkInput.value;
  const owner = ownerInput.value.trim();
  const token = tokenInput.value.trim();
  const spender = spenderInput.value.trim();

  if (networkKey === "supra") {
    renderAllowanceMessage("Supra allowance check is not implemented", "This checker currently supports EVM ERC-20 allowance reads on Ethereum, Base, and BNB Chain.");
    return;
  }

  if (![owner, token, spender].every(window.SafeWalletAllowance.isValidEvmAddress)) {
    renderAllowanceMessage("Check the three addresses", "Enter valid EVM addresses for the wallet, token contract, and spender.", "warning");
    return;
  }

  allowanceButton.disabled = true;
  allowanceButton.textContent = "Reading from blockchain…";
  renderAllowanceMessage("Checking allowance", "Performing a read-only allowance(owner, spender) call.");

  try {
    const data = await window.SafeWalletAllowance.checkAllowance(networkKey, owner, token, spender);
    renderAllowance(data);
  } catch (error) {
    renderAllowanceMessage(
      "Allowance check unavailable",
      error && error.message ? error.message : "Could not read this token's allowance. Check the network and addresses, then try again.",
      "warning"
    );
  } finally {
    allowanceButton.disabled = false;
    allowanceButton.innerHTML = 'Check allowance <span>→</span>';
  }
});


const walletApprovalForm = document.getElementById("wallet-approval-form");
const scanOwnerInput = document.getElementById("scan-owner-address");
const approvalScanRange = document.getElementById("approval-scan-range");
const walletApprovalButton = document.getElementById("wallet-approval-button");
const walletApprovalResult = document.getElementById("wallet-approval-result");
const etherscanApiKeyInput = document.getElementById("etherscan-api-key");
const saveEtherscanKeyButton = document.getElementById("save-etherscan-key");
const clearEtherscanKeyButton = document.getElementById("clear-etherscan-key");
const etherscanKeyStatus = document.getElementById("etherscan-key-status");

function setEtherscanKeyStatus(message, isError = false) {
  etherscanKeyStatus.textContent = message;
  etherscanKeyStatus.classList.toggle("error-text", isError);
}

function getLocalEtherscanKey() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["etherscanApiKey"], data => {
      const error = chrome.runtime && chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(data.etherscanApiKey || "");
    });
  });
}

saveEtherscanKeyButton.addEventListener("click", () => {
  const apiKey = etherscanApiKeyInput.value.trim();
  if (!apiKey) {
    setEtherscanKeyStatus("Paste an API key before saving.", true);
    return;
  }

  chrome.storage.local.set({ etherscanApiKey: apiKey }, () => {
    const error = chrome.runtime && chrome.runtime.lastError;
    if (error) {
      setEtherscanKeyStatus("Could not save the key: " + error.message, true);
      return;
    }
    etherscanApiKeyInput.value = "";
    setEtherscanKeyStatus("API key saved locally in this Chrome profile.");
  });
});

clearEtherscanKeyButton.addEventListener("click", () => {
  chrome.storage.local.remove(["etherscanApiKey"], () => {
    const error = chrome.runtime && chrome.runtime.lastError;
    setEtherscanKeyStatus(error ? "Could not remove the key: " + error.message : "Saved Etherscan API key removed.", Boolean(error));
  });
});

getLocalEtherscanKey()
  .then(key => setEtherscanKeyStatus(key ? "An Etherscan API key is saved locally." : "No API key saved yet. Create a free key and save it here."))
  .catch(error => setEtherscanKeyStatus("Could not read local settings: " + error.message, true));

function renderWalletApprovalMessage(title, message, tone = "unknown") {
  walletApprovalResult.replaceChildren();
  walletApprovalResult.classList.remove("hidden");
  const card = document.createElement("div");
  card.className = `summary ${tone}`;
  addText(card, "h3", title);
  addText(card, "p", message);
  walletApprovalResult.appendChild(card);
}

function addExplorerLink(parent, base, path, label) {
  const link = document.createElement("a");
  link.href = base + path;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  link.className = "explorer-link";
  parent.appendChild(link);
  return link;
}

function shortAddress(address) {
  return address.slice(0, 8) + "…" + address.slice(-6);
}

function renderApprovalSection(title, items, network) {
  if (!items.length) return;

  const section = document.createElement("div");
  section.className = "details";
  addText(section, "h4", title);
  const list = document.createElement("ul");

  items.slice(0, 30).forEach(item => {
    const li = document.createElement("li");
    li.className = "approval-row";
    const copy = document.createElement("div");
    copy.className = "signal-copy";

    if (item.kind === "erc20") {
      const statusLabel = item.status === "unlimited" ? "UNLIMITED" : item.status === "very-large" ? "VERY LARGE" : "ACTIVE";
      const statusClass = item.status === "unlimited" || item.status === "very-large" ? "approval-risk" : "approval-active";
      addText(copy, "span", statusLabel, `approval-status ${statusClass}`);
      addText(copy, "strong", `Allowance: ${item.formattedAllowance}`, "approval-amount");
      const links = document.createElement("div");
      links.className = "approval-links";
      addExplorerLink(links, network.explorer, `/address/${item.token}`, "Token");
      addExplorerLink(links, network.explorer, `/address/${item.spender}`, "Spender");
      copy.appendChild(links);
    } else if (item.kind === "nft-token") {
      addText(copy, "span", "NFT TOKEN APPROVAL", "approval-status approval-active");
      addText(copy, "strong", `Token ID: ${item.tokenId}`, "approval-amount");
      addText(copy, "p", `Approved operator: ${shortAddress(item.currentApproved)}`, "signal-explanation");
      const links = document.createElement("div");
      links.className = "approval-links";
      addExplorerLink(links, network.explorer, `/address/${item.token}`, "Collection");
      addExplorerLink(links, network.explorer, `/address/${item.currentApproved}`, "Operator");
      copy.appendChild(links);
    } else if (item.kind === "nft-operator") {
      addText(copy, "span", item.standard.toUpperCase() + " OPERATOR", "approval-status approval-risk");
      addText(copy, "strong", `Operator: ${shortAddress(item.operator)}`, "approval-amount");
      const links = document.createElement("div");
      links.className = "approval-links";
      addExplorerLink(links, network.explorer, `/address/${item.token}`, "Collection");
      addExplorerLink(links, network.explorer, `/address/${item.operator}`, "Operator");
      copy.appendChild(links);
    }

    li.appendChild(copy);
    list.appendChild(li);
  });

  section.appendChild(list);
  walletApprovalResult.appendChild(section);

  if (items.length > 30) {
    addText(walletApprovalResult, "p", `Showing 30 of ${items.length} active entries in this section.`);
  }
}

function renderWalletApprovalScan(scan) {
  walletApprovalResult.replaceChildren();
  walletApprovalResult.classList.remove("hidden");

  const unlimitedCount = scan.activeApprovals.filter(item => item.status === "unlimited").length;
  const veryLargeCount = scan.activeApprovals.filter(item => item.status === "very-large").length;
  const totalActive = scan.activeApprovals.length + scan.activeNftTokenApprovals.length + scan.activeNftOperators.length;
  const totalDiscovered = scan.discoveredPairs + scan.discoveredNftTokenApprovals + scan.discoveredNftOperators;
  const anyFailures = scan.failedPairs + scan.failedNftTokenPairs + scan.failedNftOperatorPairs;

  let tone = totalActive ? "warning" : "caution";
  let title = totalDiscovered === 0
    ? "No standard approval events found in the scanned range"
    : totalActive === 0
      ? "No active permissions found among scanned events"
      : "Active permissions found";
  let tag = totalActive ? "REVIEW PERMISSIONS" : totalDiscovered ? "NO ACTIVE PERMISSIONS" : "NO EVENTS IN RANGE";

  if (unlimitedCount > 0 || scan.activeNftOperators.length > 0) {
    tone = "danger";
    title = "Broad or unlimited permissions found";
    tag = "HIGH EXPOSURE";
  } else if (totalActive > 0) {
    tone = "warning";
    title = "Active permissions found";
    tag = "REVIEW PERMISSIONS";
  } else if (anyFailures > 0) {
    tone = "warning";
    title = "Permission scan incomplete";
    tag = "CHECK INCOMPLETE";
  }

  const summary = document.createElement("div");
  summary.className = `summary ${tone}`;
  addText(summary, "span", tag, "tag");
  addText(summary, "h3", title);
  addText(summary, "p", `${scan.network} · wallet ${shortAddress(scan.ownerAddress)}`);
  walletApprovalResult.appendChild(summary);

  const stats = document.createElement("div");
  stats.className = "check-status";
  addText(stats, "p", `Scanned blocks: ${scan.fromBlock.toLocaleString()} – ${scan.toBlock.toLocaleString()} (${scan.windowBlocks.toLocaleString()} blocks)`);
  addText(stats, "p", `ERC-20 token/spender pairs: ${scan.discoveredPairs} discovered · ${scan.activeApprovals.length} active · ${scan.inactivePairs} zero`);
  addText(stats, "p", `ERC-721 single-token approvals: ${scan.discoveredNftTokenApprovals} found · ${scan.activeNftTokenApprovals.length} active`);
  addText(stats, "p", `NFT operator approvals: ${scan.discoveredNftOperators} found · ${scan.activeNftOperators.length} active`);
  addText(stats, "p", `Events indexed: ${scan.approvalEventsFound} Approval · ${scan.nftOperatorEventsFound} ApprovalForAll`);
  if (anyFailures) addText(stats, "p", `Current-state checks failed: ERC-20 ${scan.failedPairs}, NFT token ${scan.failedNftTokenPairs}, NFT operator ${scan.failedNftOperatorPairs}`, "error-text");
  if (scan.truncatedErc20Pairs || scan.truncatedNftTokenPairs || scan.truncatedNftOperators) {
    addText(stats, "p", `One or more categories exceeded the ${scan.maxPairs} pair limit; some pairs were not checked.`, "error-text");
  }
  if (scan.truncatedLogs) {
    addText(stats, "p", "The Etherscan 20-page limit was reached for at least one event type. Some events in this block range may be missing.", "error-text");
  }
  walletApprovalResult.appendChild(stats);

  const network = { explorer: scan.explorer };
  renderApprovalSection("Active ERC-20 allowances", scan.activeApprovals, network);
  renderApprovalSection("Active ERC-721 token approvals", scan.activeNftTokenApprovals, network);
  renderApprovalSection("Active ERC-721 / ERC-1155 operator approvals", scan.activeNftOperators, network);

  if (!totalActive && totalDiscovered > 0) {
    addText(walletApprovalResult, "p", "The scanner found prior approval events, but the current on-chain checks returned no active permission for the discovered entries.");
  }

  const note = document.createElement("p");
  note.className = "notice";
  note.textContent = "Coverage is limited to the selected block range. Older approvals outside that range, non-standard NFT permissions, and signature-based permits may be missed. An empty result does not prove the wallet has no approvals.";
  walletApprovalResult.appendChild(note);
  addText(walletApprovalResult, "p", `Historical events indexed by ${scan.indexer}; current permissions read via ${scan.rpcHost}. No transactions were sent.`, "provider");
}

walletApprovalForm.addEventListener("submit", async event => {
  event.preventDefault();
  const networkKey = networkInput.value;
  const owner = scanOwnerInput.value.trim();

  if (networkKey === "supra") {
    renderWalletApprovalMessage("Supra scan is not implemented yet", "Automatic approval scanning currently supports Ethereum, Base, and BNB Chain only.");
    return;
  }

  if (!window.SafeWalletAllowance.isValidEvmAddress(owner)) {
    renderWalletApprovalMessage("Check the wallet address", "Enter a valid EVM public wallet address (0x followed by 40 hexadecimal characters).", "warning");
    return;
  }

  let apiKey;
  try {
    apiKey = await getLocalEtherscanKey();
  } catch (error) {
    renderWalletApprovalMessage("Could not read API key settings", error.message, "warning");
    return;
  }

  if (!apiKey) {
    renderWalletApprovalMessage("Etherscan API key required", "Create a free key using the link above, save it locally, then run the wallet scan.", "warning");
    return;
  }

  walletApprovalButton.disabled = true;
  walletApprovalButton.textContent = "Scanning recent approvals…";
  renderWalletApprovalMessage("Starting wallet scan", "Getting the latest block, then requesting indexed Approval events from Etherscan.");

  try {
    const selectedWindow = Number(approvalScanRange.value);
    const scan = await window.SafeWalletApprovalScan.scanErc20Approvals(networkKey, owner, apiKey, selectedWindow, progress => {
      if (progress.phase === "logs") {
        renderWalletApprovalMessage(`Reading ${progress.eventLabel || "approval"} events`, `Etherscan page ${progress.page} / ${progress.maxPages}; ${progress.eventsFound.toLocaleString()} events found so far.`);
      } else if (progress.phase === "allowances") {
        renderWalletApprovalMessage(`Checking current ${progress.eventLabel || "approval"} permissions`, `On-chain checks: ${progress.done} / ${progress.total}.`);
      }
    });
    renderWalletApprovalScan(scan);
  } catch (error) {
    renderWalletApprovalMessage(
      "Wallet scan unavailable",
      error && error.message ? error.message : "The public RPC provider could not complete the scan. Try again later or use another network.",
      "warning"
    );
  } finally {
    walletApprovalButton.disabled = false;
    walletApprovalButton.innerHTML = 'Scan wallet approvals <span>→</span>';
  }
});

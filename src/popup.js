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
      addText(item, "span", signal.label);
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
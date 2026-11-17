const BASE_URL = "https://api.gopluslabs.io/api/v1";

const ADDRESS_FLAGS = [
  ["phishing_activities", "Phishing activity"],
  ["stealing_attack", "Stealing attack"],
  ["blackmail_activities", "Blackmail activity"],
  ["honeypot_related_address", "Related to honeypot tokens"],
  ["blacklist_doubt", "Flagged in a malicious-address list"],
  ["sanctioned", "Sanctioned address"],
  ["money_laundering", "Money-laundering activity"],
  ["financial_crime", "Financial-crime activity"],
  ["cybercrime", "Cybercrime activity"],
  ["fake_kyc", "Fake KYC activity"],
  ["malicious_mining_activities", "Malicious mining activity"],
  ["darkweb_transactions", "Dark-web transactions"],
  ["gas_abuse", "Gas-abuse activity"],
  ["mixer", "Coin-mixer address"]
];

const TOKEN_FLAGS = [
  ["is_honeypot", "Token flagged as a honeypot"],
  ["is_blacklisted", "Token has a blacklist mechanism"],
  ["hidden_owner", "Hidden owner privilege detected"],
  ["can_take_back_ownership", "Ownership may be reclaimed"],
  ["owner_change_balance", "Owner may change token balances"],
  ["is_mintable", "Token has a mint function"],
  ["slippage_modifiable", "Buy/sell tax may be modifiable"],
  ["transfer_pausable", "Transfers may be paused"],
  ["selfdestruct", "Self-destruct capability detected"],
  ["gas_abuse", "Gas-abuse behavior detected"]
];

function isFlagged(value) {
  return value === 1 || value === "1" || value === true;
}

function getAddressRecord(payload) {
  const result = payload && payload.result;
  if (!result || typeof result !== "object") return null;

  // address_security returns the address record directly in result.
  return Object.keys(result).length ? result : null;
}

function getTokenRecord(payload, address) {
  const result = payload && payload.result;
  if (!result || typeof result !== "object") return null;

  const target = address.toLowerCase();
  const matchingKey = Object.keys(result).find(key => key.toLowerCase() === target);
  return matchingKey ? result[matchingKey] : null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`GoPlus returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (String(payload.code) !== "1") {
      throw new Error(payload.message || "GoPlus could not complete this check.");
    }

    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function scanAddress(address, chainId) {
  const encodedAddress = encodeURIComponent(address);
  const addressUrl = `${BASE_URL}/address_security/${encodedAddress}?chain_id=${chainId}`;
  const tokenUrl = `${BASE_URL}/token_security/${chainId}?contract_addresses=${encodedAddress}`;

  // The two independent checks are allowed to succeed or fail separately.
  const [addressResult, tokenResult] = await Promise.allSettled([
    fetchJson(addressUrl),
    fetchJson(tokenUrl)
  ]);

  const addressPayload = addressResult.status === "fulfilled" ? addressResult.value : null;
  const tokenPayload = tokenResult.status === "fulfilled" ? tokenResult.value : null;

  if (!addressPayload && !tokenPayload) {
    const errors = [addressResult, tokenResult]
      .filter(item => item.status === "rejected")
      .map(item => item.reason && item.reason.message)
      .filter(Boolean);
    throw new Error(errors[0] || "Security providers are unavailable. Try again later.");
  }

  const addressRecord = getAddressRecord(addressPayload);
  const tokenRecord = getTokenRecord(tokenPayload, address);

  const addressFlags = addressRecord
    ? ADDRESS_FLAGS.filter(([key]) => isFlagged(addressRecord[key]))
        .map(([key, label]) => ({ key, label, source: "Address reputation" }))
    : [];

  const tokenFlags = tokenRecord
    ? TOKEN_FLAGS.filter(([key]) => isFlagged(tokenRecord[key]))
        .map(([key, label]) => ({ key, label, source: "Token security" }))
    : [];

  const taxSignals = [];
  if (tokenRecord) {
    for (const key of ["buy_tax", "sell_tax"]) {
      const raw = tokenRecord[key];
      const tax = raw === undefined || raw === null || raw === "" ? NaN : Number(raw);
      if (Number.isFinite(tax) && tax > 10) {
        taxSignals.push({
          key,
          label: `${key === "buy_tax" ? "Buy" : "Sell"} tax reported above 10% (${(tax * 100).toFixed(1)}%)`,
          source: "Token security"
        });
      }
    }
  }

  const severeKeys = new Set([
    "phishing_activities", "stealing_attack", "honeypot_related_address",
    "blacklist_doubt", "sanctioned", "money_laundering", "financial_crime",
    "cybercrime", "is_honeypot"
  ]);

  const signals = [...addressFlags, ...tokenFlags, ...taxSignals];
  const hasHighRiskFlag = signals.some(signal => severeKeys.has(signal.key));

  return {
    address,
    chainId,
    addressRecord,
    tokenRecord,
    addressError: addressResult.status === "rejected" ? addressResult.reason.message : null,
    tokenError: tokenResult.status === "rejected" ? tokenResult.reason.message : null,
    addressFlags,
    tokenFlags: [...tokenFlags, ...taxSignals],
    signals,
    hasAddressData: Boolean(addressRecord),
    hasTokenData: Boolean(tokenRecord),
    hasHighRiskFlag
  };
}

window.SafeWalletGoPlus = { scanAddress };

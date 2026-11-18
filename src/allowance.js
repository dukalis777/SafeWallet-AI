const RPC_NETWORKS = {
  ethereum: {
    label: "Ethereum",
    chainId: 1,
    endpoints: [
      "https://ethereum-rpc.publicnode.com",
      "https://cloudflare-eth.com"
    ]
  },
  base: {
    label: "Base",
    chainId: 8453,
    endpoints: [
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com"
    ]
  },
  bnb: {
    label: "BNB Chain",
    chainId: 56,
    endpoints: [
      "https://bsc-dataseed.bnbchain.org",
      "https://bsc-rpc.publicnode.com"
    ]
  }
};

const UINT256_MAX = (1n << 256n) - 1n;

function isValidEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

async function rpcRequest(endpoint, method, params) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`RPC HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(payload.error.message || "RPC request failed");
    }
    if (!("result" in payload)) {
      throw new Error("RPC returned no result");
    }

    return payload.result;
  } finally {
    clearTimeout(timeoutId);
  }
}

function encodeAddress(value) {
  return value.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function decodeUint256(hexValue) {
  if (typeof hexValue !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hexValue)) {
    throw new Error("The token returned an invalid allowance value.");
  }
  return BigInt(hexValue);
}

function decodeDecimals(hexValue) {
  if (typeof hexValue !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hexValue)) {
    return null;
  }
  const value = Number(BigInt(hexValue));
  return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
}

function formatUnits(value, decimals) {
  if (decimals === null) return value.toString() + " (raw units)";
  if (decimals === 0) return value.toString();

  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) return whole.toString();

  let fractionalText = fraction.toString().padStart(decimals, "0");
  const truncated = fractionalText.length > 6 && /[1-9]/.test(fractionalText.slice(6));
  fractionalText = fractionalText.slice(0, 6).replace(/0+$/, "");
  return whole.toString() + (fractionalText ? "." + fractionalText : "") + (truncated ? "…" : "");
}

async function checkAllowance(networkKey, ownerAddress, tokenAddress, spenderAddress) {
  const network = RPC_NETWORKS[networkKey];
  if (!network) {
    throw new Error("Allowance checks are currently available only on Ethereum, Base, and BNB Chain.");
  }

  for (const endpoint of network.endpoints) {
    try {
      const chainIdHex = await rpcRequest(endpoint, "eth_chainId", []);
      const actualChainId = Number(BigInt(chainIdHex));
      if (actualChainId !== network.chainId) {
        throw new Error("RPC endpoint returned the wrong network.");
      }

      // ERC-20 allowance(address owner, address spender) selector: 0xdd62ed3e
      const allowanceCall = "0xdd62ed3e" + encodeAddress(ownerAddress) + encodeAddress(spenderAddress);
      // ERC-20 decimals() selector: 0x313ce567
      const [allowanceHex, decimalsHex] = await Promise.all([
        rpcRequest(endpoint, "eth_call", [{ to: tokenAddress, data: allowanceCall }, "latest"]),
        rpcRequest(endpoint, "eth_call", [{ to: tokenAddress, data: "0x313ce567" }, "latest"])
          .catch(() => null)
      ]);

      const allowance = decodeUint256(allowanceHex);
      const decimals = decodeDecimals(decimalsHex);
      let status;
      if (allowance === 0n) {
        status = "zero";
      } else if (allowance === UINT256_MAX) {
        status = "unlimited";
      } else if (allowance >= UINT256_MAX / 2n) {
        status = "very-large";
      } else {
        status = "active";
      }

      return {
        network: network.label,
        chainId: network.chainId,
        ownerAddress,
        tokenAddress,
        spenderAddress,
        allowance,
        decimals,
        formattedAllowance: formatUnits(allowance, decimals),
        status,
        rpcHost: new URL(endpoint).host
      };
    } catch (error) {
      // Try the next public endpoint if the current one is unavailable.
      if (endpoint === network.endpoints[network.endpoints.length - 1]) {
        throw error;
      }
    }
  }

  throw new Error("No public RPC endpoint was available.");
}

window.SafeWalletAllowance = { checkAllowance, isValidEvmAddress };

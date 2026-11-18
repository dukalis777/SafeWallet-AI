# SafeWallet AI

An early Chrome Extension (Manifest V3) prototype for a Web3 security assistant.

## Prototype v0.4.1
- GoPlus Security lookups for wallet address reputation and token security.
- Automatic recent-history ERC-20 approval scan for a public wallet address on Ethereum, Base, and BNB Chain.
- Filters ERC-20 `Approval(address,address,uint256)` logs by the indexed owner address.
- Reads the current allowance for each discovered token + spender pair with read-only `eth_call`.
- Flags zero, active, very large, and maximum uint256 allowances.
- Retains a manual allowance checker for one specific owner + token + spender tuple.
- Does not connect a wallet, request signatures, send transactions, or revoke permissions.

## Load locally in Chrome
1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the project folder containing `manifest.json`.

## Automatic approval scan scope
The automatic scan searches the most recent 50,000 blocks for ERC-20 Approval events, using 1,000-block requests and adaptive smaller ranges when an RPC provider rejects a query. It probes `eth_getLogs` on a single block to skip providers that refuse the method. It then reads the current `allowance(owner, spender)` for each distinct token + spender pair found in that range.

This is a bounded recent-history scan, not a complete lifetime scan. Approvals created before the searched block range can be missed if they remain active. ERC-721 / ERC-1155 operator approvals and some signature-based permissions are not included. The scan is capped at 500 distinct token + spender pairs and reports when the cap is reached. Public RPC providers can rate-limit requests or limit log queries. Ethereum uses PublicNode with LlamaRPC as a fallback; Base and BNB Chain use PublicNode and their chain-provided public endpoints.

A pair that currently returns zero may have been revoked or otherwise reduced to zero. The extension never changes an approval.

## Data and privacy
When a user runs a GoPlus check, the public address is sent to GoPlus Security. During automatic approval scanning, the public wallet address is used in a read-only `eth_getLogs` query to the selected public RPC provider; token contract calls use `eth_call`. No seed phrase or private key is requested or sent.

## Important limitations
This is an experimental prototype, not a security product or audit. A zero result within the scanned range does not prove the wallet has no older approvals. A non-zero or unlimited allowance is not automatically malicious; review whether the spender is trusted and whether the approval is necessary.

Never rely on this prototype alone to approve transactions or protect funds.

## Planned development
1. Add NFT operator-approval discovery.
2. Integrate a complete indexed approvals provider for lifetime wallet-wide coverage, without embedding API secrets in the extension.
3. Add transaction simulation and approval risk analysis.
4. Explore Supra-specific data and integrations.

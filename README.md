# SafeWallet AI

An early Chrome Extension (Manifest V3) prototype for a Web3 security assistant.

## Prototype v0.5.0
- GoPlus Security lookups for wallet address reputation and token security.
- Configurable recent-history scan (50,000 / 250,000 / 500,000 / 1,000,000 blocks).
- ERC-20 allowance discovery using indexed `Approval(address,address,uint256)` events.
- ERC-721 per-token approval discovery using the same `Approval` event signature, distinguished by its four indexed topics, with current-state checks via `ownerOf` and `getApproved`.
- ERC-721 / ERC-1155 operator approval discovery using `ApprovalForAll(address,address,bool)`, with current-state checks via `isApprovedForAll`.
- Current permissions are re-read on-chain; old revoke events are not mistaken for currently active permissions.
- Flags zero, active, very large, and maximum uint256 ERC-20 allowances.
- Retains a manual allowance checker for one specific owner + token + spender tuple.
- Does not connect a wallet, request signatures, send transactions, or revoke permissions.

## Etherscan API key setup
1. Create a free Etherscan account and API key at https://etherscan.io/myapikey.
2. Open the SafeWallet AI extension.
3. Under **Automatic ERC-20 approval scan**, paste the key into the Etherscan API key field and choose **Save key locally**.
4. The key is stored in `chrome.storage.local` in that browser profile; it is not included in this GitHub repository.
5. The key is sent to Etherscan API V2 when the extension requests indexed logs.

Etherscan documents a free plan with 3 calls per second and up to 100,000 calls per day; free access is limited to selected chains and requires attribution. The Logs API returns up to 1,000 records per request, so the extension paginates results and caps a single scan at 20 pages (20,000 events). If the page cap is reached, the result is marked as incomplete. See:
- https://etherscan.io/api
- https://api.etherscan.io/apis
- https://info.etherscan.com/api-return-errors/

## Load locally in Chrome
1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the project folder containing `manifest.json`.

## Automatic approval scan scope
The scan queries Etherscan API V2 for ERC-20 / ERC-721 `Approval` events and ERC-721 / ERC-1155 `ApprovalForAll` events across the selected recent block range (50,000 / 250,000 / 500,000 / 1,000,000 blocks). It distinguishes ERC-20 approvals from ERC-721 token-specific approvals using the event's topic/data layout. Current ERC-20 allowances, ERC-721 `getApproved` + `ownerOf`, and NFT `isApprovedForAll` states are then read through a public RPC. Historical log queries are not sent to public RPC providers.

This is a bounded recent-history scan, not a complete lifetime scan. Approvals created before the selected block range can be missed if they remain active. Non-standard NFT permissions, signature-based permits, and approvals outside the selected history range are not included. Each event category is capped at 500 distinct contract + spender/token-ID pairs and 20 event pages. Public RPC providers can still rate-limit current-state `eth_call` requests. The extension uses one working public RPC endpoint for the latest block and current allowance reads; Etherscan is used for historical event indexing. An Etherscan free-plan key may not support every chain or every endpoint; the UI will show the provider response if a chain is unavailable.

ERC-721 single-token approvals are verified against current ownerOf and getApproved values. NFT operator approvals are verified with isApprovedForAll. The same ApprovalForAll event is used by ERC-721 and ERC-1155; ERC-165 interface checks are used to label recognized standards where available. A pair that currently returns zero may have been revoked or otherwise reduced to zero. The extension never changes an approval.

## Data and privacy
When a user runs a GoPlus check, the public address is sent to GoPlus Security. During an automatic approval scan, the public wallet address and API key are sent to Etherscan API V2 to retrieve indexed logs. Current allowance calls send the token address and call data to the selected public RPC endpoint. The API key is stored locally in Chrome storage and is never written to this repository. No seed phrase or private key is requested or sent.

## Important limitations
This is an experimental prototype, not a security product or audit. A zero result within the scanned range does not prove the wallet has no older approvals. A non-zero or unlimited allowance is not automatically malicious; review whether the spender is trusted and whether the approval is necessary.

Never rely on this prototype alone to approve transactions or protect funds.

## Planned development
1. Improve full-history coverage and pagination.
2. Add Permit2 and other signature-based allowance discovery.
3. Add transaction simulation and approval risk analysis.
4. Explore Supra-specific data and integrations.

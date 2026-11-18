# SafeWallet AI

An early Chrome Extension (Manifest V3) prototype for a Web3 security assistant.

## Prototype v0.3
- Chrome / Chromium extension popup.
- GoPlus Security lookups for wallet address reputation and token security.
- Read-only ERC-20 allowance checker for one manually supplied wallet + token + spender tuple.
- Uses `eth_call` against public Ethereum, Base, or BNB Chain RPC endpoints.
- Displays zero, active, very large, or maximum uint256 allowances.
- No wallet connection, seed phrase, private key, transaction signing, or revocation.

## Load locally in Chrome
1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the project folder containing `manifest.json`.

## Data and privacy
When a user runs a GoPlus check, the public address is sent to GoPlus Security. When a user checks an allowance, the wallet, token, and spender addresses are sent to the selected public RPC endpoint. The extension never asks for or transmits seed phrases or private keys.

Public RPC endpoints may be rate-limited or temporarily unavailable. Endpoints are configured with a fallback where available.

## Important limitations
This is an experimental prototype, not a security product or audit. The allowance checker reads only the exact owner + token + spender pair entered by the user. It does not discover every token approval in a wallet, revoke approvals, simulate transactions, or intercept wallet-signing requests. It currently supports EVM ERC-20 allowance calls on Ethereum, Base, and BNB Chain. Supra-specific allowance checks are not implemented.

A zero allowance for one pair does not mean the wallet has no other approvals. A non-zero or unlimited allowance is not automatically malicious; review whether the spender is trusted and whether the approval is necessary.

Never rely on this prototype alone to approve transactions or protect funds.

## Planned development
1. Integrate authenticated wallet-wide approval-management data without embedding secrets in the extension.
2. Add transaction simulation and approval risk analysis.
3. Explore Supra-specific data and integrations.
4. Design a safe pre-signing browser workflow.

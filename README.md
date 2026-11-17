# SafeWallet AI

An early Chrome Extension (Manifest V3) prototype for a Web3 security assistant.

## Prototype v0.2
- Chrome / Chromium extension popup.
- Network selector for Ethereum, Base, BNB Chain, and Supra.
- Live GoPlus Security lookups for EVM address reputation and token security on Ethereum, Base, and BNB Chain.
- Risk signals are displayed separately from a definitive safety verdict.
- Supra is shown in the UI, but its security lookup is not yet integrated.

## Load locally in Chrome
1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the project folder containing `manifest.json`.

## Data and privacy
When a user runs a check, the public address is sent to GoPlus Security's API. The extension does not ask for or transmit seed phrases or private keys. The current code does not read webpage content or intercept wallet-signing requests.

GoPlus publishes usage limits and access tiers that may vary by API product and account. Each check currently makes up to two requests (address reputation and token security). Check the current official documentation for applicable limits. See:
- https://docs.gopluslabs.io/reference/addresscontractusingget_1
- https://docs.gopluslabs.io/reference/response-details-1
- https://docs.gopluslabs.io/reference/support

## Important limitations
This is an experimental prototype, not a security product or audit. Risk databases can be incomplete or delayed. No returned warning does not prove an address or token is safe. The extension does not yet:
- Simulate the transaction the user is about to sign.
- Analyze wallet approvals or exact transaction calldata.
- Detect phishing websites.
- Provide AI-generated analysis.
- Perform Supra-specific security lookups.
- Block or intercept wallet transactions.

Never rely on this prototype alone to approve transactions or protect funds.

## Planned development
1. Add approval and transaction-risk analysis.
2. Add stronger explainable risk summaries and test cases.
3. Explore Supra-specific data and integrations.
4. Design a safe pre-signing browser workflow.

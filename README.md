# SafeWallet AI

An early Chrome Extension (Manifest V3) prototype for a Web3 security assistant.

## Current prototype (v0.1)
- Browser popup for Chrome and Chromium-based browsers.
- Network selector: Ethereum, Base, BNB Chain, and Supra.
- Basic EVM address-format validation.
- Clear distinction between address-format checks and actual security analysis.

## Load locally in Chrome
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the project folder containing `manifest.json`.

## Current limitations
This is an early prototype, not a security product. It does not yet:
- Detect malicious addresses or contracts.
- Analyze contract source code or token approvals.
- Simulate transactions or intercept wallet signing.
- Connect to an AI model or threat-intelligence provider.
- Integrate with Supra on-chain services.

A syntactically valid address is not necessarily safe. Never rely on this prototype to approve transactions or protect funds.

## Planned development
1. Add trusted threat-intelligence sources and explainable risk signals.
2. Inspect contract permissions and transaction details.
3. Design a browser-extension flow that warns users before signing.
4. Evaluate integrations with Supra infrastructure where technically appropriate.

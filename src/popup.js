const form = document.getElementById("scan-form");
const addressInput = document.getElementById("address");
const networkInput = document.getElementById("network");
const result = document.getElementById("result");

function validateAddress(address, network) {
  const value = address.trim();

  if (!value) {
    return { valid: false, message: "Paste an address first." };
  }

  if (network === "ethereum" || network === "base" || network === "bnb") {
    const valid = /^0x[a-fA-F0-9]{40}$/.test(value);
    return {
      valid,
      message: valid
        ? "The address matches the expected EVM format."
        : "This does not look like a standard EVM address (expected 0x followed by 40 hexadecimal characters)."
    };
  }

  // Supra address formats may differ by account/address type.
  // Avoid claiming full validation until official format handling is integrated.
  return {
    valid: value.length >= 10,
    message: value.length >= 10
      ? "Address entered. Full Supra address validation is not implemented yet."
      : "The entered value looks too short. Full Supra address validation is not implemented yet."
  };
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const network = networkInput.value;
  const address = addressInput.value.trim();
  const check = validateAddress(address, network);

  result.classList.remove("hidden");
  result.innerHTML = `
    <span class="tag">${check.valid ? "FORMAT CHECK" : "INPUT CHECK"}</span>
    <h3>${check.valid ? "Address format looks valid" : "Address needs attention"}</h3>
    <p>${check.message}</p>
    <p><strong>Network:</strong> ${network.toUpperCase()}</p>
    <p><strong>Important:</strong> A valid format does not mean an address or contract is safe. Threat-intelligence and on-chain analysis are not connected in this prototype.</p>
  `;
});
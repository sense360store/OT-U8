const ACCESS_HASH = "e15bf824a811af28abcef8b9ef0d74fbb4a8337816965ec29dba26ff484dc837";
const STORAGE_KEY = "ot_u8_gate";

async function sha256Hex(value) {
  if (!window.crypto?.subtle) {
    throw new Error("Secure hashing is not supported in this browser");
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyAccessCode(code) {
  if (!code) return false;
  const hash = await sha256Hex(code.trim());
  return hash === ACCESS_HASH;
}

function isAccessGranted() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch (error) {
    console.warn("Unable to read access flag", error);
    return false;
  }
}

function setAccessGranted() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch (error) {
    console.warn("Unable to persist access flag", error);
  }
}

function createGateElement({ onAccessGranted } = {}) {
  const container = document.createElement("div");
  container.className = "access-gate";

  const message = document.createElement("p");
  message.className = "access-gate__message";
  message.textContent = "Enter access code to unlock sign-in.";

  const form = document.createElement("form");
  form.className = "access-gate__form";
  form.setAttribute("aria-label", "Access code gate");

  const input = document.createElement("input");
  input.type = "password";
  input.name = "access-code";
  input.placeholder = "Access code";
  input.autocomplete = "off";
  input.required = true;

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "button";
  submit.textContent = "Unlock";

  const error = document.createElement("p");
  error.className = "access-gate__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const code = input.value;
    if (!code) {
      return;
    }
    submit.disabled = true;
    input.disabled = true;
    try {
      const isValid = await verifyAccessCode(code);
      if (isValid) {
        setAccessGranted();
        if (typeof onAccessGranted === "function") {
          onAccessGranted();
        }
      } else {
        error.textContent = "Incorrect code. Try again.";
        error.hidden = false;
      }
    } catch (err) {
      console.error(err);
      error.textContent = "Unable to verify code in this browser.";
      error.hidden = false;
    } finally {
      form.reset();
      submit.disabled = false;
      input.disabled = false;
      input.focus();
    }
  });

  form.append(input, submit);
  container.append(message, form, error);
  return container;
}

window.App = window.App || {};
window.App.access = {
  isAccessGranted,
  setAccessGranted,
  createGateElement,
};

export { isAccessGranted, setAccessGranted, createGateElement };

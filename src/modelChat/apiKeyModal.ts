import { setRuntimeCredentials } from "./apiKeyStore";
import { validateGeminiApiKey } from "./geminiValidation";

const STORAGE_KEY = "pewter_user_llm_credentials";

export type SavedCredentials = {
  apiKey: string;
  modelName: string;
};

export function loadSavedCredentials(): SavedCredentials | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.apiKey === "string" &&
      typeof parsed?.modelName === "string"
    ) {
      return {
        apiKey: parsed.apiKey.trim(),
        modelName: parsed.modelName.trim(),
      };
    }
  } catch {
    console.warn("Could not parse saved credentials.");
  }

  return null;
}

export function saveCredentials(apiKey: string, modelName: string): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      apiKey: apiKey.trim(),
      modelName: modelName.trim(),
    }),
  );
}

export function clearSavedCredentials(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function promptForCredentials(): Promise<SavedCredentials | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0, 0, 0, 0.7)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "99999";

    const modal = document.createElement("div");
    modal.style.width = "min(560px, 92vw)";
    modal.style.background = "#1e1e1e";
    modal.style.color = "white";
    modal.style.padding = "24px";
    modal.style.borderRadius = "12px";
    modal.style.boxShadow = "0 12px 30px rgba(0,0,0,0.4)";
    modal.style.fontFamily = "sans-serif";

    const title = document.createElement("h2");
    title.textContent = "Enter LLM Settings";
    title.style.marginTop = "0";

    const desc = document.createElement("p");
    desc.textContent =
      "Pewter needs a model name and API key to enable chat and tile editing.";

    const modelLabel = document.createElement("label");
    modelLabel.textContent = "Model name";
    modelLabel.style.display = "block";
    modelLabel.style.marginBottom = "6px";

    const modelInput = document.createElement("input");
    modelInput.type = "text";
    modelInput.placeholder = "gemini-2.5-flash";
    modelInput.value = "gemini-2.5-flash";
    modelInput.style.width = "100%";
    modelInput.style.padding = "10px";
    modelInput.style.marginBottom = "12px";
    modelInput.style.borderRadius = "8px";
    modelInput.style.border = "1px solid #555";
    modelInput.style.background = "#2a2a2a";
    modelInput.style.color = "white";
    modelInput.style.boxSizing = "border-box";

    const keyLabel = document.createElement("label");
    keyLabel.textContent = "API key";
    keyLabel.style.display = "block";
    keyLabel.style.marginBottom = "6px";

    const keyInput = document.createElement("input");
    keyInput.type = "password";
    keyInput.placeholder = "Paste your Gemini API key";
    keyInput.style.width = "100%";
    keyInput.style.padding = "10px";
    keyInput.style.marginBottom = "12px";
    keyInput.style.borderRadius = "8px";
    keyInput.style.border = "1px solid #555";
    keyInput.style.background = "#2a2a2a";
    keyInput.style.color = "white";
    keyInput.style.boxSizing = "border-box";

    const rememberRow = document.createElement("label");
    rememberRow.style.display = "flex";
    rememberRow.style.alignItems = "center";
    rememberRow.style.gap = "8px";
    rememberRow.style.marginBottom = "12px";

    const rememberCheckbox = document.createElement("input");
    rememberCheckbox.type = "checkbox";

    const rememberText = document.createElement("span");
    rememberText.textContent = "Remember on this device";

    rememberRow.appendChild(rememberCheckbox);
    rememberRow.appendChild(rememberText);

    const errorText = document.createElement("div");
    errorText.style.color = "#ff8a8a";
    errorText.style.minHeight = "20px";
    errorText.style.marginBottom = "12px";

    const buttonRow = document.createElement("div");
    buttonRow.style.display = "flex";
    buttonRow.style.gap = "10px";
    buttonRow.style.justifyContent = "flex-end";

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.style.padding = "10px 16px";

    const submitButton = document.createElement("button");
    submitButton.textContent = "Continue";
    submitButton.style.padding = "10px 16px";

    buttonRow.appendChild(cancelButton);
    buttonRow.appendChild(submitButton);

    modal.appendChild(title);
    modal.appendChild(desc);
    modal.appendChild(modelLabel);
    modal.appendChild(modelInput);
    modal.appendChild(keyLabel);
    modal.appendChild(keyInput);
    modal.appendChild(rememberRow);
    modal.appendChild(errorText);
    modal.appendChild(buttonRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modelInput.focus();

    const cleanup = () => {
      overlay.remove();
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    const submit = async () => {
      const apiKey = keyInput.value.trim();
      const modelName = modelInput.value.trim();

      errorText.textContent = "";

      if (!modelName) {
        errorText.textContent = "Please enter a model name.";
        return;
      }

      if (!apiKey) {
        errorText.textContent = "Please enter an API key.";
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Checking...";

      const result = await validateGeminiApiKey(apiKey, modelName);

      submitButton.disabled = false;
      submitButton.textContent = "Continue";

      if (!result.ok) {
        errorText.textContent = result.message;
        return;
      }

      setRuntimeCredentials(apiKey, modelName);

      if (rememberCheckbox.checked) {
        saveCredentials(apiKey, modelName);
      } else {
        clearSavedCredentials();
      }

      cleanup();
      resolve({ apiKey, modelName });
    };

    cancelButton.addEventListener("click", cancel);
    submitButton.addEventListener("click", () => {
      void submit();
    });

    const handleEnter = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        void submit();
      }
    };

    modelInput.addEventListener("keydown", handleEnter);
    keyInput.addEventListener("keydown", handleEnter);
  });
}

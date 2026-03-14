let runtimeApiKey: string | null = null;
let runtimeModelName: string | null = null;

const envApiKey = import.meta.env.VITE_LLM_API_KEY?.trim() || null;
const envModelName = import.meta.env.VITE_LLM_MODEL_NAME?.trim() || null;

export function getApiKey(): string | null {
  return envApiKey || runtimeApiKey;
}

export function getModelName(): string {
  return envModelName || runtimeModelName || "gemini-2.5-flash";
}

export function setRuntimeCredentials(key: string, modelName: string): void {
  runtimeApiKey = key.trim();
  runtimeModelName = modelName.trim();
}

export function setRuntimeApiKey(key: string): void {
  runtimeApiKey = key.trim();
}

export function setRuntimeModelName(modelName: string): void {
  runtimeModelName = modelName.trim();
}

export function clearRuntimeCredentials(): void {
  runtimeApiKey = null;
  runtimeModelName = null;
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

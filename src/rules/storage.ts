const PREFIX = "aerostation.";

export const storageKeys = {
  versions: `${PREFIX}rulePackage.versions`,
  editingDrafts: `${PREFIX}rulePackage.editingDrafts`,
  conflictDrafts: `${PREFIX}rulePackage.conflictDrafts`,
  savedConfigs: `${PREFIX}savedConfigs`,
  activeStore: `${PREFIX}activeStore`,
} as const;

export function loadJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

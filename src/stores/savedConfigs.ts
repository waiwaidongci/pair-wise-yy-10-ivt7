import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { SavedConfig } from "../types/rulePackage";
import { useRulePackageStore } from "./rulePackages";
import { migrateSavedConfigs } from "../utils/migrate";

const STORAGE_KEY = "aero.savedConfigs.v1";

function loadFromStorage(): SavedConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedConfig[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Fall through to empty list.
  }
  return [];
}

export const useSavedConfigsStore = defineStore("savedConfigs", () => {
  const rulePackageStore = useRulePackageStore();
  const savedConfigs = ref<SavedConfig[]>([]);

  const staleCount = computed(() => savedConfigs.value.filter((entry) => entry.stale).length);

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedConfigs.value));
    } catch {
      // Storage may be unavailable; state remains in memory.
    }
  }

  function initialize() {
    if (savedConfigs.value.length) return;
    savedConfigs.value = migrateSavedConfigs(loadFromStorage());
    refreshAllStaleness();
  }

  function saveConfig(entry: Omit<SavedConfig, "id" | "savedAt" | "stale" | "staleReasons">) {
    const saved: SavedConfig = {
      ...entry,
      id: `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: Date.now(),
      stale: false,
      staleReasons: [],
    };
    savedConfigs.value.unshift(saved);
    persist();
    return saved;
  }

  function deleteConfig(id: string) {
    savedConfigs.value = savedConfigs.value.filter((entry) => entry.id !== id);
    persist();
  }

  function updateConfig(updated: SavedConfig) {
    const index = savedConfigs.value.findIndex((entry) => entry.id === updated.id);
    if (index === -1) return;
    savedConfigs.value[index] = { ...updated };
    persist();
  }

  function refreshAllStaleness() {
    savedConfigs.value = rulePackageStore.refreshStaleness(savedConfigs.value);
    persist();
  }

  // Recompute staleness whenever the active rule package changes.
  watch(
    () => rulePackageStore.currentPackage.version,
    () => refreshAllStaleness(),
  );

  return {
    savedConfigs,
    staleCount,
    initialize,
    saveConfig,
    deleteConfig,
    updateConfig,
    refreshAllStaleness,
  };
});

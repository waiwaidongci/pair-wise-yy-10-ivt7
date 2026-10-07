import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { RulePackage, SavedConfig } from "../types/rulePackage";
import { buildInitialPackage, DEFAULT_PACKAGE_ID } from "../data/defaultRulePackage";
import { diffPackages, isDiffEmpty } from "../utils/diff";
import { computeStaleness } from "../utils/staleness";

const STORAGE_KEY = "aero.rulePackages.v1";

function nextVersion(current: string): string {
  const parts = current.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return "1.0.0";
  return `${parts[0]}.${parts[1] + 1}.0`;
}

function clonePackage(pkg: RulePackage): RulePackage {
  return {
    ...pkg,
    prices: { ...pkg.prices },
    rules: pkg.rules.map((rule) => ({ ...rule, when: { ...rule.when }, requires: rule.requires ? { ...rule.requires } : undefined, forbids: rule.forbids ? { ...rule.forbids } : undefined })),
  };
}

export const useRulePackageStore = defineStore("rulePackages", () => {
  const packages = ref<RulePackage[]>([]);
  const currentStore = ref<string>("门店 A");
  const simulatePublishFailure = ref(false);
  const lastPublishError = ref("");

  const publishedPackages = computed(() =>
    packages.value
      .filter((pkg) => pkg.status === "published")
      .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true })),
  );

  const currentPackage = computed<RulePackage>(
    () => publishedPackages.value.find((pkg) => pkg.id === DEFAULT_PACKAGE_ID) ?? publishedPackages.value[0] ?? buildInitialPackage(),
  );

  const drafts = computed(() => packages.value.filter((pkg) => pkg.status === "draft"));

  /**
   * Conflicting drafts: two or more drafts based on the same published version
   * but edited by different stores.
   */
  const conflicts = computed(() => {
    const groups = new Map<string, RulePackage[]>();
    for (const draft of drafts.value) {
      const key = `${draft.id}@${draft.basedOn ?? ""}`;
      const list = groups.get(key) ?? [];
      list.push(draft);
      groups.set(key, list);
    }
    return Array.from(groups.values()).filter(
      (list) => list.length > 1 && new Set(list.map((draft) => draft.editedBy)).size > 1,
    );
  });

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(packages.value));
    } catch {
      // Storage may be unavailable; state remains in memory.
    }
  }

  function initialize() {
    if (packages.value.length) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RulePackage[];
        if (Array.isArray(parsed) && parsed.length) {
          packages.value = parsed;
          return;
        }
      }
    } catch {
      // Fall through to seed initial data.
    }
    packages.value = [buildInitialPackage()];
    persist();
  }

  function setCurrentStore(name: string) {
    currentStore.value = name;
  }

  /** Create a new draft based on the current published package. */
  function createDraft(editedBy: string = currentStore.value): RulePackage {
    const base = currentPackage.value;
    const now = Date.now();
    const draft: RulePackage = {
      ...clonePackage(base),
      status: "draft",
      version: `${base.version}-draft-${now}`,
      basedOn: base.version,
      editedBy,
      publishedAt: null,
      createdAt: now,
      changelog: "",
    };
    packages.value.push(draft);
    persist();
    return draft;
  }

  function updateDraft(updated: RulePackage) {
    const index = packages.value.findIndex((pkg) => pkg.version === updated.version && pkg.status === "draft");
    if (index === -1) return;
    packages.value[index] = clonePackage(updated);
    persist();
  }

  function deleteDraft(version: string) {
    packages.value = packages.value.filter((pkg) => !(pkg.version === version && pkg.status === "draft"));
    persist();
  }

  /**
   * Publish a draft. On failure, roll back to the previously published version.
   * Returns the published package, or throws if publishing failed (after rollback).
   */
  function publishDraft(draftVersion: string): RulePackage {
    const draft = packages.value.find((pkg) => pkg.version === draftVersion && pkg.status === "draft");
    if (!draft) throw new Error("草稿不存在或已发布。");

    // Snapshot current published state for rollback.
    const previousPublished = publishedPackages.value.map((pkg) => clonePackage(pkg));
    const previousCurrentVersion = currentPackage.value.version;

    try {
      if (simulatePublishFailure.value) {
        throw new Error("模拟发布失败：事务提交中断。");
      }

      const targetVersion = nextVersion(previousCurrentVersion);
      const now = Date.now();

      // Archive the current published package.
      for (const pkg of packages.value) {
        if (pkg.status === "published" && pkg.id === draft.id) {
          pkg.status = "archived";
        }
      }

      // Promote the draft to published with the new version.
      const index = packages.value.findIndex((pkg) => pkg.version === draftVersion);
      packages.value[index] = {
        ...clonePackage(draft),
        status: "published",
        version: targetVersion,
        publishedAt: now,
        basedOn: undefined,
        editedBy: undefined,
      };

      // Discard any remaining drafts for this package (they are now stale).
      packages.value = packages.value.filter((pkg) => !(pkg.status === "draft" && pkg.id === draft.id));

      persist();
      lastPublishError.value = "";
      return packages.value.find((pkg) => pkg.version === targetVersion)!;
    } catch (error) {
      // Rollback: restore the previous published state.
      packages.value = packages.value.filter((pkg) => pkg.status !== "published");
      for (const restored of previousPublished) {
        packages.value.push(restored);
      }
      // Keep the failed draft so the user can retry.
      persist();
      lastPublishError.value = error instanceof Error ? error.message : "发布失败，已回滚到上一版。";
      throw error;
    }
  }

  /** Roll back to a specific published version (re-publishes it as the current version). */
  function rollbackTo(version: string) {
    const target = publishedPackages.value.find((pkg) => pkg.version === version);
    if (!target) throw new Error("目标版本不存在。");
    const now = Date.now();

    // Archive current published.
    for (const pkg of packages.value) {
      if (pkg.status === "published" && pkg.id === target.id) {
        pkg.status = "archived";
      }
    }

    // Re-publish the target with a fresh timestamp.
    const index = packages.value.findIndex((pkg) => pkg.version === version);
    packages.value[index] = { ...clonePackage(target), status: "published", publishedAt: now };

    persist();
  }

  /** Recompute staleness for a list of saved configs against the current package. */
  function refreshStaleness(configs: SavedConfig[]): SavedConfig[] {
    const current = currentPackage.value;
    return configs.map((entry) => {
      const referenced =
        publishedPackages.value.find((pkg) => pkg.version === entry.rulePackageVersion) ??
        packages.value.find((pkg) => pkg.version === entry.rulePackageVersion) ??
        buildInitialPackage();
      const result = computeStaleness(entry.configuration, referenced, current);
      return { ...entry, stale: result.stale, staleReasons: result.reasons };
    });
  }

  function diffWithCurrent(pkg: RulePackage) {
    return diffPackages(pkg, currentPackage.value);
  }

  function hasChanges(pkg: RulePackage): boolean {
    return !isDiffEmpty(diffPackages(pkg, currentPackage.value));
  }

  return {
    packages,
    currentStore,
    simulatePublishFailure,
    lastPublishError,
    publishedPackages,
    currentPackage,
    drafts,
    conflicts,
    initialize,
    setCurrentStore,
    createDraft,
    updateDraft,
    deleteDraft,
    publishDraft,
    rollbackTo,
    refreshStaleness,
    diffWithCurrent,
    hasChanges,
  };
});

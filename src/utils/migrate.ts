import type { SavedConfig } from "../types/rulePackage";
import { DEFAULT_PACKAGE_ID } from "../data/defaultRulePackage";

export const LEGACY_RULE_VERSION = "1.0.0";

/**
 * Upgrade legacy saved configurations that predate rule-package versioning.
 * Any entry missing a rule package reference is assigned the first version (v1.0.0).
 */
export function migrateSavedConfigs(configs: SavedConfig[]): SavedConfig[] {
  let didMigrate = false;
  const upgraded = configs.map((entry) => {
    if (entry.rulePackageVersion) return entry;
    didMigrate = true;
    return {
      ...entry,
      rulePackageId: entry.rulePackageId || DEFAULT_PACKAGE_ID,
      rulePackageVersion: LEGACY_RULE_VERSION,
      stale: false,
      staleReasons: [],
    };
  });
  if (didMigrate) {
    // Persist the upgraded shape back to storage.
    try {
      localStorage.setItem("aero.savedConfigs.v1", JSON.stringify(upgraded));
    } catch {
      // Storage may be unavailable; migration still applies in memory.
    }
  }
  return upgraded;
}

/**
 * Decode a legacy share payload. Old links encode `{ v: 1, ...configuration }`
 * with no rule package reference; treat them as referencing the first version.
 */
export function migrateSharedPayload(parsed: Record<string, unknown>): {
  rulePackageId: string;
  rulePackageVersion: string;
} {
  const rulePackageId = typeof parsed.rulePackageId === "string" ? parsed.rulePackageId : DEFAULT_PACKAGE_ID;
  const rulePackageVersion =
    typeof parsed.rulePackageVersion === "string" ? parsed.rulePackageVersion : LEGACY_RULE_VERSION;
  return { rulePackageId, rulePackageVersion };
}

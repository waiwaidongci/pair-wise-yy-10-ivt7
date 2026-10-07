import type { Configuration, ProductSpec } from "./product";

export type GroupId = keyof Configuration;

/**
 * A dependency constraint. When the configuration matches `when`,
 * it must also satisfy every entry in `requires` and must not match
 * any entry in `forbids`.
 */
export interface DependencyRule {
  id: string;
  name: string;
  when: Partial<Record<GroupId, string>>;
  requires?: Partial<Record<GroupId, string>>;
  forbids?: Partial<Record<GroupId, string>>;
}

export type RulePackageStatus = "published" | "draft" | "archived";

/**
 * A versioned bundle of material prices and dependency rules.
 * Every saved configuration references the exact package version it was computed against.
 */
export interface RulePackage {
  id: string;
  version: string;
  status: RulePackageStatus;
  basePrice: number;
  /** optionId -> price delta over the base host price */
  prices: Record<string, number>;
  rules: DependencyRule[];
  changelog: string;
  publishedAt: number | null;
  createdAt: number;
  /** For drafts: the published version this draft was based on. */
  basedOn?: string;
  /** For drafts: the store (门店) that created this draft. */
  editedBy?: string;
}

export interface SavedConfig {
  id: string;
  name: string;
  configuration: Configuration;
  rulePackageId: string;
  rulePackageVersion: string;
  savedAt: number;
  /** Snapshot of the computed quote at save time. */
  price: number;
  /** Snapshot of the computed specs at save time. */
  specs: ProductSpec[];
  /** Whether the referenced package has changed in a way that affects this config. */
  stale: boolean;
  staleReasons: string[];
}

export interface PriceDiff {
  optionId: string;
  optionName: string;
  oldPrice: number | null;
  newPrice: number | null;
  kind: "added" | "removed" | "changed";
}

export interface RuleDiff {
  ruleId: string;
  ruleName: string;
  kind: "added" | "removed" | "changed";
  oldRule?: DependencyRule;
  newRule?: DependencyRule;
}

export interface PackageDiff {
  basePrice: { old: number; new: number } | null;
  prices: PriceDiff[];
  rules: RuleDiff[];
}

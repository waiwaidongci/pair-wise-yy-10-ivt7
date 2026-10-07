import type { DependencyRule, PackageDiff, PriceDiff, RuleDiff, RulePackage } from "../types/rulePackage";

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)));
    }
    return nested;
  });
}

function ruleSignature(rule: DependencyRule): string {
  return stableStringify({ when: rule.when, requires: rule.requires ?? {}, forbids: rule.forbids ?? {} });
}

/** Compute the difference between two rule packages (old -> new). */
export function diffPackages(oldPkg: RulePackage, newPkg: RulePackage): PackageDiff {
  const basePrice: PackageDiff["basePrice"] =
    oldPkg.basePrice !== newPkg.basePrice ? { old: oldPkg.basePrice, new: newPkg.basePrice } : null;

  const prices: PriceDiff[] = [];
  const optionIds = new Set([...Object.keys(oldPkg.prices), ...Object.keys(newPkg.prices)]);
  for (const optionId of optionIds) {
    const oldPrice = optionId in oldPkg.prices ? oldPkg.prices[optionId] : null;
    const newPrice = optionId in newPkg.prices ? newPkg.prices[optionId] : null;
    if (oldPrice === newPrice) continue;
    const kind = oldPrice === null ? "added" : newPrice === null ? "removed" : "changed";
    prices.push({ optionId, optionName: optionId, oldPrice, newPrice, kind });
  }

  const rules: RuleDiff[] = [];
  const oldRules = new Map(oldPkg.rules.map((rule) => [rule.id, rule]));
  const newRules = new Map(newPkg.rules.map((rule) => [rule.id, rule]));
  for (const [ruleId, oldRule] of oldRules) {
    const newRule = newRules.get(ruleId);
    if (!newRule) {
      rules.push({ ruleId, ruleName: oldRule.name, kind: "removed", oldRule });
    } else if (ruleSignature(oldRule) !== ruleSignature(newRule)) {
      rules.push({ ruleId, ruleName: newRule.name, kind: "changed", oldRule, newRule });
    }
  }
  for (const [ruleId, newRule] of newRules) {
    if (!oldRules.has(ruleId)) {
      rules.push({ ruleId, ruleName: newRule.name, kind: "added", newRule });
    }
  }

  return { basePrice, prices, rules };
}

export function isDiffEmpty(diff: PackageDiff): boolean {
  return diff.basePrice === null && diff.prices.length === 0 && diff.rules.length === 0;
}

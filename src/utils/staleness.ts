import type { Configuration } from "../types/product";
import type { DependencyRule, RulePackage } from "../types/rulePackage";
import { diffPackages } from "./diff";

/**
 * Check whether a configuration violates a dependency rule under the given package.
 * A rule applies when every `when` entry matches; then every `requires` entry must
 * match and no `forbids` entry may match.
 */
export function ruleApplies(rule: DependencyRule, configuration: Configuration): boolean {
  return Object.entries(rule.when).every(([groupId, value]) => configuration[groupId as keyof Configuration] === value);
}

export function ruleViolated(rule: DependencyRule, configuration: Configuration): boolean {
  if (!ruleApplies(rule, configuration)) return false;
  if (rule.requires && !Object.entries(rule.requires).every(([groupId, value]) => configuration[groupId as keyof Configuration] === value)) {
    return true;
  }
  if (rule.forbids && Object.entries(rule.forbids).some(([groupId, value]) => configuration[groupId as keyof Configuration] === value)) {
    return true;
  }
  return false;
}

export interface StalenessResult {
  stale: boolean;
  reasons: string[];
}

/**
 * Determine whether a saved configuration's snapshot is stale relative to the current
 * published package. Only changes that actually affect this specific configuration
 * invalidate it; unrelated changes let the config keep its old snapshot.
 */
export function computeStaleness(
  configuration: Configuration,
  referencedPackage: RulePackage,
  currentPackage: RulePackage,
): StalenessResult {
  if (referencedPackage.version === currentPackage.version) {
    return { stale: false, reasons: [] };
  }

  const diff = diffPackages(referencedPackage, currentPackage);
  const reasons: string[] = [];

  if (diff.basePrice) {
    reasons.push(`主机基础价由 ¥${diff.basePrice.old} 调整为 ¥${diff.basePrice.new}`);
  }

  for (const priceDiff of diff.prices) {
    const selected = configuration[priceDiff.optionId as keyof Configuration];
    if (selected === undefined) continue;
    // The option's own price changed and it is selected in this configuration.
    if (priceDiff.kind === "changed" && selected === priceDiff.optionId) {
      reasons.push(`选件「${priceDiff.optionName}」价格由 ¥${priceDiff.oldPrice} 调整为 ¥${priceDiff.newPrice}`);
    }
  }

  for (const ruleDiff of diff.rules) {
    if (ruleDiff.kind === "removed" && ruleDiff.oldRule) {
      // A removed rule no longer constrains this configuration; specs may change.
      if (ruleApplies(ruleDiff.oldRule, configuration)) {
        reasons.push(`依赖规则「${ruleDiff.ruleName}」已移除，相关规格需重算`);
      }
    } else if (ruleDiff.kind === "added" && ruleDiff.newRule) {
      if (ruleViolated(ruleDiff.newRule, configuration)) {
        reasons.push(`新增依赖规则「${ruleDiff.ruleName}」与当前组合冲突`);
      }
    } else if (ruleDiff.kind === "changed" && ruleDiff.oldRule && ruleDiff.newRule) {
      const wasViolated = ruleViolated(ruleDiff.oldRule, configuration);
      const isViolated = ruleViolated(ruleDiff.newRule, configuration);
      if (!wasViolated && isViolated) {
        reasons.push(`依赖规则「${ruleDiff.ruleName}」调整后与当前组合冲突`);
      } else if (wasViolated && !isViolated) {
        reasons.push(`依赖规则「${ruleDiff.ruleName}」调整后已解除冲突`);
      } else if (ruleApplies(ruleDiff.oldRule, configuration) || ruleApplies(ruleDiff.newRule, configuration)) {
        reasons.push(`依赖规则「${ruleDiff.ruleName}」已更新，相关规格需重算`);
      }
    }
  }

  return { stale: reasons.length > 0, reasons };
}

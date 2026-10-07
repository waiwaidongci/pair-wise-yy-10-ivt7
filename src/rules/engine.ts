import type { Configuration, GroupId, ProductSpec } from "../types/product";
import type { DependencyRule, RulePackageContent, SpecRule } from "../types/rules";

/** 报价 = 基础价 + 各配置组选中选项的物料价 */
export function evaluatePrice(content: RulePackageContent, configuration: Configuration): number {
  let total = content.basePrice;
  for (const group of content.groups) {
    const option = group.options.find((item) => item.id === configuration[group.id]);
    if (option) total += option.price;
  }
  return total;
}

function evaluateSpecRule(rule: SpecRule, configuration: Configuration): string {
  for (const specCase of rule.cases) {
    if (specCase.when.every((condition) => configuration[condition.group] === condition.option)) {
      return specCase.value;
    }
  }
  return rule.fallback;
}

/** 按规格规则决策表计算全部规格 */
export function evaluateSpecs(content: RulePackageContent, configuration: Configuration): ProductSpec[] {
  return content.specRules.map((rule) => ({ label: rule.label, value: evaluateSpecRule(rule, configuration) }));
}

/** 判断某条依赖规则在给定配置下是否被违反 */
export function isViolated(rule: DependencyRule, configuration: Configuration): boolean {
  if (configuration[rule.trigger.group] !== rule.trigger.option) return false;
  if (rule.requires && configuration[rule.requires.group] !== rule.requires.option) return true;
  if (rule.forbids && configuration[rule.forbids.group] === rule.forbids.option) return true;
  return false;
}

/** 当前配置第一条被违反的依赖规则提示 */
export function dependencyMessage(content: RulePackageContent, configuration: Configuration): string {
  const violated = content.dependencyRules.find((rule) => isViolated(rule, configuration));
  return violated?.message ?? "";
}

/**
 * 选项是否禁用：模拟选中后若违反依赖规则，且该规则的自动修正目标
 * 就是这个选项所在的组（即选了也会被立刻改掉的），则直接禁用。
 */
export function isOptionDisabled(
  content: RulePackageContent,
  configuration: Configuration,
  groupId: GroupId,
  optionId: string,
): boolean {
  const simulated: Configuration = { ...configuration, [groupId]: optionId };
  return content.dependencyRules.some((rule) => isViolated(rule, simulated) && rule.correct.group === groupId);
}

/**
 * 按依赖规则自动修正配置：
 * 1. 选中项在新版本规则包中已不存在时，回退到该组第一个选项；
 * 2. 违反依赖规则时，按规则的 correct 目标修正（可能级联，有界循环）。
 */
export function correctConfiguration(
  content: RulePackageContent,
  configuration: Configuration,
): { configuration: Configuration; corrections: string[] } {
  const next: Configuration = { ...configuration };
  const corrections: string[] = [];

  for (const group of content.groups) {
    if (!group.options.some((option) => option.id === next[group.id])) {
      const fallback = group.options[0];
      if (fallback) {
        next[group.id] = fallback.id;
        corrections.push(`${group.name}已改为「${fallback.name}」（原选项在当前规则包中不存在）。`);
      }
    }
  }

  for (let guard = 0; guard < 12; guard += 1) {
    const violated = content.dependencyRules.find(
      (rule) => isViolated(rule, next) && next[rule.correct.group] !== rule.correct.option,
    );
    if (!violated) break;
    next[violated.correct.group] = violated.correct.option;
    corrections.push(violated.message);
  }

  return { configuration: next, corrections };
}

/** 规则包内容校验，发布前调用，不合法则抛出错误 */
export function validateContent(content: RulePackageContent): void {
  if (!Number.isFinite(content.basePrice) || content.basePrice < 0) {
    throw new Error("基础价必须是不小于 0 的数字。");
  }
  if (!content.groups.length) throw new Error("规则包至少包含一个配置组。");
  const ruleIds = new Set<string>();
  for (const rule of content.dependencyRules) {
    if (ruleIds.has(rule.id)) throw new Error(`依赖规则 id 重复：${rule.id}`);
    ruleIds.add(rule.id);
    if (!rule.message.trim()) throw new Error(`依赖规则 ${rule.id} 缺少提示文案。`);
  }
  for (const group of content.groups) {
    if (!group.options.length) throw new Error(`配置组「${group.name}」至少需要一个选项。`);
    const optionIds = new Set<string>();
    for (const option of group.options) {
      if (optionIds.has(option.id)) throw new Error(`配置组「${group.name}」内选项 id 重复：${option.id}`);
      optionIds.add(option.id);
      if (!Number.isFinite(option.price) || option.price < 0) {
        throw new Error(`选项「${option.name}」的物料价必须是不小于 0 的数字。`);
      }
    }
  }
  for (const spec of content.specRules) {
    if (!spec.label.trim()) throw new Error("规格规则缺少名称。");
    if (!spec.fallback.trim()) throw new Error(`规格「${spec.label}」缺少默认值。`);
  }
}

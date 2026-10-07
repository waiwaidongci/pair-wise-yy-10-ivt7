import type { ChangeSet, DependencyRule, RulePackageContent, SpecRule } from "../types/rules";
import { formatPrice } from "../utils/share";

function sameRule(a: DependencyRule, b: DependencyRule): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameSpecRule(a: SpecRule, b: SpecRule): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 对比两个规则包版本的内容，产出差异集合 */
export function diffContents(before: RulePackageContent, after: RulePackageContent): ChangeSet {
  const changeSet: ChangeSet = {
    optionPriceChanges: [],
    optionsAdded: [],
    optionsRemoved: [],
    dependencyRulesAdded: [],
    dependencyRulesRemoved: [],
    dependencyRulesModified: [],
    specRulesAdded: [],
    specRulesRemoved: [],
    specRulesModified: [],
  };

  if (before.basePrice !== after.basePrice) {
    changeSet.basePrice = { from: before.basePrice, to: after.basePrice };
  }

  for (const afterGroup of after.groups) {
    const beforeGroup = before.groups.find((group) => group.id === afterGroup.id);
    for (const afterOption of afterGroup.options) {
      const beforeOption = beforeGroup?.options.find((option) => option.id === afterOption.id);
      if (!beforeOption) {
        changeSet.optionsAdded.push({
          group: afterGroup.id,
          groupName: afterGroup.name,
          optionId: afterOption.id,
          optionName: afterOption.name,
        });
      } else if (beforeOption.price !== afterOption.price) {
        changeSet.optionPriceChanges.push({
          group: afterGroup.id,
          groupName: afterGroup.name,
          optionId: afterOption.id,
          optionName: afterOption.name,
          from: beforeOption.price,
          to: afterOption.price,
        });
      }
    }
  }

  for (const beforeGroup of before.groups) {
    const afterGroup = after.groups.find((group) => group.id === beforeGroup.id);
    for (const beforeOption of beforeGroup.options) {
      if (!afterGroup?.options.some((option) => option.id === beforeOption.id)) {
        changeSet.optionsRemoved.push({
          group: beforeGroup.id,
          groupName: beforeGroup.name,
          optionId: beforeOption.id,
          optionName: beforeOption.name,
        });
      }
    }
  }

  for (const afterRule of after.dependencyRules) {
    const beforeRule = before.dependencyRules.find((rule) => rule.id === afterRule.id);
    if (!beforeRule) changeSet.dependencyRulesAdded.push(afterRule);
    else if (!sameRule(beforeRule, afterRule)) changeSet.dependencyRulesModified.push({ before: beforeRule, after: afterRule });
  }
  for (const beforeRule of before.dependencyRules) {
    if (!after.dependencyRules.some((rule) => rule.id === beforeRule.id)) {
      changeSet.dependencyRulesRemoved.push(beforeRule);
    }
  }

  for (const afterSpec of after.specRules) {
    const beforeSpec = before.specRules.find((spec) => spec.key === afterSpec.key);
    if (!beforeSpec) changeSet.specRulesAdded.push(afterSpec);
    else if (!sameSpecRule(beforeSpec, afterSpec)) changeSet.specRulesModified.push({ before: beforeSpec, after: afterSpec });
  }
  for (const beforeSpec of before.specRules) {
    if (!after.specRules.some((spec) => spec.key === beforeSpec.key)) {
      changeSet.specRulesRemoved.push(beforeSpec);
    }
  }

  return changeSet;
}

function describeRule(rule: DependencyRule): string {
  const parts = [`当 ${rule.trigger.group}=${rule.trigger.option}`];
  if (rule.requires) parts.push(`要求 ${rule.requires.group}=${rule.requires.option}`);
  if (rule.forbids) parts.push(`禁止 ${rule.forbids.group}=${rule.forbids.option}`);
  parts.push(`修正为 ${rule.correct.group}=${rule.correct.option}`);
  return parts.join("，");
}

/**
 * 把一份差异集合（某门店基于旧版本的改动）合并到当前线上内容之上：
 * 两边的改动都保留；同一处都被修改时，以确认方（source）的值为准。
 * source 用于取回新增选项/规则的完整数据。
 */
export function applyChangeSet(
  current: RulePackageContent,
  changeSet: ChangeSet,
  source: RulePackageContent,
): RulePackageContent {
  const merged: RulePackageContent = JSON.parse(JSON.stringify(current)) as RulePackageContent;

  if (changeSet.basePrice) merged.basePrice = changeSet.basePrice.to;

  for (const change of changeSet.optionPriceChanges) {
    const option = merged.groups.find((group) => group.id === change.group)?.options.find((item) => item.id === change.optionId);
    if (option) option.price = change.to;
  }
  for (const added of changeSet.optionsAdded) {
    const sourceOption = source.groups.find((group) => group.id === added.group)?.options.find((item) => item.id === added.optionId);
    const group = merged.groups.find((item) => item.id === added.group);
    if (sourceOption && group && !group.options.some((item) => item.id === sourceOption.id)) {
      group.options.push(JSON.parse(JSON.stringify(sourceOption)) as typeof sourceOption);
    }
  }
  for (const removed of changeSet.optionsRemoved) {
    const group = merged.groups.find((item) => item.id === removed.group);
    if (group) group.options = group.options.filter((item) => item.id !== removed.optionId);
  }

  for (const rule of changeSet.dependencyRulesAdded) {
    if (!merged.dependencyRules.some((item) => item.id === rule.id)) {
      merged.dependencyRules.push(JSON.parse(JSON.stringify(rule)) as DependencyRule);
    }
  }
  for (const { after } of changeSet.dependencyRulesModified) {
    const index = merged.dependencyRules.findIndex((item) => item.id === after.id);
    const copy = JSON.parse(JSON.stringify(after)) as DependencyRule;
    if (index >= 0) merged.dependencyRules[index] = copy;
    else merged.dependencyRules.push(copy);
  }
  for (const rule of changeSet.dependencyRulesRemoved) {
    merged.dependencyRules = merged.dependencyRules.filter((item) => item.id !== rule.id);
  }

  for (const spec of changeSet.specRulesAdded) {
    if (!merged.specRules.some((item) => item.key === spec.key)) {
      merged.specRules.push(JSON.parse(JSON.stringify(spec)) as SpecRule);
    }
  }
  for (const { after } of changeSet.specRulesModified) {
    const index = merged.specRules.findIndex((item) => item.key === after.key);
    const copy = JSON.parse(JSON.stringify(after)) as SpecRule;
    if (index >= 0) merged.specRules[index] = copy;
    else merged.specRules.push(copy);
  }
  for (const spec of changeSet.specRulesRemoved) {
    merged.specRules = merged.specRules.filter((item) => item.key !== spec.key);
  }

  return merged;
}

/** 把差异集合转成给人看的中文描述列表 */
export function describeChangeSet(changeSet: ChangeSet): string[] {

  const lines: string[] = [];
  if (changeSet.basePrice) {
    lines.push(`基础价：${formatPrice(changeSet.basePrice.from)} → ${formatPrice(changeSet.basePrice.to)}`);
  }
  for (const change of changeSet.optionPriceChanges) {
    lines.push(`物料价 · ${change.groupName} / ${change.optionName}：${formatPrice(change.from)} → ${formatPrice(change.to)}`);
  }
  for (const added of changeSet.optionsAdded) {
    lines.push(`新增选项 · ${added.groupName} / ${added.optionName}`);
  }
  for (const removed of changeSet.optionsRemoved) {
    lines.push(`移除选项 · ${removed.groupName} / ${removed.optionName}`);
  }
  for (const rule of changeSet.dependencyRulesAdded) {
    lines.push(`新增依赖规则 · ${rule.message}（${describeRule(rule)}）`);
  }
  for (const rule of changeSet.dependencyRulesRemoved) {
    lines.push(`移除依赖规则 · ${rule.message}`);
  }
  for (const { before, after } of changeSet.dependencyRulesModified) {
    lines.push(`修改依赖规则 · ${before.message} → ${after.message}`);
  }
  for (const spec of changeSet.specRulesAdded) {
    lines.push(`新增规格规则 · ${spec.label}`);
  }
  for (const spec of changeSet.specRulesRemoved) {
    lines.push(`移除规格规则 · ${spec.label}`);
  }
  for (const { before, after } of changeSet.specRulesModified) {
    lines.push(`修改规格规则 · ${after.label}（分支 ${before.cases.length} → ${after.cases.length}，默认值「${before.fallback}」→「${after.fallback}」）`);
  }
  return lines;
}

import type { DependencyRule, RulePackage } from "../types/rulePackage";

export const DEFAULT_PACKAGE_ID = "aero-s1";
export const DEFAULT_BASE_PRICE = 3299;

/**
 * The first rule package. Captures the prices and dependency rules that were
 * previously hardcoded in the configurator, so legacy data can be migrated to v1.0.0.
 */
export const defaultRules: DependencyRule[] = [
  {
    id: "battery-extended-metal",
    name: "长续航电池需金属机身",
    when: { battery: "extended" },
    requires: { material: "metal" },
  },
  {
    id: "stand-floor-metal",
    name: "落地支架需金属机身",
    when: { stand: "floor" },
    requires: { material: "metal" },
  },
  {
    id: "filter-hepa-wood",
    name: "医疗级滤芯不支持胡桃木",
    when: { filter: "hepa" },
    forbids: { material: "wood" },
  },
];

export const defaultPrices: Record<string, number> = {
  graphite: 0,
  ivory: 0,
  sage: 180,
  ocean: 240,
  matte: 0,
  metal: 680,
  wood: 980,
  standard: 0,
  hepa: 860,
  formaldehyde: 720,
  none: 0,
  extended: 980,
  desktop: 0,
  floor: 760,
  subtle: 0,
  copper: 260,
  "graphite-ring": 220,
};

export function buildInitialPackage(): RulePackage {
  const now = Date.now();
  return {
    id: DEFAULT_PACKAGE_ID,
    version: "1.0.0",
    status: "published",
    basePrice: DEFAULT_BASE_PRICE,
    prices: { ...defaultPrices },
    rules: defaultRules.map((rule) => ({ ...rule, when: { ...rule.when } })),
    changelog: "首版规则包：整合物料价与依赖规则。",
    publishedAt: now,
    createdAt: now,
  };
}

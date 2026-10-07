import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { CameraPreset, Configuration, ProductGroup, ProductSpec } from "../types/product";
import type { DependencyRule, RulePackage } from "../types/rulePackage";
import { useRulePackageStore } from "./rulePackages";
import { ruleViolated } from "../utils/staleness";

export const productGroups: ProductGroup[] = [
  {
    id: "color",
    name: "机身颜色",
    summary: "外壳阳极氧化与喷砂配色",
    options: [
      { id: "graphite", name: "石墨灰", description: "耐脏、适合办公环境", price: 0, swatch: "#343941" },
      { id: "ivory", name: "雾光白", description: "柔和明亮，适合居住空间", price: 0, swatch: "#e9e5dc" },
      { id: "sage", name: "鼠尾草绿", description: "低饱和限定配色", price: 180, swatch: "#758f7d" },
      { id: "ocean", name: "深海蓝", description: "限定批次，库存较少", price: 240, swatch: "#385a78" },
    ],
  },
  {
    id: "material",
    name: "外壳材质",
    summary: "影响触感、耐用度和净化结构",
    options: [
      { id: "matte", name: "哑光复合材质", description: "轻量且抗指纹", price: 0 },
      { id: "metal", name: "拉丝铝合金", description: "更高结构强度与金属质感", price: 680 },
      { id: "wood", name: "天然胡桃木", description: "手工饰面，不支持医疗滤芯", price: 980 },
    ],
  },
  {
    id: "filter",
    name: "滤芯系统",
    summary: "根据房间面积和敏感人群选择",
    options: [
      { id: "standard", name: "标准复合滤芯", description: "适合 25-45㎡ 空间", price: 0 },
      { id: "hepa", name: "H13 医疗级滤芯", description: "高效过滤细颗粒物", price: 860 },
      { id: "formaldehyde", name: "除醛增强滤芯", description: "新装修空间推荐", price: 720 },
    ],
  },
  {
    id: "battery",
    name: "续航模块",
    summary: "选择移动使用方式与续航时间",
    options: [
      { id: "none", name: "纯电源供电", description: "标准桌面使用", price: 0 },
      { id: "standard", name: "标准电池", description: "约 5 小时续航", price: 520 },
      { id: "extended", name: "长续航双电池", description: "约 11 小时，仅金属机身可选", price: 980 },
    ],
  },
  {
    id: "stand",
    name: "支架形态",
    summary: "落地支架依赖铝合金材质",
    options: [
      { id: "desktop", name: "桌面橡胶底座", description: "重心稳定，占地面积小", price: 0 },
      { id: "floor", name: "立式铝合金支架", description: "升高 92cm，仅金属机身可选", price: 760 },
    ],
  },
  {
    id: "trim",
    name: "控制环",
    summary: "顶部触控环的视觉与触感",
    options: [
      { id: "subtle", name: "同色控制环", description: "一体化外观", price: 0 },
      { id: "copper", name: "暖铜控制环", description: "拉丝金属点缀", price: 260, swatch: "#b5744d" },
      { id: "graphite-ring", name: "深色镀铬环", description: "高对比控制区域", price: 220, swatch: "#20242a" },
    ],
  },
];

const defaultConfiguration: Configuration = {
  color: "graphite",
  material: "matte",
  filter: "standard",
  battery: "standard",
  stand: "desktop",
  trim: "subtle",
};

/** Resolve a configuration against a rule package, enforcing its dependency rules. */
function resolveConfiguration(input: Partial<Configuration>, pkg: RulePackage): Configuration {
  const safe = { ...defaultConfiguration, ...input };
  // Iteratively enforce rules until no violations remain (handles chained constraints).
  for (let i = 0; i < 8; i++) {
    let changed = false;
    for (const rule of pkg.rules) {
      if (!ruleViolated(rule, safe)) continue;
      // Apply the rule's resolution: set requires to the first allowed value,
      // or clear a forbidden field to its default.
      if (rule.requires) {
        for (const [groupId, value] of Object.entries(rule.requires)) {
          if (safe[groupId as keyof Configuration] !== value) {
            safe[groupId as keyof Configuration] = value as Configuration[keyof Configuration];
            changed = true;
          }
        }
      }
      if (rule.forbids) {
        for (const [groupId, value] of Object.entries(rule.forbids)) {
          if (safe[groupId as keyof Configuration] === value) {
            safe[groupId as keyof Configuration] = defaultConfiguration[groupId as keyof Configuration];
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
  return safe;
}

export const useConfiguratorStore = defineStore("configurator", () => {
  const rulePackageStore = useRulePackageStore();

  const configuration = ref<Configuration>({ ...defaultConfiguration });
  const cameraPreset = ref<CameraPreset>("hero");
  const modelRotation = ref(-0.35);
  const shareNotice = ref("");
  /** The rule package version the current configuration state is consistent with. */
  const appliedRuleVersion = ref<string>(rulePackageStore.currentPackage.version);
  /** Set when the current configuration was recomputed due to a rule package change. */
  const staleNotice = ref("");

  const currentPackage = computed(() => rulePackageStore.currentPackage);

  /** Product groups with prices overridden by the active rule package. */
  const groupsWithPricing = computed<ProductGroup[]>(() =>
    productGroups.map((group) => ({
      ...group,
      options: group.options.map((option) => ({
        ...option,
        price: currentPackage.value.prices[option.id] ?? option.price,
      })),
    })),
  );

  const options = computed(() =>
    Object.fromEntries(
      productGroups.map((group) => [
        group.id,
        groupsWithPricing.value
          .find((priced) => priced.id === group.id)!
          .options.find((option) => option.id === configuration.value[group.id])!,
      ]),
    ) as Record<ProductGroup["id"], ProductGroup["options"][number]>,
  );

  const violatedRules = computed<DependencyRule[]>(() =>
    currentPackage.value.rules.filter((rule) => ruleViolated(rule, configuration.value)),
  );

  const dependencyMessage = computed(() => {
    if (violatedRules.value.length) return violatedRules.value[0].name;
    return "";
  });

  const price = computed(() => {
    const total =
      currentPackage.value.basePrice +
      Object.values(options.value).reduce((sum, option) => sum + option.price, 0);
    return total;
  });

  const specs = computed<ProductSpec[]>(() => {
    const batteryCopy: Record<Configuration["battery"], string> = {
      none: "电源供电",
      standard: "5 小时",
      extended: "11 小时",
    };
    const coverage: Record<Configuration["filter"], string> = {
      standard: "25-45㎡",
      hepa: "35-65㎡",
      formaldehyde: "30-55㎡",
    };
    return [
      { label: "建议面积", value: coverage[configuration.value.filter] },
      { label: "颗粒物 CADR", value: configuration.value.filter === "hepa" ? "620m³/h" : "480m³/h" },
      { label: "运行噪声", value: configuration.value.material === "metal" ? "20-48 dB" : "22-51 dB" },
      { label: "续航", value: batteryCopy[configuration.value.battery] },
      { label: "机身重量", value: configuration.value.material === "metal" ? "8.6kg" : "6.9kg" },
      { label: "控制方式", value: configuration.value.trim === "subtle" ? "触控 + App" : "旋钮 + App" },
    ];
  });

  const isOptionDisabled = (groupId: ProductGroup["id"], optionId: string) => {
    const candidate = { ...configuration.value, [groupId]: optionId };
    // Only disable when a rule directly applies to this selection (its `when`
    // matches the group being chosen). Chained constraints on other groups are
    // auto-adjusted after selection instead.
    return currentPackage.value.rules.some(
      (rule) => rule.when[groupId] === optionId && ruleViolated(rule, candidate),
    );
  };

  function selectOption(groupId: ProductGroup["id"], optionId: string) {
    if (isOptionDisabled(groupId, optionId)) {
      shareNotice.value = dependencyMessage.value || "当前组合不支持该选项。";
      return;
    }
    configuration.value[groupId] = optionId;
    // Enforce chained constraints (e.g. switching material to matte drops extended battery).
    configuration.value = resolveConfiguration(configuration.value, currentPackage.value);
    shareNotice.value = "";
    staleNotice.value = "";
  }

  function applyConfiguration(next: Partial<Configuration>, ruleVersion?: string) {
    configuration.value = resolveConfiguration(next, currentPackage.value);
    if (ruleVersion) appliedRuleVersion.value = ruleVersion;
    shareNotice.value = "";
  }

  function reset() {
    configuration.value = { ...defaultConfiguration };
    cameraPreset.value = "hero";
    appliedRuleVersion.value = currentPackage.value.version;
    staleNotice.value = "";
    shareNotice.value = "";
  }

  // When the rule package changes, recompute the current configuration so it stays valid.
  watch(
    () => currentPackage.value.version,
    (newVersion, oldVersion) => {
      if (newVersion === oldVersion) return;
      const before = JSON.stringify(configuration.value);
      configuration.value = resolveConfiguration(configuration.value, currentPackage.value);
      const after = JSON.stringify(configuration.value);
      const changed = before !== after;
      staleNotice.value = changed
        ? `规则包已更新至 v${newVersion}，受影响的报价和规格已重算。`
        : `规则包已更新至 v${newVersion}，当前配置未受影响，沿用旧结果。`;
      appliedRuleVersion.value = newVersion;
    },
  );

  return {
    configuration,
    cameraPreset,
    modelRotation,
    shareNotice,
    staleNotice,
    appliedRuleVersion,
    currentPackage,
    groupsWithPricing,
    options,
    price,
    specs,
    dependencyMessage,
    violatedRules,
    selectOption,
    applyConfiguration,
    isOptionDisabled,
    reset,
  };
});

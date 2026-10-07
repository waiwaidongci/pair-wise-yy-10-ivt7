import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { CameraPreset, Configuration, GroupId, ProductSpec } from "../types/product";
import type { RulePackageContent } from "../types/rules";
import {
  correctConfiguration,
  dependencyMessage as engineDependencyMessage,
  evaluatePrice,
  evaluateSpecs,
  isOptionDisabled as engineIsOptionDisabled,
} from "../rules/engine";
import { useRulePackageStore } from "./rulePackage";

const defaultConfiguration: Configuration = {
  color: "graphite",
  material: "matte",
  filter: "standard",
  battery: "standard",
  stand: "desktop",
  trim: "subtle",
};

export const useConfiguratorStore = defineStore("configurator", () => {
  const rulePackage = useRulePackageStore();

  const configuration = ref<Configuration>({ ...defaultConfiguration });
  const cameraPreset = ref<CameraPreset>("hero");
  const modelRotation = ref(-0.35);
  const shareNotice = ref("");

  /** 配置器始终基于当前已发布的规则包版本 */
  const content = computed<RulePackageContent>(() => rulePackage.currentContent);
  const groups = computed(() => content.value.groups);

  const options = computed(() => {
    const entries = content.value.groups.map((group) => {
      const selected = group.options.find((option) => option.id === configuration.value[group.id]) ?? group.options[0]!;
      return [group.id, selected];
    });
    return Object.fromEntries(entries) as Record<GroupId, (typeof content.value.groups)[number]["options"][number]>;
  });

  const dependencyMessage = computed(() => engineDependencyMessage(content.value, configuration.value));

  const price = computed(() => evaluatePrice(content.value, configuration.value));

  const specs = computed<ProductSpec[]>(() => evaluateSpecs(content.value, configuration.value));

  const isOptionDisabled = (groupId: GroupId, optionId: string) =>
    engineIsOptionDisabled(content.value, configuration.value, groupId, optionId);

  function selectOption(groupId: GroupId, optionId: string) {
    if (isOptionDisabled(groupId, optionId)) {
      const simulated: Configuration = { ...configuration.value, [groupId]: optionId };
      shareNotice.value = engineDependencyMessage(content.value, simulated) || "当前组合不支持该选项。";
      return;
    }
    const next: Configuration = { ...configuration.value, [groupId]: optionId };
    const { configuration: corrected, corrections } = correctConfiguration(content.value, next);
    configuration.value = corrected;
    shareNotice.value = corrections.join(" ");
  }

  /** 应用外部配置（如分享链接），按指定规则包内容校验修正，默认用当前版本 */
  function applyConfiguration(next: Partial<Configuration>, base?: RulePackageContent) {
    const safe = { ...defaultConfiguration, ...next };
    const { configuration: corrected } = correctConfiguration(base ?? content.value, safe);
    configuration.value = corrected;
  }

  function reset() {
    configuration.value = { ...defaultConfiguration };
    cameraPreset.value = "hero";
  }

  return {
    configuration,
    cameraPreset,
    modelRotation,
    shareNotice,
    groups,
    options,
    price,
    specs,
    dependencyMessage,
    selectOption,
    applyConfiguration,
    isOptionDisabled,
    reset,
  };
});

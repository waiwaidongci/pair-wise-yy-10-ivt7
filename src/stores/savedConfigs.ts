import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { Configuration } from "../types/product";
import type { ReconcileRecord, SavedConfiguration } from "../types/rules";
import { correctConfiguration, evaluatePrice, evaluateSpecs } from "../rules/engine";
import { ensureMigrated } from "../rules/migration";
import { createId, loadJson, saveJson, storageKeys } from "../rules/storage";
import { useRulePackageStore } from "./rulePackage";

export const useSavedConfigsStore = defineStore("savedConfigs", () => {
  // 确保迁移先执行（幂等），旧数据在此刻已补记首版
  ensureMigrated();
  const configs = ref<SavedConfiguration[]>(loadJson(storageKeys.savedConfigs) ?? []);

  const count = computed(() => configs.value.length);

  function persist() {
    saveJson(storageKeys.savedConfigs, configs.value);
  }

  /** 保存配置：记下引用的规则包版本，并按该版本缓存报价与各项规格 */
  function save(name: string, configuration: Configuration): SavedConfiguration {
    const rulePackage = useRulePackageStore();
    const version = rulePackage.currentVersion;
    const content = rulePackage.currentContent;
    const entry: SavedConfiguration = {
      id: createId(),
      name: name.trim() || "未命名配置",
      storeId: rulePackage.activeStoreId,
      storeName: rulePackage.activeStoreName,
      configuration: { ...configuration },
      savedVersion: version,
      reconciledVersion: version,
      savedAt: new Date().toISOString(),
      results: {
        quote: { value: evaluatePrice(content, configuration), version },
        specs: Object.fromEntries(
          evaluateSpecs(content, configuration).map((spec) => [spec.label, { value: spec.value, version }]),
        ),
      },
      history: [],
    };
    configs.value = [entry, ...configs.value];
    persist();
    return entry;
  }

  function remove(id: string) {
    configs.value = configs.value.filter((item) => item.id !== id);
    persist();
  }

  /**
   * 规则包发布新版本后逐份协调：
   * 报价和每项规格各自比对新旧结果——变化的失效并按新版本重算，
   * 未变化的沿用旧结果（保留原版本标记）；新规则下配置本身先自动修正。
   */
  function reconcileOne(entry: SavedConfiguration, toVersion: number) {
    const rulePackage = useRulePackageStore();
    const content = rulePackage.getContent(toVersion);
    if (!content) return;

    const recomputed: string[] = [];
    const kept: string[] = [];
    const { configuration: corrected, corrections } = correctConfiguration(content, entry.configuration);
    const configurationChanged = JSON.stringify(corrected) !== JSON.stringify(entry.configuration);
    entry.configuration = corrected;

    const quote = evaluatePrice(content, corrected);
    if (configurationChanged || quote !== entry.results.quote.value) {
      entry.results.quote = { value: quote, version: toVersion };
      recomputed.push("报价");
    } else {
      kept.push("报价");
    }

    const activeLabels = new Set<string>();
    for (const spec of evaluateSpecs(content, corrected)) {
      activeLabels.add(spec.label);
      const existing = entry.results.specs[spec.label];
      if (configurationChanged || !existing || existing.value !== spec.value) {
        entry.results.specs[spec.label] = { value: spec.value, version: toVersion };
        recomputed.push(`规格·${spec.label}`);
      } else {
        kept.push(`规格·${spec.label}`);
      }
    }
    for (const label of Object.keys(entry.results.specs)) {
      if (!activeLabels.has(label)) {
        delete entry.results.specs[label];
        recomputed.push(`规格·${label}（已随规则包移除）`);
      }
    }

    entry.reconciledVersion = toVersion;
    if (recomputed.length || corrections.length) {
      const record: ReconcileRecord = {
        at: new Date().toISOString(),
        toVersion,
        recomputed,
        kept,
        corrections,
      };
      entry.history = [record, ...entry.history];
    }
  }

  /** 把所有已保存配置协调到指定版本，返回有变动的配置数量 */
  function reconcileAll(toVersion: number): number {
    let touched = 0;
    for (const entry of configs.value) {
      if (entry.reconciledVersion >= toVersion) continue;
      const historyBefore = entry.history.length;
      reconcileOne(entry, toVersion);
      if (entry.history.length !== historyBefore) touched += 1;
    }
    persist();
    return touched;
  }

  return { configs, count, save, remove, reconcileAll };
});

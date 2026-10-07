import type { Configuration } from "../types/product";
import type { RulePackageVersion, SavedConfiguration } from "../types/rules";
import { defaultRulePackageContent } from "./defaults";
import { correctConfiguration, evaluatePrice, evaluateSpecs } from "./engine";
import { createId, loadJson, saveJson, storageKeys } from "./storage";

const FIRST_VERSION_NOTE = "初始版本：历史依赖规则与物料价迁移";

/** 升级前的旧配置数据：没有规则版本，也没有缓存结果 */
type LegacySavedConfiguration = Partial<SavedConfiguration> & {
  configuration?: Partial<Configuration>;
};

let migrated = false;

/**
 * 升级迁移（幂等）：
 * 1. 没有规则包版本时，用内置首版内容补成 v1；
 * 2. 旧的已保存配置没有规则版本，补记为首版并按首版补算缓存结果。
 */
export function ensureMigrated(): RulePackageVersion[] {
  let versions = loadJson<RulePackageVersion[]>(storageKeys.versions);
  if (!versions?.length) {
    versions = [
      {
        version: 1,
        content: defaultRulePackageContent,
        publishedAt: new Date().toISOString(),
        publishedBy: "system",
        publishedByName: "系统迁移",
        note: FIRST_VERSION_NOTE,
      },
    ];
    saveJson(storageKeys.versions, versions);
  }

  if (!migrated) {
    migrated = true;
    migrateSavedConfigs(versions[0]!);
  }
  return versions;
}

function migrateSavedConfigs(firstVersion: RulePackageVersion): void {
  const raw = loadJson<LegacySavedConfiguration[]>(storageKeys.savedConfigs);
  if (!raw?.length) return;

  const content = firstVersion.content;
  const migratedConfigs: SavedConfiguration[] = raw.map((legacy) => {
    const { configuration } = correctConfiguration(content, {
      color: "graphite",
      material: "matte",
      filter: "standard",
      battery: "standard",
      stand: "desktop",
      trim: "subtle",
      ...legacy.configuration,
    });
    const version = legacy.savedVersion ?? legacy.reconciledVersion ?? firstVersion.version;
    return {
      id: legacy.id ?? createId(),
      name: legacy.name ?? "未命名配置",
      storeId: legacy.storeId ?? "system",
      storeName: legacy.storeName ?? "系统迁移",
      configuration,
      savedVersion: version,
      reconciledVersion: version,
      savedAt: legacy.savedAt ?? firstVersion.publishedAt,
      results: legacy.results ?? {
        quote: { value: evaluatePrice(content, configuration), version },
        specs: Object.fromEntries(
          evaluateSpecs(content, configuration).map((spec) => [spec.label, { value: spec.value, version }]),
        ),
      },
      history: legacy.history ?? [
        {
          at: new Date().toISOString(),
          toVersion: version,
          recomputed: [],
          kept: ["报价", ...evaluateSpecs(content, configuration).map((spec) => `规格·${spec.label}`)],
          corrections: ["旧数据没有规则版本，升级时已补记为首版。"],
        },
      ],
    };
  });
  saveJson(storageKeys.savedConfigs, migratedConfigs);
}

import type { Configuration, GroupId, ProductGroup } from "./product";

/** 选项定位：某个配置组下的某个选项 */
export interface OptionRef {
  group: GroupId;
  option: string;
}

/**
 * 依赖规则（数据化，可随规则包版本存储）：
 * 当 trigger 选项被选中时，requires 必须成立 / forbids 不得成立，
 * 否则按 correct 自动修正，并展示 message。
 */
export interface DependencyRule {
  id: string;
  trigger: OptionRef;
  requires?: OptionRef;
  forbids?: OptionRef;
  correct: OptionRef;
  message: string;
}

/** 规格规则中的单个分支：所有 when 条件命中时取 value */
export interface SpecCase {
  when: OptionRef[];
  value: string;
}

/** 规格规则（决策表）：按顺序命中第一个分支，否则取 fallback */
export interface SpecRule {
  key: string;
  label: string;
  dependsOn: GroupId[];
  cases: SpecCase[];
  fallback: string;
}

/** 规则包内容：物料价（基础价 + 选项价）+ 依赖规则 + 规格规则 */
export interface RulePackageContent {
  basePrice: number;
  groups: ProductGroup[];
  dependencyRules: DependencyRule[];
  specRules: SpecRule[];
}

/** 已发布的规则包版本（只增不改） */
export interface RulePackageVersion {
  version: number;
  content: RulePackageContent;
  publishedAt: string;
  publishedBy: string;
  publishedByName: string;
  note: string;
}

/** 门店编辑中的草稿（每个门店一份，基于某个版本） */
export interface EditingDraft {
  storeId: string;
  baseVersion: number;
  content: RulePackageContent;
  updatedAt: string;
}

/** 并发保存冲突时保留的改动，确认后才发布 */
export interface ConflictDraft {
  id: string;
  storeId: string;
  storeName: string;
  baseVersion: number;
  /** 保存时线上已发布的版本（即“对方”的版本） */
  currentVersion: number;
  content: RulePackageContent;
  createdAt: string;
}

/** 规则包内容的差异集合 */
export interface ChangeSet {
  basePrice?: { from: number; to: number };
  optionPriceChanges: Array<{ group: GroupId; groupName: string; optionId: string; optionName: string; from: number; to: number }>;
  optionsAdded: Array<{ group: GroupId; groupName: string; optionId: string; optionName: string }>;
  optionsRemoved: Array<{ group: GroupId; groupName: string; optionId: string; optionName: string }>;
  dependencyRulesAdded: DependencyRule[];
  dependencyRulesRemoved: DependencyRule[];
  dependencyRulesModified: Array<{ before: DependencyRule; after: DependencyRule }>;
  specRulesAdded: SpecRule[];
  specRulesRemoved: SpecRule[];
  specRulesModified: Array<{ before: SpecRule; after: SpecRule }>;
}

/** 单个计算结果（报价或某一项规格）及其产出版本 */
export interface ResultEntry<T> {
  value: T;
  /** 产出该结果的规则包版本 */
  version: number;
}

/** 已保存配置的缓存结果：报价 + 各项规格，逐项记录版本 */
export interface SavedResults {
  quote: ResultEntry<number>;
  specs: Record<string, ResultEntry<string>>;
}

/** 规则包改动后的一次失效重算记录 */
export interface ReconcileRecord {
  at: string;
  toVersion: number;
  /** 失效并按新版本重算的条目 */
  recomputed: string[];
  /** 未受影响、沿用旧结果的条目 */
  kept: string[];
  /** 新规则下对配置本身的自动修正 */
  corrections: string[];
}

/** 已保存的配置（保存时记下引用的规则包版本） */
export interface SavedConfiguration {
  id: string;
  name: string;
  storeId: string;
  storeName: string;
  configuration: Configuration;
  /** 保存时引用的规则包版本 */
  savedVersion: number;
  /** 结果已协调到的最新规则包版本 */
  reconciledVersion: number;
  savedAt: string;
  results: SavedResults;
  history: ReconcileRecord[];
}

export type PublishResult =
  | { status: "published"; version: number }
  | { status: "conflict"; draftId: string }
  | { status: "failed"; error: string; rolledBackTo: number };

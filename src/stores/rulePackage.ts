import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  ConflictDraft,
  EditingDraft,
  PublishResult,
  RulePackageContent,
  RulePackageVersion,
} from "../types/rules";
import { validateContent } from "../rules/engine";
import { applyChangeSet, diffContents } from "../rules/diff";
import { ensureMigrated } from "../rules/migration";
import { createId, loadJson, saveJson, storageKeys } from "../rules/storage";
import { useSavedConfigsStore } from "./savedConfigs";

/** 参与协作的两家门店 */
export const STORES = [
  { id: "flagship", name: "旗舰店 · 门店 A" },
  { id: "community", name: "社区店 · 门店 B" },
] as const;

/** 规则包内容是纯数据（需经 localStorage 序列化），用 JSON 深拷贝以脱离响应式代理 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const useRulePackageStore = defineStore("rulePackage", () => {
  // 升级迁移：没有版本时补首版，旧配置补记首版（幂等）
  const versions = ref<RulePackageVersion[]>(ensureMigrated());
  const editingDrafts = ref<Record<string, EditingDraft>>(loadJson(storageKeys.editingDrafts) ?? {});
  const conflictDrafts = ref<ConflictDraft[]>(loadJson(storageKeys.conflictDrafts) ?? []);
  const activeStoreId = ref<string>(loadJson<string>(storageKeys.activeStore) ?? STORES[0].id);
  /** 演示用：开启后发布在写入后强制失败，用于验证回滚 */
  const simulatePublishFailure = ref(false);
  const lastPublishError = ref("");

  const currentVersion = computed(() => versions.value[versions.value.length - 1]!.version);
  const currentContent = computed(() => versions.value[versions.value.length - 1]!.content);
  const activeStoreName = computed(() => STORES.find((store) => store.id === activeStoreId.value)?.name ?? activeStoreId.value);
  const activeEditingDraft = computed(() => editingDrafts.value[activeStoreId.value] ?? null);

  function getVersion(version: number): RulePackageVersion | undefined {
    return versions.value.find((item) => item.version === version);
  }

  function getContent(version: number): RulePackageContent | undefined {
    return getVersion(version)?.content;
  }

  function setActiveStore(storeId: string) {
    activeStoreId.value = storeId;
    saveJson(storageKeys.activeStore, storeId);
  }

  function persistEditingDrafts() {
    saveJson(storageKeys.editingDrafts, editingDrafts.value);
  }

  /** 基于当前发布版本开始编辑（每个门店各持有一份草稿） */
  function startEditing() {
    editingDrafts.value = {
      ...editingDrafts.value,
      [activeStoreId.value]: {
        storeId: activeStoreId.value,
        baseVersion: currentVersion.value,
        content: clone(currentContent.value),
        updatedAt: new Date().toISOString(),
      },
    };
    persistEditingDrafts();
  }

  /** 编辑草稿内容变化后调用，更新时间戳并持久化 */
  function touchEditingDraft() {
    const draft = editingDrafts.value[activeStoreId.value];
    if (!draft) return;
    draft.updatedAt = new Date().toISOString();
    persistEditingDrafts();
  }

  function discardEditingDraft() {
    const next = { ...editingDrafts.value };
    delete next[activeStoreId.value];
    editingDrafts.value = next;
    persistEditingDrafts();
  }

  /** 放弃现有草稿，改为基于当前发布版本重新编辑 */
  function rebaseEditingDraft() {
    startEditing();
  }

  /**
   * 发布新版本。若草稿基于的版本已落后于线上版本（另一门店先发布），
   * 不直接发布，把这份改动保留为冲突草稿，确认后才发布。
   */
  function publish(content: RulePackageContent, baseVersion: number, note: string): PublishResult {
    lastPublishError.value = "";
    if (baseVersion !== currentVersion.value) {
      const draft: ConflictDraft = {
        id: createId(),
        storeId: activeStoreId.value,
        storeName: activeStoreName.value,
        baseVersion,
        currentVersion: currentVersion.value,
        content: clone(content),
        createdAt: new Date().toISOString(),
      };
      conflictDrafts.value = [...conflictDrafts.value, draft];
      saveJson(storageKeys.conflictDrafts, conflictDrafts.value);
      return { status: "conflict", draftId: draft.id };
    }
    return commitPublish(content, note, activeStoreId.value, activeStoreName.value);
  }

  /** 事务化发布：先乐观写入，失败则回滚到上一版 */
  function commitPublish(content: RulePackageContent, note: string, storeId: string, storeName: string): PublishResult {
    try {
      validateContent(content);
    } catch (error) {
      lastPublishError.value = error instanceof Error ? error.message : String(error);
      return { status: "failed", error: lastPublishError.value, rolledBackTo: currentVersion.value };
    }

    const snapshot = versions.value;
    const nextVersion = currentVersion.value + 1;
    const record: RulePackageVersion = {
      version: nextVersion,
      content: clone(content),
      publishedAt: new Date().toISOString(),
      publishedBy: storeId,
      publishedByName: storeName,
      note: note.trim() || "（无发布说明）",
    };
    versions.value = [...snapshot, record];
    try {
      saveJson(storageKeys.versions, versions.value);
      if (simulatePublishFailure.value) {
        throw new Error("模拟发布失败：写入后未收到服务端确认。");
      }
    } catch (error) {
      // 回滚到上一版：内存与持久化都恢复
      versions.value = snapshot;
      try {
        saveJson(storageKeys.versions, snapshot);
      } catch {
        // 持久化回滚失败时至少保证内存状态一致
      }
      lastPublishError.value = error instanceof Error ? error.message : String(error);
      return { status: "failed", error: lastPublishError.value, rolledBackTo: snapshot[snapshot.length - 1]!.version };
    }

    // 发布成功：受影响的已保存配置失效重算，其余沿用旧结果
    const savedConfigs = useSavedConfigsStore();
    savedConfigs.reconcileAll(nextVersion);
    return { status: "published", version: nextVersion };
  }

  /** 确认冲突草稿：把该门店的改动合并到当前线上版本之上，发布为新版本（两份改动都保留） */
  function confirmConflictDraft(draftId: string, note: string): PublishResult {
    const draft = conflictDrafts.value.find((item) => item.id === draftId);
    if (!draft) return { status: "failed", error: "冲突草稿不存在。", rolledBackTo: currentVersion.value };
    const base = getContent(draft.baseVersion);
    const merged = base
      ? applyChangeSet(currentContent.value, diffContents(base, draft.content), draft.content)
      : clone(draft.content);
    const result = commitPublish(merged, note || `确认合并冲突改动（原基于 v${draft.baseVersion}）`, draft.storeId, draft.storeName);
    if (result.status === "published") {
      conflictDrafts.value = conflictDrafts.value.filter((item) => item.id !== draftId);
      saveJson(storageKeys.conflictDrafts, conflictDrafts.value);
      // 该门店基于旧版本的编辑草稿已没有意义，一并清除
      if (editingDrafts.value[draft.storeId]?.baseVersion === draft.baseVersion) {
        const next = { ...editingDrafts.value };
        delete next[draft.storeId];
        editingDrafts.value = next;
        persistEditingDrafts();
      }
    }
    return result;
  }

  function discardConflictDraft(draftId: string) {
    conflictDrafts.value = conflictDrafts.value.filter((item) => item.id !== draftId);
    saveJson(storageKeys.conflictDrafts, conflictDrafts.value);
  }

  return {
    versions,
    editingDrafts,
    conflictDrafts,
    activeStoreId,
    activeStoreName,
    activeEditingDraft,
    simulatePublishFailure,
    lastPublishError,
    currentVersion,
    currentContent,
    getVersion,
    getContent,
    setActiveStore,
    startEditing,
    touchEditingDraft,
    discardEditingDraft,
    rebaseEditingDraft,
    publish,
    confirmConflictDraft,
    discardConflictDraft,
  };
});

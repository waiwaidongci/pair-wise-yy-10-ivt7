<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRulePackageStore } from "../stores/rulePackages";
import { productGroups } from "../stores/configurator";
import type { DependencyRule, PackageDiff, RulePackage } from "../types/rulePackage";
import { diffPackages } from "../utils/diff";

const store = useRulePackageStore();
const { currentPackage, drafts, conflicts, publishedPackages, currentStore, simulatePublishFailure, lastPublishError } =
  storeToRefs(store);

const emit = defineEmits<{ close: [] }>();

const editingDraft = ref<RulePackage | null>(null);
const confirmPublish = ref<RulePackage | null>(null);
const rollbackTarget = ref<string>("");

const storeOptions = ["门店 A", "门店 B", "门店 C"];

const allOptions = computed(() => productGroups.flatMap((group) => group.options));

function optionName(optionId: string): string {
  return allOptions.value.find((option) => option.id === optionId)?.name ?? optionId;
}

function groupName(groupId: string): string {
  return productGroups.find((group) => group.id === groupId)?.name ?? groupId;
}

function diffLines(diff: PackageDiff): string[] {
  const lines: string[] = [];
  if (diff.basePrice) {
    lines.push(`基础价 ¥${diff.basePrice.old} → ¥${diff.basePrice.new}`);
  }
  for (const price of diff.prices) {
    const label = price.kind === "added" ? "新增" : price.kind === "removed" ? "移除" : "调价";
    lines.push(`${label}：${optionName(price.optionId)} ¥${price.oldPrice ?? "-"} → ¥${price.newPrice ?? "-"}`);
  }
  for (const rule of diff.rules) {
    const label = rule.kind === "added" ? "新增规则" : rule.kind === "removed" ? "移除规则" : "规则调整";
    lines.push(`${label}：${rule.ruleName}`);
  }
  return lines;
}

function createDraft() {
  editingDraft.value = store.createDraft();
}

function saveDraft() {
  if (!editingDraft.value) return;
  store.updateDraft(editingDraft.value);
  editingDraft.value = null;
}

function startEditDraft(draft: RulePackage) {
  editingDraft.value = {
    ...draft,
    prices: { ...draft.prices },
    rules: draft.rules.map((rule) => ({
      ...rule,
      when: { ...rule.when },
      requires: rule.requires ? { ...rule.requires } : undefined,
      forbids: rule.forbids ? { ...rule.forbids } : undefined,
    })),
  };
}

function updateDraftPrice(optionId: string, price: number) {
  if (!editingDraft.value) return;
  editingDraft.value.prices[optionId] = price;
}

function updateDraftBasePrice(price: number) {
  if (!editingDraft.value) return;
  editingDraft.value.basePrice = price;
}

function updateRuleWhen(rule: DependencyRule, groupId: string, value: string) {
  if (!editingDraft.value) return;
  const target = editingDraft.value.rules.find((item) => item.id === rule.id);
  if (!target) return;
  target.when = groupId ? { [groupId]: value } : {};
}

function updateRuleRequires(rule: DependencyRule, groupId: string, value: string) {
  if (!editingDraft.value) return;
  const target = editingDraft.value.rules.find((item) => item.id === rule.id);
  if (!target) return;
  target.requires = groupId ? { [groupId]: value } : undefined;
  target.forbids = undefined;
}

function updateRuleForbids(rule: DependencyRule, groupId: string, value: string) {
  if (!editingDraft.value) return;
  const target = editingDraft.value.rules.find((item) => item.id === rule.id);
  if (!target) return;
  target.forbids = groupId ? { [groupId]: value } : undefined;
  target.requires = undefined;
}

function setRuleConstraint(rule: DependencyRule, kind: "none" | "requires" | "forbids") {
  if (!editingDraft.value) return;
  const target = editingDraft.value.rules.find((item) => item.id === rule.id);
  if (!target) return;
  if (kind === "none") {
    target.requires = undefined;
    target.forbids = undefined;
  } else if (kind === "requires") {
    target.forbids = undefined;
    target.requires = target.requires ?? {};
  } else {
    target.requires = undefined;
    target.forbids = target.forbids ?? {};
  }
}

function onWhenGroupChange(rule: DependencyRule, event: Event) {
  updateRuleWhen(rule, (event.target as HTMLSelectElement).value, "");
}

function onConstraintGroupChange(rule: DependencyRule, event: Event) {
  const groupId = (event.target as HTMLSelectElement).value;
  if (rule.requires) updateRuleRequires(rule, groupId, "");
  else if (rule.forbids) updateRuleForbids(rule, groupId, "");
}

function onStoreChange(event: Event) {
  store.setCurrentStore((event.target as HTMLSelectElement).value);
}

function onSimulateFailureChange(event: Event) {
  simulatePublishFailure.value = (event.target as HTMLInputElement).checked;
}

function diffAgainstCurrent(pkg: RulePackage): PackageDiff {
  return diffPackages(currentPackage.value, pkg);
}

function diffBetween(a: RulePackage, b: RulePackage): PackageDiff {
  return diffPackages(a, b);
}

function askPublish(draft: RulePackage) {
  confirmPublish.value = draft;
}

function doPublish() {
  if (!confirmPublish.value) return;
  try {
    store.publishDraft(confirmPublish.value.version);
  } catch {
    // Error already recorded in store; rollback happened automatically.
  }
  confirmPublish.value = null;
}

function doRollback() {
  if (!rollbackTarget.value) return;
  store.rollbackTo(rollbackTarget.value);
  rollbackTarget.value = "";
}

const versionHistory = computed(() =>
  publishedPackages.value.filter((pkg) => pkg.version !== currentPackage.value.version),
);
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="emit('close')">
    <div class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Rule Packages</p>
          <h2 class="text-xl font-black text-slate-900">规则包管理</h2>
        </div>
        <button class="rounded-lg px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100" @click="emit('close')">关闭</button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <!-- Current version -->
        <section class="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs font-bold text-slate-500">当前发布版本</p>
              <p class="mt-1 text-lg font-black text-slate-900">
                v{{ currentPackage.version }}
                <span class="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">生效中</span>
              </p>
              <p class="mt-1 text-xs text-slate-400">{{ currentPackage.changelog }}</p>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-xs font-bold text-slate-500">门店身份</label>
              <select
                class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700"
                :value="currentStore"
                @change="onStoreChange"
              >
                <option v-for="name in storeOptions" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button class="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700" @click="createDraft">
              基于 v{{ currentPackage.version }} 新建草稿
            </button>
            <label class="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                :checked="simulatePublishFailure"
                @change="onSimulateFailureChange"
              />
              模拟发布失败（演示回滚）
            </label>
          </div>
          <p v-if="lastPublishError" class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            发布失败：{{ lastPublishError }}。已回滚到 v{{ currentPackage.version }}。
          </p>
        </section>

        <!-- Draft editor -->
        <section v-if="editingDraft" class="mt-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <div class="flex items-center justify-between">
            <p class="text-sm font-black text-slate-900">编辑草稿（{{ editingDraft.editedBy }}）</p>
            <div class="flex gap-2">
              <button class="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100" @click="editingDraft = null">取消</button>
              <button class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-black text-white hover:bg-blue-700" @click="saveDraft">保存草稿</button>
            </div>
          </div>

          <div class="mt-4">
            <label class="text-xs font-bold text-slate-500">主机基础价</label>
            <input
              type="number"
              class="mt-1 w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
              :value="editingDraft.basePrice"
              @input="updateDraftBasePrice(Number(($event.target as HTMLInputElement).value))"
            />
          </div>

          <div class="mt-4">
            <p class="text-xs font-bold text-slate-500">选件价格</p>
            <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div
                v-for="option in allOptions"
                :key="option.id"
                class="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <span class="text-xs text-slate-600">{{ option.name }}</span>
                <input
                  type="number"
                  class="w-20 rounded border border-slate-200 px-2 py-1 text-right text-xs font-bold"
                  :value="editingDraft.prices[option.id] ?? 0"
                  @input="updateDraftPrice(option.id, Number(($event.target as HTMLInputElement).value))"
                />
              </div>
            </div>
          </div>

          <div class="mt-4">
            <p class="text-xs font-bold text-slate-500">依赖规则</p>
            <div class="mt-2 space-y-2">
              <div v-for="rule in editingDraft.rules" :key="rule.id" class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black text-slate-800">{{ rule.name }}</p>
                <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <p class="text-[10px] text-slate-400">当（条件组）</p>
                    <select
                      class="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      :value="Object.keys(rule.when)[0] ?? ''"
                      @change="onWhenGroupChange(rule, $event)"
                    >
                      <option value="">（无条件）</option>
                      <option v-for="group in productGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
                    </select>
                  </div>
                  <div>
                    <p class="text-[10px] text-slate-400">条件值</p>
                    <select
                      class="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      :value="Object.values(rule.when)[0] ?? ''"
                      @change="updateRuleWhen(rule, Object.keys(rule.when)[0] ?? '', ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">（任意）</option>
                      <option
                        v-for="option in productGroups.find((group) => group.id === (Object.keys(rule.when)[0] ?? ''))?.options ?? []"
                        :key="option.id"
                        :value="option.id"
                      >{{ option.name }}</option>
                    </select>
                  </div>
                  <div>
                    <p class="text-[10px] text-slate-400">约束类型</p>
                    <select
                      class="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      :value="rule.requires ? 'requires' : rule.forbids ? 'forbids' : 'none'"
                      @change="setRuleConstraint(rule, ($event.target as HTMLSelectElement).value as 'none' | 'requires' | 'forbids')"
                    >
                      <option value="none">无</option>
                      <option value="requires">必须</option>
                      <option value="forbids">禁止</option>
                    </select>
                  </div>
                </div>
                <div v-if="rule.requires || rule.forbids" class="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p class="text-[10px] text-slate-400">{{ rule.requires ? '必须为' : '禁止为' }}</p>
                    <select
                      class="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      :value="Object.keys(rule.requires ?? rule.forbids ?? {})[0] ?? ''"
                      @change="onConstraintGroupChange(rule, $event)"
                    >
                      <option value="">（选择）</option>
                      <option v-for="group in productGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
                    </select>
                  </div>
                  <div>
                    <p class="text-[10px] text-slate-400">约束值</p>
                    <select
                      class="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      :value="Object.values(rule.requires ?? rule.forbids ?? {})[0] ?? ''"
                      @change="
                        (e) => {
                          const value = (e.target as HTMLSelectElement).value;
                          const groupId = Object.keys(rule.requires ?? rule.forbids ?? {})[0] ?? '';
                          if (rule.requires) updateRuleRequires(rule, groupId, value);
                          else if (rule.forbids) updateRuleForbids(rule, groupId, value);
                        }
                      "
                    >
                      <option value="">（任意）</option>
                      <option
                        v-for="option in productGroups.find((group) => group.id === (Object.keys(rule.requires ?? rule.forbids ?? {})[0] ?? ''))?.options ?? []"
                        :key="option.id"
                        :value="option.id"
                      >{{ option.name }}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Drafts list -->
        <section v-if="drafts.length" class="mt-5">
          <p class="text-sm font-black text-slate-900">草稿（{{ drafts.length }}）</p>
          <div class="mt-2 space-y-2">
            <div
              v-for="draft in drafts"
              :key="draft.version"
              class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
            >
              <div>
                <p class="text-xs font-black text-slate-800">
                  {{ draft.editedBy }} 的草稿
                  <span class="ml-1 text-[10px] font-bold text-slate-400">基于 v{{ draft.basedOn }}</span>
                </p>
                <p class="mt-0.5 text-[11px] text-slate-500">
                  基础价 ¥{{ draft.basePrice }} · {{ Object.keys(draft.prices).length }} 项选件价 · {{ draft.rules.length }} 条规则
                </p>
              </div>
              <div class="flex gap-2">
                <button class="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100" @click="startEditDraft(draft)">编辑</button>
                <button class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-black text-white hover:bg-blue-700" @click="askPublish(draft)">发布</button>
                <button class="rounded-lg px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50" @click="store.deleteDraft(draft.version)">删除</button>
              </div>
            </div>
          </div>
        </section>

        <!-- Conflicts -->
        <section v-if="conflicts.length" class="mt-5">
          <p class="text-sm font-black text-red-700">冲突（{{ conflicts.length }}）</p>
          <p class="mt-1 text-xs text-slate-500">两家门店基于同一版本保存了不同草稿，请确认发布哪一版。</p>
          <div class="mt-3 space-y-4">
            <div v-for="(group, groupIndex) in conflicts" :key="groupIndex" class="rounded-xl border border-red-200 bg-red-50/40 p-4">
              <div class="grid gap-3 sm:grid-cols-2">
                <div v-for="draft in group" :key="draft.version" class="rounded-lg border border-slate-200 bg-white p-3">
                  <p class="text-xs font-black text-slate-800">{{ draft.editedBy }} 的改动</p>
                  <ul class="mt-1 space-y-0.5">
                    <li v-for="(line, lineIndex) in diffLines(diffAgainstCurrent(draft))" :key="lineIndex" class="text-[11px] text-slate-600">{{ line }}</li>
                    <li v-if="!diffLines(diffAgainstCurrent(draft)).length" class="text-[11px] text-slate-400">无差异</li>
                  </ul>
                  <button
                    class="mt-3 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-black text-white hover:bg-blue-700"
                    @click="askPublish(draft)"
                  >
                    发布 {{ draft.editedBy }} 的版本
                  </button>
                </div>
              </div>
              <div class="mt-3 rounded-lg bg-white p-3">
                <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">两版差异</p>
                <ul class="mt-1 space-y-0.5">
                  <li v-for="(line, lineIndex) in diffLines(diffBetween(group[0], group[1]))" :key="lineIndex" class="text-[11px] text-slate-600">{{ line }}</li>
                  <li v-if="!diffLines(diffBetween(group[0], group[1])).length" class="text-[11px] text-slate-400">无差异</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <!-- Version history -->
        <section class="mt-5">
          <p class="text-sm font-black text-slate-900">历史版本</p>
          <div class="mt-2 space-y-2">
            <div
              v-for="pkg in versionHistory"
              :key="pkg.version"
              class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
            >
              <div>
                <p class="text-xs font-black text-slate-800">v{{ pkg.version }}</p>
                <p class="mt-0.5 text-[11px] text-slate-500">{{ pkg.changelog || '（无变更说明）' }}</p>
              </div>
              <button
                class="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                @click="rollbackTarget = pkg.version"
              >回滚到此版本</button>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- Publish confirmation -->
    <div v-if="confirmPublish" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" @click.self="confirmPublish = null">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 class="text-lg font-black text-slate-900">确认发布新版本？</h3>
        <p class="mt-2 text-sm text-slate-500">
          即将发布 <strong>{{ confirmPublish.editedBy }}</strong> 的草稿为新版本。发布后，引用旧版本的配置将被标记为失效并重算。
        </p>
        <div class="mt-4 rounded-lg bg-slate-50 p-3">
          <ul class="space-y-0.5">
            <li v-for="(line, lineIndex) in diffLines(diffAgainstCurrent(confirmPublish))" :key="lineIndex" class="text-[11px] text-slate-600">{{ line }}</li>
            <li v-if="!diffLines(diffAgainstCurrent(confirmPublish)).length" class="text-[11px] text-slate-400">无差异</li>
          </ul>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button class="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100" @click="confirmPublish = null">取消</button>
          <button class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700" @click="doPublish">确认发布</button>
        </div>
      </div>
    </div>

    <!-- Rollback confirmation -->
    <div v-if="rollbackTarget" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" @click.self="rollbackTarget = ''">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 class="text-lg font-black text-slate-900">回滚到 v{{ rollbackTarget }}？</h3>
        <p class="mt-2 text-sm text-slate-500">当前版本将被归档，v{{ rollbackTarget }} 将重新作为生效版本。</p>
        <div class="mt-5 flex justify-end gap-2">
          <button class="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100" @click="rollbackTarget = ''">取消</button>
          <button class="rounded-lg bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700" @click="doRollback">确认回滚</button>
        </div>
      </div>
    </div>
  </div>
</template>

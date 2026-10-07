<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { STORES, useRulePackageStore } from "../stores/rulePackage";
import { applyChangeSet, describeChangeSet, diffContents } from "../rules/diff";
import { formatDateTime, formatPrice } from "../utils/share";
import type { ConflictDraft, DependencyRule, OptionRef, RulePackageContent, RulePackageVersion } from "../types/rules";
import type { GroupId } from "../types/product";

const router = useRouter();
const rulePackage = useRulePackageStore();
const { versions, conflictDrafts, activeStoreId, activeEditingDraft, simulatePublishFailure } = storeToRefs(rulePackage);

const note = ref("");
const feedback = ref<{ kind: "success" | "error" | "info"; text: string } | null>(null);
const expandedVersions = ref<number[]>([]);

const groupIds: GroupId[] = ["color", "material", "filter", "battery", "stand", "trim"];

const newRule = ref({
  triggerGroup: "material" as GroupId,
  triggerOption: "wood",
  kind: "requires" as "requires" | "forbids",
  targetGroup: "filter" as GroupId,
  targetOption: "hepa",
  correctGroup: "filter" as GroupId,
  correctOption: "standard",
  message: "",
});

const sortedVersions = computed(() => [...versions.value].sort((a, b) => b.version - a.version));
const draftStale = computed(
  () => activeEditingDraft.value && activeEditingDraft.value.baseVersion !== rulePackage.currentVersion,
);

function optionsOf(content: RulePackageContent | null, groupId: GroupId) {
  return content?.groups.find((group) => group.id === groupId)?.options ?? [];
}

function groupName(content: RulePackageContent | null, groupId: GroupId) {
  return content?.groups.find((group) => group.id === groupId)?.name ?? groupId;
}

function refLabel(content: RulePackageContent | null, ref_: OptionRef) {
  const option = optionsOf(content, ref_.group).find((item) => item.id === ref_.option);
  return `${groupName(content, ref_.group)} / ${option?.name ?? ref_.option}`;
}

function ruleSummary(content: RulePackageContent | null, rule: DependencyRule) {
  const parts = [`当选择「${refLabel(content, rule.trigger)}」`];
  if (rule.requires) parts.push(`要求「${refLabel(content, rule.requires)}」`);
  if (rule.forbids) parts.push(`禁止搭配「${refLabel(content, rule.forbids)}」`);
  parts.push(`冲突时修正为「${refLabel(content, rule.correct)}」`);
  return parts.join("，");
}

function versionChanges(version: RulePackageVersion): string[] {
  const previous = rulePackage.getVersion(version.version - 1);
  if (!previous) return [version.note];
  const lines = describeChangeSet(diffContents(previous.content, version.content));
  return lines.length ? lines : ["（内容无实质变化）"];
}

function toggleVersion(version: number) {
  expandedVersions.value = expandedVersions.value.includes(version)
    ? expandedVersions.value.filter((item) => item !== version)
    : [...expandedVersions.value, version];
}

function conflictDiffs(draft: ConflictDraft) {
  const base = rulePackage.getContent(draft.baseVersion);
  const current = rulePackage.currentContent;
  const empty: string[] = [];
  // 确认发布时会将该门店的改动合并到线上版本之上，预览与真实发布结果一致
  const merged = base ? applyChangeSet(current, diffContents(base, draft.content), draft.content) : draft.content;
  return {
    mine: base ? describeChangeSet(diffContents(base, draft.content)) : empty,
    theirs: base ? describeChangeSet(diffContents(base, current)) : empty,
    relative: describeChangeSet(diffContents(current, merged)),
  };
}

function onPublish() {
  const draft = activeEditingDraft.value;
  if (!draft) return;
  const result = rulePackage.publish(draft.content, draft.baseVersion, note.value);
  if (result.status === "published") {
    feedback.value = { kind: "success", text: `已发布新版本 v${result.version}，受影响的已保存配置已失效重算，其余沿用旧结果。` };
    note.value = "";
    rulePackage.discardEditingDraft();
  } else if (result.status === "conflict") {
    feedback.value = {
      kind: "info",
      text: `另一门店已先发布 v${rulePackage.currentVersion}，您的改动已保留在「待确认冲突」中，请核对两边差异后确认发布。`,
    };
    rulePackage.discardEditingDraft();
  } else {
    feedback.value = { kind: "error", text: `发布失败：${result.error} 已回滚到 v${result.rolledBackTo}。` };
  }
}

function onConfirmConflict(draftId: string) {
  const result = rulePackage.confirmConflictDraft(draftId, "");
  if (result.status === "published") {
    feedback.value = { kind: "success", text: `冲突改动已确认，发布为 v${result.version}，受影响的已保存配置已失效重算。` };
  } else if (result.status === "failed") {
    feedback.value = { kind: "error", text: `发布失败：${result.error} 已回滚到 v${result.rolledBackTo}，冲突改动仍然保留。` };
  }
}

function onDiscardConflict(draftId: string) {
  rulePackage.discardConflictDraft(draftId);
  feedback.value = { kind: "info", text: "已放弃该冲突改动，线上版本保持不变。" };
}

function addRule() {
  const draft = activeEditingDraft.value;
  if (!draft || !newRule.value.message.trim()) return;
  const rule: DependencyRule = {
    id: `rule-${Date.now().toString(36)}`,
    trigger: { group: newRule.value.triggerGroup, option: newRule.value.triggerOption },
    correct: { group: newRule.value.correctGroup, option: newRule.value.correctOption },
    message: newRule.value.message.trim(),
  };
  if (newRule.value.kind === "requires") rule.requires = { group: newRule.value.targetGroup, option: newRule.value.targetOption };
  else rule.forbids = { group: newRule.value.targetGroup, option: newRule.value.targetOption };
  draft.content.dependencyRules.push(rule);
  newRule.value.message = "";
  rulePackage.touchEditingDraft();
}

function removeRule(ruleId: string) {
  const draft = activeEditingDraft.value;
  if (!draft) return;
  draft.content.dependencyRules = draft.content.dependencyRules.filter((rule) => rule.id !== ruleId);
  rulePackage.touchEditingDraft();
}

function specCaseLabel(content: RulePackageContent | null, when: OptionRef[]) {
  return when.map((condition) => refLabel(content, condition)).join(" 且 ");
}
</script>

<template>
  <div class="min-h-screen bg-[#eef1f4] p-4 sm:p-6">
    <div class="mx-auto max-w-7xl">
      <header class="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Rule Package</p>
          <h1 class="mt-1 text-2xl font-black text-slate-900">规则包管理</h1>
          <p class="mt-1 text-xs text-slate-500">依赖规则与物料价按版本发布；保存的配置记录引用版本，改动后受影响的结果失效重算。</p>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold">
            <button
              v-for="store in STORES"
              :key="store.id"
              class="rounded-lg px-3 py-2 transition"
              :class="activeStoreId === store.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'"
              @click="rulePackage.setActiveStore(store.id)"
            >
              {{ store.name }}
            </button>
          </div>
          <button class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50" @click="router.push('/saved')">
            已保存配置
          </button>
          <button class="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white" @click="router.push('/')">返回配置器</button>
        </div>
      </header>

      <div class="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm">
        <span class="rounded-full bg-slate-900 px-3 py-1 font-bold text-white">当前发布版本 v{{ rulePackage.currentVersion }}</span>
        <span class="text-slate-500">当前操作身份：{{ rulePackage.activeStoreName }}</span>
        <span class="text-slate-300">|</span>
        <span class="text-slate-400">模拟并发：先用门店 B 开始编辑，再切到门店 A 编辑并发布，回到门店 B 保存即产生冲突。</span>
      </div>

      <p
        v-if="feedback"
        class="mb-4 rounded-xl border px-4 py-3 text-xs font-bold"
        :class="{
          'border-emerald-200 bg-emerald-50 text-emerald-700': feedback.kind === 'success',
          'border-rose-200 bg-rose-50 text-rose-700': feedback.kind === 'error',
          'border-sky-200 bg-sky-50 text-sky-700': feedback.kind === 'info',
        }"
      >
        {{ feedback.text }}
      </p>

      <!-- 待确认冲突 -->
      <section v-if="conflictDrafts.length" class="mb-5 space-y-4">
        <div v-for="draft in conflictDrafts" :key="draft.id" class="rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-5 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-black text-amber-900">待确认冲突 · {{ draft.storeName }}</p>
              <p class="mt-1 text-xs text-amber-700">
                基于 v{{ draft.baseVersion }} 编辑，保存时线上已是 v{{ draft.currentVersion }}（{{ formatDateTime(draft.createdAt) }}）。两份改动都已保留，确认后才发布新版本。
              </p>
            </div>
            <div class="flex gap-2">
              <button class="rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white hover:bg-amber-700" @click="onConfirmConflict(draft.id)">
                确认发布为新版本
              </button>
              <button class="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-bold text-amber-700 hover:bg-amber-100" @click="onDiscardConflict(draft.id)">
                放弃该改动
              </button>
            </div>
          </div>
          <div class="mt-4 grid gap-3 lg:grid-cols-3">
            <div class="rounded-xl bg-white p-4">
              <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">该门店的改动（v{{ draft.baseVersion }} → 草稿）</p>
              <ul class="mt-2 space-y-1.5 text-xs text-slate-700">
                <li v-for="line in conflictDiffs(draft).mine" :key="line" class="flex gap-1.5"><span class="text-amber-500">•</span>{{ line }}</li>
                <li v-if="!conflictDiffs(draft).mine.length" class="text-slate-400">无实质改动</li>
              </ul>
            </div>
            <div class="rounded-xl bg-white p-4">
              <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">线上同期改动（v{{ draft.baseVersion }} → v{{ draft.currentVersion }}）</p>
              <ul class="mt-2 space-y-1.5 text-xs text-slate-700">
                <li v-for="line in conflictDiffs(draft).theirs" :key="line" class="flex gap-1.5"><span class="text-sky-500">•</span>{{ line }}</li>
                <li v-if="!conflictDiffs(draft).theirs.length" class="text-slate-400">无实质改动</li>
              </ul>
            </div>
            <div class="rounded-xl bg-white p-4">
              <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">确认发布后相对线上的变化（合并两份改动）</p>
              <ul class="mt-2 space-y-1.5 text-xs text-slate-700">
                <li v-for="line in conflictDiffs(draft).relative" :key="line" class="flex gap-1.5"><span class="text-emerald-500">•</span>{{ line }}</li>
                <li v-if="!conflictDiffs(draft).relative.length" class="text-slate-400">与线上版本一致</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <div class="grid gap-5 xl:grid-cols-[380px_1fr]">
        <!-- 版本历史 -->
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wider text-slate-400">版本历史</p>
          <div class="mt-4 space-y-3">
            <div v-for="version in sortedVersions" :key="version.version" class="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <button class="flex w-full items-center justify-between gap-3 text-left" @click="toggleVersion(version.version)">
                <div>
                  <p class="flex items-center gap-2 text-sm font-black text-slate-800">
                    v{{ version.version }}
                    <span v-if="version.version === rulePackage.currentVersion" class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">当前版本</span>
                  </p>
                  <p class="mt-1 text-[11px] text-slate-400">{{ version.publishedByName }} · {{ formatDateTime(version.publishedAt) }}</p>
                </div>
                <span class="text-slate-400">{{ expandedVersions.includes(version.version) ? "▲" : "▼" }}</span>
              </button>
              <div v-if="expandedVersions.includes(version.version)" class="mt-3 border-t border-slate-200 pt-3">
                <p class="text-[11px] font-bold text-slate-500">发布说明：{{ version.note }}</p>
                <ul class="mt-2 space-y-1.5 text-xs text-slate-600">
                  <li v-for="line in versionChanges(version)" :key="line" class="flex gap-1.5"><span class="text-blue-400">•</span>{{ line }}</li>
                </ul>
                <div class="mt-3 rounded-lg bg-white p-3 text-[11px] text-slate-500">
                  <p>基础价 {{ formatPrice(version.content.basePrice) }} · {{ version.content.groups.length }} 个配置组 · {{ version.content.dependencyRules.length }} 条依赖规则 · {{ version.content.specRules.length }} 条规格规则</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 编辑器 -->
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div v-if="!activeEditingDraft" class="flex h-full flex-col items-center justify-center py-16 text-center">
            <p class="text-sm font-black text-slate-700">{{ rulePackage.activeStoreName }} 当前没有编辑中的草稿</p>
            <p class="mt-2 max-w-md text-xs text-slate-400">基于当前发布版本 v{{ rulePackage.currentVersion }} 开始编辑物料价、依赖规则和规格规则，保存时若版本已被另一门店更新，改动会保留为待确认冲突。</p>
            <button class="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700" @click="rulePackage.startEditing()">
              基于 v{{ rulePackage.currentVersion }} 开始编辑
            </button>
          </div>

          <template v-else>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-black text-slate-800">编辑草稿 · {{ rulePackage.activeStoreName }}</p>
                <p class="mt-1 text-xs text-slate-400">基于 v{{ activeEditingDraft.baseVersion }} · 最后编辑 {{ formatDateTime(activeEditingDraft.updatedAt) }}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-if="draftStale"
                  class="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100"
                  @click="rulePackage.rebaseEditingDraft()"
                >
                  放弃并基于 v{{ rulePackage.currentVersion }} 重编
                </button>
                <button class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50" @click="rulePackage.discardEditingDraft()">
                  放弃编辑
                </button>
                <button class="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700" @click="onPublish">
                  {{ draftStale ? "保存（将产生冲突待确认）" : "发布新版本" }}
                </button>
              </div>
            </div>

            <p v-if="draftStale" class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              线上已发布 v{{ rulePackage.currentVersion }}，本草稿仍基于 v{{ activeEditingDraft.baseVersion }}。保存后改动会保留为待确认冲突，确认后才发布。
            </p>

            <div class="mt-4 grid gap-4 lg:grid-cols-2">
              <div class="rounded-xl border border-slate-100 p-4">
                <p class="text-xs font-black text-slate-700">基础价与物料价</p>
                <label class="mt-3 block text-[11px] font-bold text-slate-500">
                  基础价（元）
                  <input
                    v-model.number="activeEditingDraft.content.basePrice"
                    type="number"
                    min="0"
                    class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400"
                    @change="rulePackage.touchEditingDraft()"
                  />
                </label>
                <div class="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
                  <div v-for="group in activeEditingDraft.content.groups" :key="group.id">
                    <p class="text-[11px] font-black text-slate-500">{{ group.name }}</p>
                    <div class="mt-1.5 space-y-1.5">
                      <label v-for="option in group.options" :key="option.id" class="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                        <span class="min-w-0 truncate">{{ option.name }}</span>
                        <input
                          v-model.number="option.price"
                          type="number"
                          min="0"
                          class="w-24 shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-xs outline-none focus:border-blue-400"
                          @change="rulePackage.touchEditingDraft()"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="rounded-xl border border-slate-100 p-4">
                <p class="text-xs font-black text-slate-700">依赖规则</p>
                <div class="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                  <div v-for="rule in activeEditingDraft.content.dependencyRules" :key="rule.id" class="rounded-lg bg-slate-50 p-3">
                    <div class="flex items-start justify-between gap-2">
                      <p class="text-[11px] text-slate-500">{{ ruleSummary(activeEditingDraft.content, rule) }}</p>
                      <button class="shrink-0 text-[11px] font-bold text-rose-500 hover:text-rose-700" @click="removeRule(rule.id)">删除</button>
                    </div>
                    <input
                      v-model="rule.message"
                      type="text"
                      class="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400"
                      placeholder="违反规则时的提示文案"
                      @change="rulePackage.touchEditingDraft()"
                    />
                  </div>
                </div>
                <div class="mt-3 rounded-lg border border-dashed border-slate-200 p-3">
                  <p class="text-[11px] font-black text-slate-500">新增依赖规则</p>
                  <div class="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <select v-model="newRule.triggerGroup" class="rounded-lg border border-slate-200 px-2 py-1.5" @change="newRule.triggerOption = optionsOf(activeEditingDraft.content, newRule.triggerGroup)[0]?.id ?? ''">
                      <option v-for="gid in groupIds" :key="gid" :value="gid">{{ groupName(activeEditingDraft.content, gid) }}（触发组）</option>
                    </select>
                    <select v-model="newRule.triggerOption" class="rounded-lg border border-slate-200 px-2 py-1.5">
                      <option v-for="option in optionsOf(activeEditingDraft.content, newRule.triggerGroup)" :key="option.id" :value="option.id">{{ option.name }}</option>
                    </select>
                    <select v-model="newRule.kind" class="rounded-lg border border-slate-200 px-2 py-1.5">
                      <option value="requires">要求必须搭配</option>
                      <option value="forbids">禁止搭配</option>
                    </select>
                    <span class="flex items-center text-slate-400">目标：</span>
                    <select v-model="newRule.targetGroup" class="rounded-lg border border-slate-200 px-2 py-1.5" @change="newRule.targetOption = optionsOf(activeEditingDraft.content, newRule.targetGroup)[0]?.id ?? ''">
                      <option v-for="gid in groupIds" :key="gid" :value="gid">{{ groupName(activeEditingDraft.content, gid) }}</option>
                    </select>
                    <select v-model="newRule.targetOption" class="rounded-lg border border-slate-200 px-2 py-1.5">
                      <option v-for="option in optionsOf(activeEditingDraft.content, newRule.targetGroup)" :key="option.id" :value="option.id">{{ option.name }}</option>
                    </select>
                    <select v-model="newRule.correctGroup" class="rounded-lg border border-slate-200 px-2 py-1.5" @change="newRule.correctOption = optionsOf(activeEditingDraft.content, newRule.correctGroup)[0]?.id ?? ''">
                      <option v-for="gid in groupIds" :key="gid" :value="gid">{{ groupName(activeEditingDraft.content, gid) }}（修正组）</option>
                    </select>
                    <select v-model="newRule.correctOption" class="rounded-lg border border-slate-200 px-2 py-1.5">
                      <option v-for="option in optionsOf(activeEditingDraft.content, newRule.correctGroup)" :key="option.id" :value="option.id">{{ option.name }}</option>
                    </select>
                  </div>
                  <input
                    v-model="newRule.message"
                    type="text"
                    placeholder="提示文案，如：长续航双电池需要搭配拉丝铝合金机身。"
                    class="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400"
                  />
                  <button
                    class="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"
                    :disabled="!newRule.message.trim()"
                    @click="addRule"
                  >
                    添加规则
                  </button>
                </div>
              </div>
            </div>

            <div class="mt-4 rounded-xl border border-slate-100 p-4">
              <p class="text-xs font-black text-slate-700">规格规则</p>
              <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div v-for="spec in activeEditingDraft.content.specRules" :key="spec.key" class="rounded-lg bg-slate-50 p-3">
                  <p class="text-[11px] font-black text-slate-600">{{ spec.label }}</p>
                  <div class="mt-2 space-y-1.5">
                    <label v-for="(specCase, index) in spec.cases" :key="index" class="block text-[10px] text-slate-400">
                      {{ specCaseLabel(activeEditingDraft.content, specCase.when) }}
                      <input
                        v-model="specCase.value"
                        type="text"
                        class="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400"
                        @change="rulePackage.touchEditingDraft()"
                      />
                    </label>
                    <label class="block text-[10px] text-slate-400">
                      默认值（其他情况）
                      <input
                        v-model="spec.fallback"
                        type="text"
                        class="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-400"
                        @change="rulePackage.touchEditingDraft()"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
              <input
                v-model="note"
                type="text"
                placeholder="发布说明（如：滤芯物料价上调）"
                class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"
              />
              <label class="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                <input v-model="simulatePublishFailure" type="checkbox" class="h-3.5 w-3.5" />
                模拟发布失败（验证回滚）
              </label>
            </div>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>

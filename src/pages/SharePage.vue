<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfiguratorStore } from "../stores/configurator";
import { useRulePackageStore } from "../stores/rulePackage";
import { evaluatePrice, evaluateSpecs } from "../rules/engine";
import { decodeConfiguration, formatPrice } from "../utils/share";
import type { GroupId } from "../types/product";
import ProductScene from "../components/ProductScene.vue";

const route = useRoute();
const router = useRouter();
const store = useConfiguratorStore();
const rulePackage = useRulePackageStore();

const valid = ref(true);
const ruleVersion = ref(1);
/** 旧版链接没有规则版本，升级时补成首版 */
const migratedFromLegacy = ref(false);
/** 链接引用的版本已不存在（如来自更新的环境） */
const versionMissing = ref(false);
const useCurrentVersion = ref(false);

const pinnedContent = computed(() => {
  const content = rulePackage.getContent(ruleVersion.value);
  return content ?? null;
});
const activeContent = computed(() =>
  useCurrentVersion.value ? rulePackage.currentContent : (pinnedContent.value ?? rulePackage.currentContent),
);
const activeVersion = computed(() => (useCurrentVersion.value || !pinnedContent.value ? rulePackage.currentVersion : ruleVersion.value));
const hasNewerVersion = computed(() => rulePackage.currentVersion > ruleVersion.value);

const options = computed(() => {
  const entries = activeContent.value.groups.map((group) => {
    const selected = group.options.find((option) => option.id === store.configuration[group.id]) ?? group.options[0]!;
    return [group.id, selected];
  });
  return Object.fromEntries(entries) as Record<GroupId, (typeof activeContent.value.groups)[number]["options"][number]>;
});
const price = computed(() => evaluatePrice(activeContent.value, store.configuration));
const specs = computed(() => evaluateSpecs(activeContent.value, store.configuration));

const summaryGroups = computed(() => [
  { label: "机身颜色", value: options.value.color.name },
  { label: "外壳材质", value: options.value.material.name },
  { label: "滤芯系统", value: options.value.filter.name },
  { label: "续航模块", value: options.value.battery.name },
  { label: "支架形态", value: options.value.stand.name },
  { label: "控制环", value: options.value.trim.name },
]);

onMounted(() => {
  const decoded = decodeConfiguration(String(route.params.payload ?? ""));
  if (!decoded) {
    valid.value = false;
    return;
  }
  if (decoded.ruleVersion == null) {
    // 旧数据没有规则版本：补记为首版
    migratedFromLegacy.value = true;
    ruleVersion.value = 1;
  } else {
    ruleVersion.value = decoded.ruleVersion;
  }
  versionMissing.value = !rulePackage.getContent(ruleVersion.value);
  // 按链接引用的规则包版本校验修正，保证还原的是当时那套规则
  store.applyConfiguration(decoded.configuration, pinnedContent.value ?? undefined);
});
</script>

<template>
  <div class="min-h-screen bg-[#eef1f4] p-5">
    <div v-if="valid" class="mx-auto max-w-6xl">
      <header class="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Shared Configuration</p>
          <h1 class="mt-1 text-3xl font-black text-slate-900">您的 AeroStation S4 配置</h1>
          <p class="mt-1 text-sm text-slate-500">分享链接已还原颜色、部件、滤芯、电池和支架。</p>
        </div>
        <button class="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white" @click="router.push('/')">继续调整配置</button>
      </header>

      <div class="mb-4 space-y-2">
        <p v-if="migratedFromLegacy" class="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          该链接创建于规则版本化之前，升级时已自动补记为首版 v1，报价与规格按首版规则包计算。
        </p>
        <p v-if="versionMissing" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          链接引用的规则包 v{{ ruleVersion }} 在此环境中不存在，已按当前版本 v{{ rulePackage.currentVersion }} 计算。
        </p>
        <div class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span class="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold text-white">规则包 v{{ activeVersion }}</span>
          <p class="text-xs text-slate-500">本页的报价与规格严格按该版本计算，不受后续规则调整影响。</p>
          <template v-if="hasNewerVersion && !versionMissing">
            <span class="text-xs text-amber-600">门店现行规则包已更新到 v{{ rulePackage.currentVersion }}</span>
            <button
              class="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50"
              @click="useCurrentVersion = !useCurrentVersion"
            >
              {{ useCurrentVersion ? "切回链接版本" : `按现行版本 v${rulePackage.currentVersion} 查看` }}
            </button>
          </template>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div class="h-[620px]"><ProductScene /></div>
        <aside class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wider text-slate-400">配置摘要</p>
          <div class="mt-5 space-y-4">
            <div v-for="group in summaryGroups" :key="group.label" class="flex justify-between border-b border-slate-100 pb-3 text-sm">
              <span class="text-slate-500">{{ group.label }}</span>
              <span class="font-bold text-slate-900">{{ group.value }}</span>
            </div>
          </div>
          <div class="mt-5 rounded-xl bg-blue-50 p-4">
            <p class="flex items-center justify-between text-xs text-blue-600">
              配置总价
              <span class="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold">按 v{{ activeVersion }} 计价</span>
            </p>
            <p class="mt-1 text-2xl font-black text-blue-800">{{ formatPrice(price) }}</p>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <div v-for="spec in specs.slice(0, 4)" :key="spec.label" class="rounded-lg bg-slate-50 p-3">
              <p class="text-[10px] text-slate-400">{{ spec.label }}</p>
              <p class="mt-1 text-xs font-bold text-slate-800">{{ spec.value }}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
    <div v-else class="mx-auto mt-32 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 class="text-xl font-black text-slate-900">分享链接无效</h1>
      <p class="mt-2 text-sm text-slate-500">链接参数已损坏或来自不兼容版本。</p>
      <button class="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white" @click="router.push('/')">创建新配置</button>
    </div>
  </div>
</template>

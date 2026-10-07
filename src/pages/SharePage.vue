<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useConfiguratorStore } from "../stores/configurator";
import { useRulePackageStore } from "../stores/rulePackages";
import { decodeConfiguration, formatPrice } from "../utils/share";
import { computeStaleness } from "../utils/staleness";
import ProductScene from "../components/ProductScene.vue";

const route = useRoute();
const router = useRouter();
const store = useConfiguratorStore();
const rulePackageStore = useRulePackageStore();
const { currentPackage } = storeToRefs(rulePackageStore);
const valid = ref(true);

const referencedVersion = ref<string>("");
const staleInfo = computed(() => {
  if (!referencedVersion.value || referencedVersion.value === currentPackage.value.version) {
    return { stale: false, reasons: [] as string[] };
  }
  const referenced =
    rulePackageStore.publishedPackages.find((pkg) => pkg.version === referencedVersion.value) ??
    rulePackageStore.packages.find((pkg) => pkg.version === referencedVersion.value);
  if (!referenced) return { stale: false, reasons: [] as string[] };
  return computeStaleness(store.configuration, referenced, currentPackage.value);
});

onMounted(() => {
  const next = decodeConfiguration(String(route.params.payload ?? ""));
  if (!Object.keys(next).length) {
    valid.value = false;
    return;
  }
  referencedVersion.value = next.rulePackageVersion ?? currentPackage.value.version;
  store.applyConfiguration(next, referencedVersion.value);
});
</script>

<template>
  <div class="min-h-screen bg-[#eef1f4] p-5">
    <div v-if="valid" class="mx-auto max-w-6xl">
      <header class="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Shared Configuration</p>
          <h1 class="mt-1 text-3xl font-black text-slate-900">您的 AeroStation S4 配置</h1>
          <p class="mt-1 text-sm text-slate-500">
            分享链接已还原颜色、部件、滤芯、电池和支架。
            <span class="font-bold text-slate-700">引用规则包 v{{ referencedVersion }}</span>
          </p>
        </div>
        <button class="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white" @click="router.push('/')">继续调整配置</button>
      </header>

      <div
        v-if="staleInfo.stale"
        class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
      >
        <p class="text-sm font-black text-amber-800">规则包已更新至 v{{ currentPackage.version }}</p>
        <p class="mt-1 text-xs text-amber-700">本配置引用的 v{{ referencedVersion }} 已失效，以下报价和规格已按新版重算：</p>
        <ul class="mt-2 list-inside list-disc space-y-0.5 text-xs text-amber-700">
          <li v-for="(reason, index) in staleInfo.reasons" :key="index">{{ reason }}</li>
        </ul>
      </div>
      <div
        v-else-if="referencedVersion && referencedVersion !== currentPackage.version"
        class="mb-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        <p class="text-sm font-black text-slate-700">规则包已更新至 v{{ currentPackage.version }}</p>
        <p class="mt-1 text-xs text-slate-500">本配置引用的 v{{ referencedVersion }} 未受影响，报价和规格沿用旧版结果。</p>
      </div>

      <div class="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div class="h-[620px]"><ProductScene /></div>
        <aside class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wider text-slate-400">配置摘要</p>
          <div class="mt-5 space-y-4">
            <div v-for="group in [
              { label: '机身颜色', value: store.options.color.name },
              { label: '外壳材质', value: store.options.material.name },
              { label: '滤芯系统', value: store.options.filter.name },
              { label: '续航模块', value: store.options.battery.name },
              { label: '支架形态', value: store.options.stand.name },
              { label: '控制环', value: store.options.trim.name },
            ]" :key="group.label" class="flex justify-between border-b border-slate-100 pb-3 text-sm">
              <span class="text-slate-500">{{ group.label }}</span>
              <span class="font-bold text-slate-900">{{ group.value }}</span>
            </div>
          </div>
          <div class="mt-5 rounded-xl bg-blue-50 p-4">
            <p class="text-xs text-blue-600">配置总价</p>
            <p class="mt-1 text-2xl font-black text-blue-800">{{ formatPrice(store.price) }}</p>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <div v-for="spec in store.specs.slice(0, 4)" :key="spec.label" class="rounded-lg bg-slate-50 p-3">
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

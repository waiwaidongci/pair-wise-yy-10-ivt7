<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useConfiguratorStore } from "../stores/configurator";
import { useRulePackageStore } from "../stores/rulePackage";
import { useSavedConfigsStore } from "../stores/savedConfigs";
import { createShareUrl, formatDateTime, formatPrice } from "../utils/share";
import type { SavedConfiguration } from "../types/rules";

const router = useRouter();
const configurator = useConfiguratorStore();
const rulePackage = useRulePackageStore();
const savedConfigs = useSavedConfigsStore();
const { configs } = storeToRefs(savedConfigs);
const copiedId = ref("");

const sortedConfigs = computed(() => configs.value);

function optionNames(entry: SavedConfiguration) {
  const content = rulePackage.getContent(entry.reconciledVersion) ?? rulePackage.currentContent;
  return content.groups.map((group) => {
    const option = group.options.find((item) => item.id === entry.configuration[group.id]);
    return { group: group.name, option: option?.name ?? entry.configuration[group.id] };
  });
}

function openInConfigurator(entry: SavedConfiguration) {
  configurator.applyConfiguration(entry.configuration);
  router.push("/");
}

async function copyShareLink(entry: SavedConfiguration) {
  const url = createShareUrl(entry.configuration, entry.reconciledVersion);
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt("复制分享链接", url);
  }
  copiedId.value = entry.id;
  window.setTimeout(() => (copiedId.value = ""), 1800);
}
</script>

<template>
  <div class="min-h-screen bg-[#eef1f4] p-4 sm:p-6">
    <div class="mx-auto max-w-6xl">
      <header class="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Saved Configurations</p>
          <h1 class="mt-1 text-2xl font-black text-slate-900">已保存配置</h1>
          <p class="mt-1 text-xs text-slate-500">每份配置保存时记录引用的规则包版本；规则包更新后，受影响的报价和规格失效重算，其余沿用旧结果。</p>
        </div>
        <div class="flex gap-2">
          <button class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50" @click="router.push('/rules')">规则包管理</button>
          <button class="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white" @click="router.push('/')">返回配置器</button>
        </div>
      </header>

      <div v-if="!sortedConfigs.length" class="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-16 text-center">
        <p class="text-sm font-black text-slate-600">还没有保存的配置</p>
        <p class="mt-2 text-xs text-slate-400">在配置器中完成选配后，填写名称并点击「保存配置」，即可记录当前规则包版本。</p>
        <button class="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white" @click="router.push('/')">去配置</button>
      </div>

      <div v-else class="space-y-4">
        <article v-for="entry in sortedConfigs" :key="entry.id" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="flex flex-wrap items-center gap-2 text-sm font-black text-slate-900">
                {{ entry.name }}
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{{ entry.storeName }}</span>
              </p>
              <p class="mt-1 text-[11px] text-slate-400">
                保存于 {{ formatDateTime(entry.savedAt) }} · 引用规则包 v{{ entry.savedVersion }}
                <template v-if="entry.reconciledVersion !== entry.savedVersion"> · 结果已协调至 v{{ entry.reconciledVersion }}</template>
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-slate-700" @click="openInConfigurator(entry)">在配置器中打开</button>
              <button class="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50" @click="copyShareLink(entry)">
                {{ copiedId === entry.id ? "链接已复制" : "复制分享链接" }}
              </button>
              <button class="rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-500 hover:bg-rose-50" @click="savedConfigs.remove(entry.id)">删除</button>
            </div>
          </div>

          <div class="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
            <div>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="item in optionNames(entry)" :key="item.group" class="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] text-slate-500">
                  {{ item.group }} · <b class="text-slate-700">{{ item.option }}</b>
                </span>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div v-for="(specEntry, label) in entry.results.specs" :key="label" class="rounded-lg bg-slate-50 p-2.5">
                  <p class="flex items-center justify-between text-[9px] text-slate-400">
                    {{ label }}
                    <span class="rounded bg-slate-200/70 px-1 py-px text-[8px] font-bold text-slate-500">v{{ specEntry.version }}</span>
                  </p>
                  <p class="mt-0.5 text-xs font-bold text-slate-800">{{ specEntry.value }}</p>
                </div>
              </div>
            </div>
            <div class="rounded-xl bg-blue-50 p-4">
              <p class="flex items-center justify-between text-[10px] text-blue-600">
                配置总价
                <span class="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold">按 v{{ entry.results.quote.version }} 计算</span>
              </p>
              <p class="mt-1 text-xl font-black text-blue-800">{{ formatPrice(entry.results.quote.value) }}</p>
              <p class="mt-2 text-[10px] leading-relaxed text-blue-500">每项结果右角的版本标记表示该数值由哪一版规则包算出；未受规则改动影响的条目沿用旧结果。</p>
            </div>
          </div>

          <div v-if="entry.history.length" class="mt-4 border-t border-slate-100 pt-3">
            <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">失效重算记录</p>
            <div class="mt-2 space-y-2">
              <div v-for="(record, index) in entry.history" :key="index" class="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
                <p class="font-bold text-slate-700">规则包发布 v{{ record.toVersion }} · {{ formatDateTime(record.at) }}</p>
                <p v-if="record.recomputed.length" class="mt-1"><span class="font-bold text-amber-600">失效重算：</span>{{ record.recomputed.join("、") }}</p>
                <p v-if="record.kept.length" class="mt-0.5"><span class="font-bold text-emerald-600">沿用旧结果：</span>{{ record.kept.join("、") }}</p>
                <p v-if="record.corrections.length" class="mt-0.5"><span class="font-bold text-sky-600">配置修正：</span>{{ record.corrections.join("；") }}</p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

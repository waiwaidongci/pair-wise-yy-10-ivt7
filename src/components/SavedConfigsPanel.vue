<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useSavedConfigsStore } from "../stores/savedConfigs";
import { useConfiguratorStore } from "../stores/configurator";
import { formatPrice } from "../utils/share";
import type { SavedConfig } from "../types/rulePackage";

const savedStore = useSavedConfigsStore();
const configuratorStore = useConfiguratorStore();
const { savedConfigs, staleCount } = storeToRefs(savedStore);

const emit = defineEmits<{ close: [] }>();

function loadConfig(entry: SavedConfig) {
  configuratorStore.applyConfiguration(entry.configuration, entry.rulePackageVersion);
  emit("close");
}

function recalculate(entry: SavedConfig) {
  // Recompute the snapshot against the current package and clear staleness.
  const current = configuratorStore.currentPackage;
  configuratorStore.applyConfiguration(entry.configuration, current.version);
  const updated: SavedConfig = {
    ...entry,
    rulePackageVersion: current.version,
    rulePackageId: current.id,
    price: configuratorStore.price,
    specs: configuratorStore.specs.map((spec) => ({ ...spec })),
    stale: false,
    staleReasons: [],
  };
  savedStore.updateConfig(updated);
  savedStore.refreshAllStaleness();
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="emit('close')">
    <div class="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Saved Configurations</p>
          <h2 class="text-xl font-black text-slate-900">已保存的配置</h2>
          <p v-if="staleCount" class="mt-1 text-xs text-amber-600">{{ staleCount }} 份配置因规则包更新而失效，需重算。</p>
        </div>
        <button class="rounded-lg px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100" @click="emit('close')">关闭</button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div v-if="!savedConfigs.length" class="py-12 text-center">
          <p class="text-sm text-slate-400">暂无已保存的配置。</p>
          <p class="mt-1 text-xs text-slate-400">在配置面板中保存当前配置，即可在此查看。</p>
        </div>

        <div class="space-y-3">
          <div
            v-for="entry in savedConfigs"
            :key="entry.id"
            class="rounded-xl border p-4"
            :class="entry.stale ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-white'"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-black text-slate-900">{{ entry.name }}</p>
                <p class="mt-0.5 text-[11px] text-slate-400">
                  引用规则包 v{{ entry.rulePackageVersion }} · 保存于 {{ new Date(entry.savedAt).toLocaleString('zh-CN') }}
                </p>
              </div>
              <div class="text-right">
                <p class="text-lg font-black text-slate-900">{{ formatPrice(entry.price) }}</p>
                <span
                  v-if="entry.stale"
                  class="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700"
                >已失效</span>
                <span v-else class="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">沿用旧结果</span>
              </div>
            </div>

            <div v-if="entry.stale" class="mt-3 rounded-lg bg-white p-3">
              <p class="text-[10px] font-black uppercase tracking-wider text-amber-600">失效原因</p>
              <ul class="mt-1 space-y-0.5">
                <li v-for="(reason, index) in entry.staleReasons" :key="index" class="text-[11px] text-slate-600">{{ reason }}</li>
              </ul>
              <div class="mt-3 flex gap-2">
                <button
                  class="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-black text-white hover:bg-amber-700"
                  @click="recalculate(entry)"
                >按新版重算</button>
                <button
                  class="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
                  @click="loadConfig(entry)"
                >加载配置</button>
              </div>
            </div>

            <div v-else class="mt-3 flex gap-2">
              <button
                class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-black text-white hover:bg-blue-700"
                @click="loadConfig(entry)"
              >加载配置</button>
              <button
                class="rounded-lg px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
                @click="savedStore.deleteConfig(entry.id)"
              >删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

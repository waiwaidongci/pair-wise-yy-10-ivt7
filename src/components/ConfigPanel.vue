<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import OptionGroup from "./OptionGroup.vue";
import { useConfiguratorStore } from "../stores/configurator";
import { useRulePackageStore } from "../stores/rulePackage";
import { useSavedConfigsStore } from "../stores/savedConfigs";
import { createShareUrl, formatPrice } from "../utils/share";

const store = useConfiguratorStore();
const rulePackage = useRulePackageStore();
const savedConfigs = useSavedConfigsStore();
const { configuration, shareNotice, groups } = storeToRefs(store);
const copied = ref(false);
const configName = ref("");
const savedNotice = ref("");

async function copyShareLink() {
  const url = createShareUrl(configuration.value, rulePackage.currentVersion);
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt("复制分享链接", url);
  }
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1800);
}

function saveCurrentConfig() {
  const entry = savedConfigs.save(configName.value, configuration.value);
  savedNotice.value = `已保存「${entry.name}」，引用规则包 v${entry.savedVersion}`;
  configName.value = "";
  window.setTimeout(() => (savedNotice.value = ""), 2400);
}
</script>

<template>
  <aside class="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:w-[430px]">
    <div class="border-b border-slate-200 p-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">AeroStation Configurator</p>
          <h1 class="mt-2 text-2xl font-black tracking-tight text-slate-900">模块化空气净化器 S4</h1>
          <p class="mt-1 flex items-center gap-2 text-xs text-slate-400">
            三维实时配置
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">规则包 v{{ rulePackage.currentVersion }}</span>
          </p>
        </div>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" @click="store.reset">重置</button>
      </div>

      <nav class="mt-4 flex gap-2 text-xs font-bold">
        <RouterLink to="/saved" class="rounded-lg bg-slate-100 px-3 py-2 text-slate-600 hover:bg-slate-200">已保存配置</RouterLink>
        <RouterLink to="/rules" class="rounded-lg bg-slate-100 px-3 py-2 text-slate-600 hover:bg-slate-200">规则包管理</RouterLink>
      </nav>

      <div class="mt-4 rounded-xl bg-slate-900 p-4 text-white">
        <div class="flex items-end justify-between">
          <div>
            <p class="text-[10px] uppercase tracking-wider text-slate-400">配置价格</p>
            <p class="mt-1 text-2xl font-black">{{ formatPrice(store.price) }}</p>
          </div>
          <p class="text-[10px] text-slate-400">含基础主机与选配模块</p>
        </div>
      </div>

      <p v-if="shareNotice || store.dependencyMessage" class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {{ shareNotice || store.dependencyMessage }}
      </p>
    </div>

    <div class="scroll-area min-h-0 flex-1 overflow-y-auto px-5">
      <OptionGroup
        v-for="group in groups"
        :key="group.id"
        :group="group"
        :selected="configuration[group.id]"
        :disabled="(optionId) => store.isOptionDisabled(group.id, optionId)"
        @select="(optionId) => store.selectOption(group.id, optionId)"
      />
    </div>

    <div class="space-y-3 border-t border-slate-200 p-4">
      <div class="flex gap-2">
        <input
          v-model="configName"
          type="text"
          placeholder="配置名称（如：老客户王姐方案）"
          class="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-blue-400"
          @keyup.enter="saveCurrentConfig"
        />
        <button
          class="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white transition hover:bg-slate-700"
          @click="saveCurrentConfig"
        >
          保存配置
        </button>
      </div>
      <p v-if="savedNotice" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{{ savedNotice }}</p>
      <button
        class="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
        @click="copyShareLink"
      >
        {{ copied ? "链接已复制" : "生成并复制分享链接" }}
      </button>
      <p class="text-center text-[10px] text-slate-400">分享链接会记录当前规则包版本（v{{ rulePackage.currentVersion }}），打开时按该版本计价</p>
    </div>
  </aside>
</template>

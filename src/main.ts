import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import { useRulePackageStore } from "./stores/rulePackages";
import { useSavedConfigsStore } from "./stores/savedConfigs";
import "./index.css";

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);

// Seed rule packages and migrate any legacy saved data on startup.
useRulePackageStore().initialize();
useSavedConfigsStore().initialize();

app.mount("#app");

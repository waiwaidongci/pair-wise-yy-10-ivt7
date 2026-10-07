import { createRouter, createWebHashHistory } from "vue-router";
import ConfiguratorPage from "../pages/ConfiguratorPage.vue";
import SharePage from "../pages/SharePage.vue";
import SavedConfigsPage from "../pages/SavedConfigsPage.vue";
import RulePackagePage from "../pages/RulePackagePage.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "configurator", component: ConfiguratorPage },
    { path: "/share/:payload", name: "share", component: SharePage },
    { path: "/saved", name: "saved", component: SavedConfigsPage },
    { path: "/rules", name: "rules", component: RulePackagePage },
  ],
});

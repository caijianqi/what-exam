import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", name: "home", component: () => import("../views/HomeView.vue"), meta: { title: "首页", tab: true } },
  { path: "/practice", name: "practice", component: () => import("../views/PracticeView.vue"), meta: { title: "刷题", tab: true } },
  { path: "/practice/session", name: "session", component: () => import("../views/SessionView.vue"), meta: { title: "做题", tab: false } },
  { path: "/wrong", name: "wrong", component: () => import("../views/WrongBookView.vue"), meta: { title: "错题本", tab: true } },
  { path: "/stats", name: "stats", component: () => import("../views/StatsView.vue"), meta: { title: "统计", tab: true } },
  { path: "/settings", name: "settings", component: () => import("../views/SettingsView.vue"), meta: { title: "设置", tab: true } },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});

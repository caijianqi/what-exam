<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSettingsStore } from "./stores/settings";

const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();

const active = computed(() => route.path);
const showTabbar = computed(() => route.meta.tab === true);

// 字号设置：写到 CSS 变量，全局生效
// 主题：挂在 <html data-theme> 上，供自定义 CSS 变量切换（Vant 组件由 ConfigProvider 处理）
watchEffect(() => {
  document.documentElement.style.setProperty(
    "--app-font-size",
    `${settings.fontSize}px`
  );
  document.documentElement.dataset.theme = settings.resolvedTheme;
});

function onChange(path: string) {
  if (path !== route.path) router.replace(path);
}
</script>

<template>
  <van-config-provider :theme="settings.resolvedTheme">
    <div class="app-root">
      <!-- 做题页自带滚动与底栏，不需要给 TabBar 预留空间 -->
      <div class="app-body" :class="{ 'no-tab': !showTabbar }">
        <router-view />
      </div>

      <van-tabbar
        v-if="showTabbar"
        :model-value="active"
        :safe-area-inset-bottom="true"
        @change="onChange"
      >
        <van-tabbar-item name="/" icon="home-o">首页</van-tabbar-item>
        <van-tabbar-item name="/practice" icon="edit">刷题</van-tabbar-item>
        <van-tabbar-item name="/wrong" icon="warning-o">错题</van-tabbar-item>
        <van-tabbar-item name="/stats" icon="chart-trending-o">统计</van-tabbar-item>
        <van-tabbar-item name="/settings" icon="setting-o">设置</van-tabbar-item>
      </van-tabbar>
    </div>
  </van-config-provider>
</template>

<style>
/* 字号设置作用于全局根容器（移动优先，不使用桌面断点） */
.app-root {
  font-size: var(--app-font-size, 15px);
}

.app-body.no-tab {
  padding-bottom: 0;
  overflow: hidden;
}
</style>

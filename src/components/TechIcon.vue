<script setup lang="ts">
/**
 * 科技风矢量微图标集合（0 依赖，纯 SVG）。
 * 覆盖 TabBar 导航图标与四大模块专属徽标。
 */
defineProps<{
  name:
    | "home"
    | "practice"
    | "wrong"
    | "stats"
    | "settings"
    | "shuliang"
    | "panduan"
    | "yanyu"
    | "ziliao";
  active?: boolean;
  size?: number | string;
  color?: string;
}>();
</script>

<template>
  <svg
    class="tech-icon"
    :class="{ 'is-active': active }"
    :width="size || 22"
    :height="size || 22"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :style="color ? { '--icon-color': color } : undefined"
  >
    <!-- 1. 首页：HUD 控制台 / 战备基地 -->
    <g v-if="name === 'home'">
      <path
        d="M3 10.5L12 3L21 10.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V10.5Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <circle cx="12" cy="14" r="2.5" fill="currentColor" opacity="0.9" />
      <path
        d="M9 21V16.5C9 15.6716 9.67157 15 10.5 15H13.5C14.3284 15 15 15.6716 15 16.5V21"
        stroke="currentColor"
        stroke-width="1.8"
      />
    </g>

    <!-- 2. 刷题：闪电战术笔 / 高能答题 -->
    <g v-else-if="name === 'practice'">
      <path
        d="M13 2L3 14H12L11 22L21 10H12L13 2Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        :fill="active ? 'currentColor' : 'none'"
        :fill-opacity="active ? '0.2' : '0'"
      />
    </g>

    <!-- 3. 错题：歼灭准星 / 战损锁定 -->
    <g v-else-if="name === 'wrong'">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8" />
      <path d="M12 2V6M12 18V22M2 12H6M18 12H22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </g>

    <!-- 4. 统计：全息雷达 / 战力频段 -->
    <g v-else-if="name === 'stats'">
      <path d="M4 20H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <rect x="5.5" y="12" width="3" height="8" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="10.5" y="7" width="3" height="13" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="15.5" y="4" width="3" height="16" rx="1" fill="currentColor" />
      <path d="M6 10L11 5L15 8L19 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- 5. 设置：机能核心齿轮 / 控制中枢 -->
    <g v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.8" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
    </g>

    <!-- 6. 模块：数量关系（∑ 算力矩阵） -->
    <g v-else-if="name === 'shuliang'">
      <path
        d="M18 4H6L13 12L6 20H18"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>

    <!-- 7. 模块：判断推理（逻辑晶体拓扑） -->
    <g v-else-if="name === 'panduan'">
      <path
        d="M12 2L21 7V17L12 22L3 17V7L12 2Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M12 2V9.5M12 14.5V22M3 7L9.5 10.5M14.5 13.5L21 17M21 7L14.5 10.5M9.5 13.5L3 17" stroke="currentColor" stroke-width="1.4" opacity="0.75" />
    </g>

    <!-- 8. 模块：言语理解（全息语言波形） -->
    <g v-else-if="name === 'yanyu'">
      <path
        d="M21 12C21 16.4183 16.9706 20 12 20C10.536 20 9.15546 19.6888 7.93512 19.1309L3 20.5L4.54203 16.3879C3.58284 15.1118 3 13.6198 3 12C3 7.58172 7.02944 4 12 4C16.9706 4 21 7.58172 21 12Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <path d="M7.5 12H7.51M12 12H12.01M16.5 12H16.51" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
    </g>

    <!-- 9. 模块：资料分析（全息透视统计图） -->
    <g v-else-if="name === 'ziliao'">
      <path d="M3 21H21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M4 16L9 11L14 15L20 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="20" cy="8" r="1.8" fill="currentColor" />
      <path d="M6 19V17M11 19V14M16 19V16" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.6" />
    </g>
  </svg>
</template>

<style scoped>
.tech-icon {
  display: inline-block;
  vertical-align: middle;
  color: var(--icon-color, var(--text-sub));
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.tech-icon.is-active {
  color: var(--icon-color, var(--brand-a));
  filter: drop-shadow(0 0 6px var(--brand-glow));
  transform: translateY(-1px) scale(1.05);
}
</style>

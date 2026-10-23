<script setup lang="ts">
import { computed } from "vue";
import { parseAiDualViews, parseAiSections } from "../utils/aiFormat";

const props = withDefaults(
  defineProps<{
    content: string;
    model: string;
    viewMode?: "standard" | "speed" | "all";
  }>(),
  {
    viewMode: "all",
  }
);

const emit = defineEmits<{
  (e: "copy"): void;
  (e: "regenerate"): void;
}>();

const dualViews = computed(() => parseAiDualViews(props.content));
const sections = computed(() => {
  if (props.viewMode === "standard") return dualViews.value.standard;
  if (props.viewMode === "speed") return dualViews.value.speed;
  return parseAiSections(props.content);
});
</script>

<template>
  <div class="ai-viewer" :class="`view-${viewMode}`">
    <!-- 顶栏状态与操作栏 -->
    <div class="ai-head-bar">
      <div class="ai-head-left">
        <div class="ai-model-badge">
          <van-icon name="gem-o" class="model-icon" />
          <span>{{ model }}</span>
        </div>
      </div>
      <div class="ai-actions">
        <van-button size="mini" plain class="act-btn" @click="emit('copy')">
          <van-icon name="records-o" />
          <span>复制</span>
        </van-button>
        <van-button size="mini" plain class="act-btn" @click="emit('regenerate')">
          <van-icon name="replay" />
          <span>重新生成</span>
        </van-button>
      </div>
    </div>

    <!-- 结构化卡片模块 -->
    <div class="ai-sections-container">
      <div
        v-for="sec in sections"
        :key="sec.title"
        class="ai-sec-card"
        :class="`sec-${sec.type}`"
      >
        <div class="sec-header">
          <span class="sec-icon-wrap">
            <span v-if="sec.type === 'speed'">⚡</span>
            <span v-else-if="sec.type === 'point'">🎯</span>
            <span v-else-if="sec.type === 'steps'">💡</span>
            <span v-else-if="sec.type === 'options'">⚖️</span>
            <span v-else-if="sec.type === 'tips'">🌟</span>
            <span v-else>📖</span>
          </span>
          <span class="sec-title">{{ sec.title }}</span>
        </div>
        <div class="sec-body" v-html="sec.html"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-viewer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-head-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--border-color);
}

.ai-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-model-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 600;
  color: var(--brand-a);
}


.model-icon {
  font-size: 12px;
}

.ai-actions {
  display: flex;
  gap: 6px;
}

.act-btn {
  height: 24px;
  padding: 0 8px;
  font-size: 11px;
  border-radius: 6px;
}

/* 各模块卡片排版 */
.ai-sections-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-sec-card {
  border-radius: var(--r-sm);
  padding: 10px 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  transition: all 0.2s ease;
}

.sec-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.sec-icon-wrap {
  font-size: 14px;
  line-height: 1;
}

/* 考点定位 - 蓝紫系 */
.sec-point {
  border-left: 3.5px solid var(--brand-a);
  background: linear-gradient(135deg, var(--card-bg) 80%, var(--brand-soft));
}
.sec-point .sec-title {
  color: var(--brand-a);
}

/* 解题思路 - 翠青/深蓝系 */
.sec-steps {
  border-left: 3.5px solid var(--ok);
}
.sec-steps .sec-title {
  color: var(--ok);
}

/* 选项辨析 - 科技灰卡片 */
.sec-options {
  border-left: 3.5px solid #8b5cf6;
}
.sec-options .sec-title {
  color: #8b5cf6;
}

/* 名师点拨 - 琥珀日落金 */
.sec-tips {
  border-left: 3.5px solid var(--warn);
  background: linear-gradient(135deg, var(--card-bg) 85%, rgba(245, 158, 11, 0.08));
}
.sec-tips .sec-title {
  color: var(--warn);
}

/* 30秒极速秒杀 - 高能闪电金与极速光晕 */
.sec-speed {
  border-left: 3.5px solid #f59e0b;
  background: linear-gradient(135deg, var(--card-bg) 80%, rgba(245, 158, 11, 0.14));
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.12);
}
.sec-speed .sec-title {
  color: #d97706;
  font-weight: 800;
}

.sec-body :deep(.ai-speed-empty-tip) {
  padding: 12px 8px;
  text-align: center;
  color: var(--text-sub);
  font-size: 12.5px;
}

.sec-body {
  font-size: 13px;
  line-height: 1.85;
  color: var(--text-main);
  text-align: justify;
  word-break: break-word;
}

/* 段落与公式深度样式 */
.sec-body :deep(p) {
  margin: 4px 0;
}

.sec-body :deep(strong) {
  color: var(--text-main);
  font-weight: 700;
}

/* 数学公式块 */
.sec-body :deep(.ai-math-block) {
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--mat-bg);
  border: 1px dashed var(--border-color);
  text-align: center;
  font-family: var(--font-mono);
  font-size: 13.5px;
  font-weight: 600;
  line-height: 2;
  color: var(--brand-a);
  overflow-x: auto;
}

.sec-body :deep(.ai-math-block sup),
.sec-body :deep(.ai-math-inline sup) {
  font-size: 0.78em;
  vertical-align: super;
  line-height: 0;
}

.sec-body :deep(.ai-math-block sub),
.sec-body :deep(.ai-math-inline sub) {
  font-size: 0.78em;
  vertical-align: sub;
  line-height: 0;
}

/* 行内公式 */
.sec-body :deep(.ai-math-inline) {
  display: inline-block;
  padding: 0 4px;
  margin: 0 2px;
  border-radius: 4px;
  background: var(--mat-bg);
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--brand-a);
  border: 1px solid var(--border-color);
}

/* 重点答案加框 \boxed{...} */
.sec-body :deep(.ai-math-boxed) {
  display: inline-block;
  padding: 1px 7px;
  margin: 0 3px;
  border: 1.5px solid var(--brand-a);
  border-radius: 5px;
  background: var(--brand-soft);
  color: var(--brand-a);
  font-weight: 700;
  box-shadow: 0 1px 4px var(--brand-glow);
  vertical-align: baseline;
}

/* 推导步骤箭头标注 */
.sec-body :deep(.ai-step-arrow) {
  display: inline-block;
  color: var(--brand-a);
  font-weight: 700;
  letter-spacing: -0.5px;
  padding: 0 3px;
}
.sec-speed .sec-body :deep(.ai-step-arrow) {
  color: #d97706;
}

.sec-body :deep(.ai-math-underline) {
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* 分式微排版 */
.sec-body :deep(.ai-frac) {
  display: inline-flex;
  flex-direction: column;
  vertical-align: middle;
  text-align: center;
  font-size: 11px;
  line-height: 1.1;
  padding: 0 3px;
}
.sec-body :deep(.frac-n) {
  border-bottom: 1px solid currentColor;
  padding-bottom: 1px;
}
.sec-body :deep(.frac-d) {
  padding-top: 1px;
}

/* 选项辨析选项胶囊标签 */
.sec-body :deep(.ai-opt-item) {
  margin-top: 8px;
  padding: 4px 0;
}
.sec-body :deep(.ai-opt-badge) {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 5px;
  margin-right: 4px;
}
.sec-body :deep(.badge-neutral) {
  background: var(--mat-bg);
  color: var(--text-sub);
  border: 1px solid var(--border-color);
}
.sec-body :deep(.badge-correct) {
  background: var(--opt-bg-correct);
  color: var(--ok);
  border: 1px solid var(--ok);
}
.sec-body :deep(.badge-user) {
  background: var(--opt-bg-wrong);
  color: var(--bad);
  border: 1px solid var(--bad);
}

.sec-body :deep(.ai-code) {
  background: var(--mat-bg);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 12px;
}

/* Markdown 表格美化 */
.sec-body :deep(.ai-table-wrap) {
  margin: 10px 0;
  overflow-x: auto;
  border-radius: var(--r-sm);
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.sec-body :deep(.ai-table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: center;
}

.sec-body :deep(.ai-table th) {
  background: var(--mat-bg);
  color: var(--text-sub);
  font-weight: 600;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}

.sec-body :deep(.ai-table td) {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-main);
}

.sec-body :deep(.ai-table tr:last-child td) {
  border-bottom: none;
}

/* Markdown 引用块美化 */
.sec-body :deep(.ai-quote) {
  margin: 8px 0;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--mat-bg);
  border-left: 3.5px solid var(--brand-a);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-main);
  overflow-x: auto;
}

/* 数列推导流（Sequence Mapping Flow）垂直精准对齐 */
.sec-body :deep(.ai-mapping-wrap) {
  margin: 10px 0;
  padding: 10px 14px;
  border-radius: var(--r-sm);
  background: var(--mat-bg);
  border: 1px solid var(--border-color);
  border-left: 3.5px solid var(--brand-a);
  overflow-x: auto;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}

.sec-body :deep(.ai-mapping-flow) {
  display: inline-flex;
  align-items: center;
  min-width: 100%;
  justify-content: space-around;
  gap: 2px;
  padding: 2px 0;
}

.sec-body :deep(.map-col) {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 3px;
  flex: none;
}

.sec-body :deep(.map-top) {
  font-size: 13.5px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text-main);
}

.sec-body :deep(.map-arrow) {
  font-size: 14px;
  line-height: 1;
  color: var(--brand-a);
  font-weight: 800;
  margin: 1px 0;
}

.sec-body :deep(.map-bottom) {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--brand-a);
  background: var(--card-bg);
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid var(--border-color);
  white-space: nowrap;
}

.sec-body :deep(.map-sep) {
  font-size: 13px;
  color: var(--text-sub);
  align-self: center;
  margin: 0 2px;
}
</style>

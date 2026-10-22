<script setup lang="ts">
/**
 * 选项区。
 *
 * 三种形态：
 *   1. 文字选项（多数题）
 *   2. 图形选项：四个选项合成一张图（optionImage），A/B/C/D 退化成一排点选按钮
 *   3. 逐项图片：每个选项自带一张 PNG
 *
 * 增强交互：
 *   - 排除法：长按选项或点击右侧划除按钮，可划除干扰项（避免误选）
 *   - 点击已排除项可一键恢复
 */
import { computed, ref, watch } from "vue";
import { showImagePreview } from "vant";
import type { Question, QuestionOption } from "../data/bank";
import { assetUrl } from "../data/bank";
import { richText } from "../utils/html";

const props = defineProps<{
  question: Question;
  chosen: string | null;
  /** 是否已判分（练习模式作答后 / 模考交卷后） */
  judged: boolean;
  disabled: boolean;
}>();

const emit = defineEmits<{ (e: "choose", key: string): void }>();

const optionImageUrl = computed(() =>
  props.question.optionImage ? assetUrl(props.question.optionImage) : ""
);

// 排除项集合（切题自动重置）
const eliminated = ref<Set<string>>(new Set());

watch(
  () => props.question.id,
  () => {
    eliminated.value.clear();
  }
);

function toggleEliminate(key: string, e?: Event) {
  if (e) e.stopPropagation();
  if (props.disabled || props.judged) return;
  if (eliminated.value.has(key)) {
    eliminated.value.delete(key);
  } else {
    eliminated.value.add(key);
  }
}

// 长按排除手势
let pressTimer: number | null = null;
let isLongPress = false;

function onTouchStart(key: string) {
  if (props.disabled || props.judged) return;
  isLongPress = false;
  pressTimer = window.setTimeout(() => {
    isLongPress = true;
    toggleEliminate(key);
  }, 420);
}

function onTouchEnd() {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
}

function onOptionClick(key: string) {
  if (isLongPress) {
    isLongPress = false;
    return;
  }
  if (props.disabled) return;
  if (eliminated.value.has(key)) {
    // 点击已被排除的选项 → 自动解除排除
    toggleEliminate(key);
    return;
  }
  emit("choose", key);
}

function clsOf(o: QuestionOption): Record<string, boolean> {
  const q = props.question;
  const picked = props.chosen === o.key;
  const right = o.key === q.answer;
  if (!props.judged) return { picked };
  return {
    picked,
    correct: right,
    wrong: picked && !right,
  };
}

function preview(url: string) {
  showImagePreview({ images: [url], closeable: true, maxZoom: 3 });
}

function previewOptions() {
  const urls = [optionImageUrl.value];
  showImagePreview({ images: urls, closeable: true, maxZoom: 3 });
}
</script>

<template>
  <div class="opts">
    <!-- 形态 2：四选一合图 -->
    <div v-if="question.optionImage" class="opt-image-wrap">
      <img
        class="opt-image"
        :src="optionImageUrl"
        alt="选项图"
        @click="previewOptions"
      />
      <div class="img-tip">点击图片可放大 · 长按字母可排除</div>
      <div class="graphic-keys">
        <button
          v-for="o in question.options"
          :key="o.key"
          class="gkey"
          :class="[clsOf(o), { eliminated: eliminated.has(o.key) }]"
          :disabled="disabled"
          @touchstart.passive="onTouchStart(o.key)"
          @touchend.passive="onTouchEnd"
          @click="onOptionClick(o.key)"
        >
          {{ o.key }}
        </button>
      </div>
    </div>

    <!-- 形态 1/3：文字或逐项图 -->
    <template v-else>
      <div
        v-for="o in question.options"
        :key="o.key"
        class="opt"
        :class="[clsOf(o), { eliminated: eliminated.has(o.key) }]"
        @touchstart.passive="onTouchStart(o.key)"
        @touchend.passive="onTouchEnd"
        @click="onOptionClick(o.key)"
      >
        <span class="opt-key">{{ o.key }}</span>
        <span v-if="o.text" class="opt-text" v-html="richText(o.text)"></span>
        <img
          v-else-if="o.image"
          class="opt-inline-img"
          :src="assetUrl(o.image)"
          alt="选项图"
          @click.stop="preview(assetUrl(o.image))"
        />

        <!-- 快捷排除划线按钮（仅未判分未锁定时可用） -->
        <button
          v-if="!disabled && !judged"
          type="button"
          class="opt-del"
          :class="{ on: eliminated.has(o.key) }"
          :title="eliminated.has(o.key) ? '取消排除' : '排除该项'"
          @click.stop="toggleEliminate(o.key, $event)"
        >
          <span class="del-slash"></span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.opts {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.opt {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  transition: background 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.2s ease,
    transform 0.15s ease;
}
.opt:active {
  transform: scale(0.985);
}

.opt-text {
  flex: 1;
  font-size: calc(var(--app-font-size, 15px) + 0px);
  line-height: 1.6;
  word-break: break-word;
}

.opt-key {
  flex: none;
  width: 25px;
  height: 25px;
  line-height: 23px;
  text-align: center;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--mat-bg);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-sub);
  transition: all 0.2s ease;
}

.opt-inline-img {
  max-width: 100%;
  border-radius: 6px;
  cursor: zoom-in;
}

/* 未判分时选中 */
.opt.picked {
  border-color: var(--brand-a);
  background: var(--opt-bg-picked);
  box-shadow: 0 0 14px var(--brand-glow);
}
.opt.picked .opt-key {
  border-color: var(--brand-a);
  background: linear-gradient(135deg, var(--brand-a), var(--brand-b));
  box-shadow: 0 0 8px var(--brand-glow);
  color: #fff;
}

/* 判分后 */
.opt.correct {
  border-color: var(--ok);
  background: var(--opt-bg-correct);
  box-shadow: 0 0 14px var(--ok-glow);
}
.opt.correct .opt-key {
  border-color: var(--ok);
  background: var(--ok);
  box-shadow: 0 0 8px var(--ok-glow);
  color: #fff;
}
.opt.wrong {
  border-color: var(--bad);
  background: var(--opt-bg-wrong);
  box-shadow: 0 0 14px var(--bad-glow);
}
.opt.wrong .opt-key {
  border-color: var(--bad);
  background: var(--bad);
  box-shadow: 0 0 8px var(--bad-glow);
  color: #fff;
}

/* 动效：答对微跃发光，答错震动警示 */
@keyframes correctPulse {
  0% { transform: scale(0.98); }
  50% { transform: scale(1.01); }
  100% { transform: scale(1); }
}
.opt.correct {
  animation: correctPulse 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes wrongShake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-3px); }
  40%, 80% { transform: translateX(3px); }
}
.opt.wrong {
  animation: wrongShake 0.32s ease;
}

/* 排除法态：虚线、淡化、划线 */
.opt.eliminated {
  opacity: 0.42;
  background: var(--mat-bg);
  border-style: dashed;
  border-color: var(--border-color);
  box-shadow: none;
}
.opt.eliminated .opt-text {
  text-decoration: line-through;
  color: var(--text-sub);
}
.opt.eliminated .opt-key {
  opacity: 0.6;
  text-decoration: line-through;
}

/* 快捷排除按钮 */
.opt-del {
  flex: none;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-sub);
  opacity: 0.35;
  transition: all 0.2s ease;
  cursor: pointer;
  margin-left: auto;
  padding: 0;
}
.opt:hover .opt-del,
.opt-del.on {
  opacity: 1;
}
.opt-del.on {
  background: rgba(244, 63, 94, 0.12);
  color: var(--bad);
  border-color: var(--bad);
}
.del-slash {
  width: 13px;
  height: 1.5px;
  background: currentColor;
  transform: rotate(-45deg);
  border-radius: 1px;
}

.gkey.eliminated {
  opacity: 0.35;
  text-decoration: line-through;
  border-style: dashed;
}
.opt-image-wrap {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 8px;
  background: var(--mat-bg);
  margin-top: 12px;
}
.opt-image {
  width: 100%;
  display: block;
  border-radius: var(--r-sm);
  background: #fff;
}
.img-tip {
  text-align: center;
  font-size: 11px;
  color: var(--text-sub);
  margin-top: 6px;
}
.graphic-keys {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.gkey {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-main);
  font-size: 16px;
  font-weight: 600;
  transition: all 0.15s ease;
}
.gkey.picked {
  border-color: var(--brand-a);
  color: var(--brand-b);
  background: var(--brand-soft);
}
.gkey.correct {
  border-color: var(--ok);
  background: var(--ok);
  color: #fff;
}
.gkey.wrong {
  border-color: var(--bad);
  background: var(--bad);
  color: #fff;
}
</style>

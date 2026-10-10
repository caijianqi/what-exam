<script setup lang="ts">
/**
 * 选项区。
 *
 * 三种形态：
 *   1. 文字选项（多数题）
 *   2. 图形选项：四个选项合成一张图（optionImage），A/B/C/D 退化成一排点选按钮
 *   3. 逐项图片：每个选项自带一张 PNG
 */
import { computed } from "vue";
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
      <div class="img-tip">点击图片可放大</div>
      <div class="graphic-keys">
        <button
          v-for="o in question.options"
          :key="o.key"
          class="gkey"
          :class="clsOf(o)"
          :disabled="disabled"
          @click="emit('choose', o.key)"
        >
          {{ o.key }}
        </button>
      </div>
    </div>

    <!-- 形态 1/3：v-for 必须包在 template 里，不能和 v-else 同元素（v-if 优先级更高，o 取不到） -->
    <template v-else>
      <div
        v-for="o in question.options"
        :key="o.key"
        class="opt"
        :class="clsOf(o)"
        @click="!disabled && emit('choose', o.key)"
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
  gap: 10px;
  padding: 12px 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.opt:active {
  transform: scale(0.99);
}

.opt-text {
  flex: 1;
  font-size: calc(var(--app-font-size, 15px) + 0px);
  line-height: 1.6;
  word-break: break-word;
}

.opt-key {
  flex: none;
  width: 24px;
  height: 24px;
  line-height: 22px;
  text-align: center;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--mat-bg);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-sub);
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
}
.opt.picked .opt-key {
  border-color: var(--brand-a);
  background: linear-gradient(135deg, var(--brand-a), var(--brand-b));
  color: #fff;
}

/* 判分后 */
.opt.correct {
  border-color: var(--ok);
  background: var(--opt-bg-correct);
}
.opt.correct .opt-key {
  border-color: var(--ok);
  background: var(--ok);
  color: #fff;
}
.opt.wrong {
  border-color: var(--bad);
  background: var(--opt-bg-wrong);
}
.opt.wrong .opt-key {
  border-color: var(--bad);
  background: var(--bad);
  color: #fff;
}

/* 形态 2 */
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

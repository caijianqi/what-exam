<script setup lang="ts">
/**
 * 做题页。
 *
 * 布局：顶部导航（进度 + 答题卡）、中部题目与解析（独立滚动）、底部操作栏。
 * 不用 100vh，全部靠 flex 撑满父容器高度（安卓 WebView 地址栏收缩不会跳动）。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { showImagePreview, showToast } from "vant";
import { usePracticeStore } from "../stores/practice";
import { useSettingsStore } from "../stores/settings";
import { moduleColor, moduleName } from "../data/modules";
import { assetUrl } from "../data/bank";
import { richText } from "../utils/html";
import { isFavorite, toggleFavorite } from "../db/records";
import MaterialPanel from "../components/MaterialPanel.vue";
import OptionList from "../components/OptionList.vue";
import AnswerSheet from "../components/AnswerSheet.vue";
import ResultSheet from "../components/ResultSheet.vue";

const router = useRouter();
const ps = usePracticeStore();
const settings = useSettingsStore();

const sheetShow = ref(false);
const resultShow = ref(false);
const showAnalysis = ref(false);
const faved = ref(false);

const q = computed(() => ps.current);
const judged = computed(
  () => (ps.mode === "exam" ? ps.submitted : !!ps.currentAnswer)
);
const disabled = computed(() => !!ps.currentAnswer || ps.submitted);

const stemImages = computed(() => (q.value?.stemImages ?? []).map(assetUrl));
const accent = computed(() =>
  moduleColor(String(q.value?.module ?? ps.moduleKey))
);

const statuses = computed(() => {
  const out: Record<string, "none" | "correct" | "wrong"> = {};
  for (const item of ps.queue) out[item.id] = ps.statusOf(item);
  return out;
});

const totalMs = computed(() => {
  const vals = Object.values(ps.answers);
  if (!vals.length) return 0;
  return vals.reduce((s, a) => s + a.durationMs, 0);
});

function previewStem(i: number) {
  if (stemImages.value.length) {
    showImagePreview({
      images: stemImages.value,
      startPosition: i,
      closeable: true,
      maxZoom: 3,
    });
  }
}

async function onChoose(key: string) {
  await ps.choose(key);
  if (settings.autoShowAnalysis || ps.mode === "exam") showAnalysis.value = true;
}

async function refreshFav() {
  if (!q.value) return;
  try {
    faved.value = await isFavorite(q.value.id);
  } catch {
    faved.value = false;
  }
}

async function onFav() {
  if (!q.value) return;
  try {
    faved.value = await toggleFavorite(q.value.id);
    showToast(faved.value ? "已收藏" : "已取消收藏");
  } catch {
    showToast("收藏失败");
  }
}

function goNext() {
  if (ps.index >= ps.total - 1) {
    // 最后一题：练习模式直接结算，模考模式引导交卷
    if (ps.mode === "exam" && !ps.submitted) {
      sheetShow.value = true;
      return;
    }
    resultShow.value = true;
    return;
  }
  ps.next();
}

function exit() {
  router.push("/practice");
}

function submitExam() {
  ps.submit();
  showAnalysis.value = true;
  resultShow.value = true;
}

// 切题时重置解析展开状态
watch(
  () => ps.index,
  () => {
    showAnalysis.value = judged.value && settings.autoShowAnalysis;
    refreshFav();
  }
);

// 练习模式答完全部题 → 自动弹结算
watch(
  () => ps.answeredCount,
  (n) => {
    if (ps.mode === "practice" && ps.total > 0 && n === ps.total) {
      setTimeout(() => (resultShow.value = true), 350);
    }
  }
);

// 左右滑动切题（滚动时靠 dy 阈值避免误触）
let sx = 0;
let sy = 0;
function onTouchStart(e: TouchEvent) {
  sx = e.touches[0].clientX;
  sy = e.touches[0].clientY;
}
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - sx;
  const dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return;
  if (dx < 0) goNext();
  else ps.prev();
}

onMounted(async () => {
  await settings.init();
  if (!ps.queue.length) {
    // 直接刷新此页没有会话数据，回配置页
    router.replace("/practice");
    return;
  }
  showAnalysis.value = judged.value && settings.autoShowAnalysis;
  refreshFav();
});
</script>

<template>
  <div class="session" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
    <van-nav-bar
      :title="`${ps.index + 1} / ${ps.total}`"
      left-arrow
      right-text="答题卡"
      @click-left="exit"
      @click-right="sheetShow = true"
    >
      <template #subtitle>
        <span class="nav-sub">
          {{ ps.title || moduleName(ps.moduleKey)
          }}{{ ps.subType ? " · " + ps.subType : "" }}
          · 正确 {{ ps.correctCount }}/{{ ps.answeredCount }}
        </span>
      </template>
    </van-nav-bar>

    <van-progress
      :percentage="Math.round(((ps.index + 1) / Math.max(ps.total, 1)) * 100)"
      :show-pivot="false"
    />

    <div class="s-body">
      <MaterialPanel
        v-if="ps.currentMaterial"
        :material="ps.currentMaterial"
        :open="ps.materialOpen"
        @toggle="ps.materialOpen = !ps.materialOpen"
      />

      <div v-if="q" class="q-card">
        <div class="q-meta">
          <span class="q-no">第 {{ q.no }} 题</span>
          <span class="q-tag" :style="{ '--mc': accent }">{{ q.subType }}</span>
          <span class="q-id">{{ q.id }}</span>
        </div>

        <div class="q-stem" v-html="richText(q.stem)"></div>

        <img
          v-for="(src, i) in stemImages"
          :key="src"
          class="q-img"
          :src="src"
          alt="题干图"
          @click="previewStem(i)"
        />

        <OptionList
          :question="q"
          :chosen="ps.currentAnswer?.chosen ?? null"
          :judged="judged"
          :disabled="disabled"
          @choose="onChoose"
        />
      </div>

      <!-- 解析 -->
      <div
        v-if="q && judged"
        class="analysis"
        :class="ps.currentAnswer?.isCorrect ? 'is-ok' : 'is-bad'"
      >
        <div class="ana-head">
          <span class="badge">
            {{ ps.currentAnswer?.isCorrect ? "回答正确" : "回答错误" }}
          </span>
          <span class="muted ana-pick">
            你选 {{ ps.currentAnswer?.chosen ?? "—" }} · 答案 {{ q.answer }}
          </span>
          <span class="spacer"></span>
          <van-button size="mini" plain @click="showAnalysis = !showAnalysis">
            {{ showAnalysis ? "收起" : "看解析" }}
          </van-button>
        </div>
        <div v-if="showAnalysis" class="ana-body">
          <div class="ana-title">解析</div>
          {{ q.explanation }}
          <div class="ana-src">原 PDF 第 {{ q.srcPage }} 页 · {{ q.id }}</div>
        </div>
      </div>

      <div class="pad"></div>
    </div>

    <div class="s-foot">
      <van-button class="fbtn" plain :disabled="ps.index === 0" @click="ps.prev()">
        上一题
      </van-button>
      <van-button class="fbtn" plain :type="faved ? 'primary' : 'default'" @click="onFav">
        {{ faved ? "已收藏" : "收藏" }}
      </van-button>
      <van-button
        class="fbtn"
        type="primary"
        @click="goNext"
      >
        {{ ps.index >= ps.total - 1 ? (ps.mode === "exam" ? "交卷" : "完成") : "下一题" }}
      </van-button>
    </div>

    <AnswerSheet
      v-model:show="sheetShow"
      :queue="ps.queue"
      :current-index="ps.index"
      :statuses="statuses"
      :exam-mode="ps.mode === 'exam'"
      @jump="ps.jumpTo"
      @submit="submitExam"
    />

    <ResultSheet
      v-model:show="resultShow"
      :total="ps.total"
      :correct="ps.correctCount"
      :wrong="ps.wrongCount"
      :answered="ps.answeredCount"
      :duration-ms="totalMs"
      @redo-wrong="ps.redoWrong"
      @restart="ps.restart"
      @exit="exit"
    />
  </div>
</template>

<style scoped>
.session {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.nav-sub {
  font-size: 11px;
  color: var(--text-sub);
}

.s-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 10px 12px 4px;
}

.q-card {
  background: var(--card-bg);
  border-radius: var(--r-card);
  padding: 14px;
  margin-top: 10px;
  box-shadow: var(--shadow-card);
}
[data-theme="dark"] .q-card {
  border: 1px solid var(--border-color);
  box-shadow: none;
}

.q-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.q-no {
  font-size: 13px;
  font-weight: 600;
}
.q-tag {
  padding: 1px 9px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--mc);
  background: var(--mat-bg);
  border: 1px solid var(--mc);
}
.q-id {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-sub);
}

.q-stem {
  font-size: calc(var(--app-font-size, 15px) + 1px);
  line-height: 1.75;
  text-align: justify;
  word-break: break-word;
}

.q-img {
  width: 100%;
  display: block;
  border-radius: var(--r-sm);
  margin-top: 10px;
  border: 1px solid var(--border-color);
  background: #fff;
}

.pad {
  height: 8px;
}

.analysis {
  margin-top: 12px;
  background: var(--card-bg);
  border-radius: var(--r-card);
  padding: 12px 14px;
  box-shadow: var(--shadow-card);
  border: 1px solid transparent;
  border-left-width: 3px;
  border-left-style: solid;
}
[data-theme="dark"] .analysis {
  border-top-color: var(--border-color);
  border-right-color: var(--border-color);
  border-bottom-color: var(--border-color);
  box-shadow: none;
}
.analysis.is-ok {
  border-left-color: var(--ok);
}
.analysis.is-bad {
  border-left-color: var(--bad);
}
.ana-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.ana-pick {
  font-size: 12px;
}
.spacer {
  flex: 1;
}
.badge {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  color: #fff;
  font-weight: 500;
}
.is-ok .badge {
  background: var(--ok);
}
.is-bad .badge {
  background: var(--bad);
}
.ana-body {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--mat-bg);
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
  text-align: justify;
}
.ana-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-sub);
  margin-bottom: 2px;
}
.ana-src {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-sub);
}

.s-foot {
  flex: none;
  display: flex;
  gap: 10px;
  padding: 10px 12px calc(10px + var(--safe-bottom));
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
}
.fbtn {
  flex: 1;
}
</style>

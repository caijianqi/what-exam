<script setup lang="ts">
/**
 * 做题页。
 *
 * 布局：顶部导航（进度 + 答题卡）、中部题目与解析（独立滚动）、底部操作栏。
 * 不用 100vh，全部靠 flex 撑满父容器高度（安卓 WebView 地址栏收缩不会跳动）。
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { showImagePreview, showToast } from "vant";
import { usePracticeStore } from "../stores/practice";
import { useSettingsStore } from "../stores/settings";
import { moduleColor, moduleName } from "../data/modules";
import { assetUrl } from "../data/bank";
import { richText } from "../utils/html";
import { isFavorite, toggleFavorite, getAiExplanation, saveAiExplanation, type CachedAiExplanation } from "../db/records";
import { generateAiExplanation } from "../api/ai";
import MaterialPanel from "../components/MaterialPanel.vue";
import OptionList from "../components/OptionList.vue";
import AnswerSheet from "../components/AnswerSheet.vue";
import ResultSheet from "../components/ResultSheet.vue";
import AiAnalysisViewer from "../components/AiAnalysisViewer.vue";

const router = useRouter();
const ps = usePracticeStore();
const settings = useSettingsStore();

const sheetShow = ref(false);
const resultShow = ref(false);
const showAnalysis = ref(false);
const faved = ref(false);

// AI 解析相关状态（教研精析与 30 秒秒杀独立请求与缓存）
const analysisTab = ref<"original" | "ai" | "speed">("original");

// 教研精析 (standard)
const currentAiExplanation = ref<CachedAiExplanation | null>(null);
const aiLoading = ref(false);
const aiError = ref("");
let aiAbortCtrl: AbortController | null = null;

// 30秒秒杀 (speed)
const currentSpeedExplanation = ref<CachedAiExplanation | null>(null);
const speedLoading = ref(false);
const speedError = ref("");
let speedAbortCtrl: AbortController | null = null;

const q = computed(() => ps.current);
const judged = computed(
  () => (ps.mode === "exam" ? ps.submitted : !!ps.currentAnswer)
);
const disabled = computed(() => !!ps.currentAnswer || ps.submitted);

const stemImages = computed(() => (q.value?.stemImages ?? []).map(assetUrl));
const accent = computed(() =>
  moduleColor(String(q.value?.module ?? ps.moduleKey))
);

// 单题实时配速秒表
const elapsedSec = ref(0);
let timerHandle: number | null = null;

function updateTimer() {
  if (!q.value) return;
  const ans = ps.answers[q.value.id];
  if (ans) {
    elapsedSec.value = Math.max(1, Math.round(ans.durationMs / 1000));
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  } else {
    const ms = Date.now() - ps.questionShownAt;
    elapsedSec.value = Math.max(0, Math.floor(ms / 1000));
  }
}

function startTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  updateTimer();
  const ans = q.value ? ps.answers[q.value.id] : null;
  if (!ans) {
    timerHandle = window.setInterval(updateTimer, 1000);
  }
}

const formattedTime = computed(() => {
  const m = Math.floor(elapsedSec.value / 60);
  const s = elapsedSec.value % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
});

const paceStatus = computed<"normal" | "warn" | "bad">(() => {
  if (elapsedSec.value >= 90) return "bad";
  if (elapsedSec.value >= 60) return "warn";
  return "normal";
});

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
  updateTimer();
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
  updateTimer();
}

function cancelStandardRequest() {
  if (aiAbortCtrl) {
    aiAbortCtrl.abort();
    aiAbortCtrl = null;
  }
  aiLoading.value = false;
}

function cancelSpeedRequest() {
  if (speedAbortCtrl) {
    speedAbortCtrl.abort();
    speedAbortCtrl = null;
  }
  speedLoading.value = false;
}

function cancelAllAiRequests() {
  cancelStandardRequest();
  cancelSpeedRequest();
}

// 加载当前题目的 AI 解析缓存（分别读取标准解析与秒杀解析）
async function loadAiCache() {
  cancelAllAiRequests();
  aiError.value = "";
  speedError.value = "";
  if (!q.value) {
    currentAiExplanation.value = null;
    currentSpeedExplanation.value = null;
    return;
  }
  const qid = q.value.id;
  try {
    const [std, spd] = await Promise.all([
      getAiExplanation(qid, "standard"),
      getAiExplanation(qid, "speed"),
    ]);
    if (q.value?.id === qid) {
      currentAiExplanation.value = std;
      currentSpeedExplanation.value = spd;
    }
  } catch {
    currentAiExplanation.value = null;
    currentSpeedExplanation.value = null;
  }
}

async function triggerStandardExplanation() {
  if (!q.value) return;
  if (!settings.aiApiKey.trim() || !settings.aiModel.trim()) {
    showToast("请先在设置中配置 API Key 并选择模型");
    router.push("/settings");
    return;
  }

  cancelStandardRequest();
  aiAbortCtrl = new AbortController();
  aiLoading.value = true;
  aiError.value = "";

  try {
    let matText = "";
    if (ps.currentMaterial) {
      matText = ps.currentMaterial.content
        .filter((b) => b.t === "text")
        .map((b) => b.v)
        .join("\n");
    }

    const content = await generateAiExplanation({
      baseUrl: settings.aiBaseUrl,
      apiKey: settings.aiApiKey,
      model: settings.aiModel,
      question: q.value,
      materialText: matText,
      chosen: ps.currentAnswer?.chosen ?? null,
      type: "standard",
      signal: aiAbortCtrl.signal,
    });

    await saveAiExplanation(q.value.id, settings.aiModel, content, "standard");
    currentAiExplanation.value = {
      question_id: q.value.id,
      model: settings.aiModel,
      content,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    aiError.value = msg;
    showToast({ message: "生成失败：" + msg, duration: 3000 });
  } finally {
    aiLoading.value = false;
    aiAbortCtrl = null;
  }
}

async function triggerSpeedExplanation() {
  if (!q.value) return;
  if (!settings.aiApiKey.trim() || !settings.aiModel.trim()) {
    showToast("请先在设置中配置 API Key 并选择模型");
    router.push("/settings");
    return;
  }

  cancelSpeedRequest();
  speedAbortCtrl = new AbortController();
  speedLoading.value = true;
  speedError.value = "";

  try {
    let matText = "";
    if (ps.currentMaterial) {
      matText = ps.currentMaterial.content
        .filter((b) => b.t === "text")
        .map((b) => b.v)
        .join("\n");
    }

    const content = await generateAiExplanation({
      baseUrl: settings.aiBaseUrl,
      apiKey: settings.aiApiKey,
      model: settings.aiModel,
      question: q.value,
      materialText: matText,
      chosen: ps.currentAnswer?.chosen ?? null,
      type: "speed",
      signal: speedAbortCtrl.signal,
    });

    await saveAiExplanation(q.value.id, settings.aiModel, content, "speed");
    currentSpeedExplanation.value = {
      question_id: q.value.id,
      model: settings.aiModel,
      content,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    speedError.value = msg;
    showToast({ message: "生成失败：" + msg, duration: 3000 });
  } finally {
    speedLoading.value = false;
    speedAbortCtrl = null;
  }
}

async function copyStandardText() {
  if (!currentAiExplanation.value?.content) return;
  try {
    await navigator.clipboard.writeText(currentAiExplanation.value.content);
    showToast("AI 教研解析已复制");
  } catch {
    showToast("复制失败");
  }
}

async function copySpeedText() {
  if (!currentSpeedExplanation.value?.content) return;
  try {
    await navigator.clipboard.writeText(currentSpeedExplanation.value.content);
    showToast("30秒秒杀解析已复制");
  } catch {
    showToast("复制失败");
  }
}

// 切题时重置解析展开状态与秒表
watch(
  () => ps.index,
  () => {
    showAnalysis.value = judged.value && settings.autoShowAnalysis;
    refreshFav();
    startTimer();
    loadAiCache();
  }
);

// 判分变化时更新计时状态
watch(
  () => judged.value,
  () => {
    updateTimer();
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
  startTimer();
  loadAiCache();
});

onUnmounted(() => {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  cancelAllAiRequests();
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
          {{ ps.title || moduleName(ps.moduleKey) }}
          · 正确 {{ ps.correctCount }}/{{ ps.answeredCount }}
        </span>
      </template>
    </van-nav-bar>

    <van-progress
      :percentage="Math.round(((ps.index + 1) / Math.max(ps.total, 1)) * 100)"
      :show-pivot="false"
    />

    <!-- 顶部 HUD 监控与配速条 -->
    <div class="hud-bar">
      <div class="hud-tags">
        <span class="hud-badge" :style="{ '--mc': accent }">
          {{ q?.subType || ps.subType || moduleName(ps.moduleKey) }}
        </span>
        <span class="hud-stat">
          正确率 <b>{{ ps.answeredCount ? ps.accuracy : 0 }}%</b>
        </span>
      </div>
      <div class="hud-timer" :class="`pace-${paceStatus}`">
        <span class="timer-dot" :class="{ running: !judged }"></span>
        <span class="timer-num">{{ formattedTime }}</span>
        <span v-if="paceStatus === 'warn' && !judged" class="pace-tip">配速预警</span>
        <span v-else-if="paceStatus === 'bad' && !judged" class="pace-tip">建议速猜</span>
      </div>
    </div>

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
          <van-tabs v-model:active="analysisTab" shrink class="ana-tabs">
            <van-tab title="参考解析" name="original">
              <div class="tab-content-box">
                <div class="ana-text">{{ q.explanation }}</div>
                <div class="ana-src">原 PDF 第 {{ q.srcPage }} 页 · {{ q.id }}</div>
              </div>
            </van-tab>

            <van-tab title="AI教研精析" name="ai">
              <div class="tab-content-box ai-tab-box">
                <!-- 未配置模型 -->
                <div v-if="!settings.aiModel || !settings.aiApiKey" class="ai-box ai-empty-box">
                  <div class="ai-empty-title">尚未配置 AI 模型或 API Key</div>
                  <div class="ai-empty-desc">前往设置页面配置 MiniMax API Key 并拉取选定模型后即可使用</div>
                  <van-button size="small" type="primary" plain @click="router.push('/settings')">
                    前往配置
                  </van-button>
                </div>

                <!-- 生成中 -->
                <div v-else-if="aiLoading" class="ai-box ai-loading-box">
                  <van-loading size="22px" vertical color="var(--brand-a)">
                    AI 正在深入剖析本题（模型：{{ settings.aiModel }}）...
                  </van-loading>
                  <van-button size="mini" plain style="margin-top: 10px" @click="cancelStandardRequest">
                    取消生成
                  </van-button>
                </div>

                <!-- 生成失败 -->
                <div v-else-if="aiError" class="ai-box ai-error-box">
                  <div class="ai-error-msg">生成解析失败：{{ aiError }}</div>
                  <van-button size="small" plain type="danger" @click="triggerStandardExplanation">
                    重试
                  </van-button>
                </div>

                <!-- 已有 AI 解析 -->
                <AiAnalysisViewer
                  v-else-if="currentAiExplanation"
                  view-mode="standard"
                  :content="currentAiExplanation.content"
                  :model="currentAiExplanation.model"
                  @copy="copyStandardText"
                  @regenerate="triggerStandardExplanation"
                />

                <!-- 未生成（手动触发初始态） -->
                <div v-else class="ai-box ai-init-box">
                  <div class="ai-init-tip">
                    当前选用模型：<span class="ai-model-name">{{ settings.aiModel }}</span>
                  </div>
                  <div class="ai-init-sub">点击下方按钮手动触发 AI 名师深度拆解本题</div>
                  <van-button
                    type="primary"
                    size="small"
                    icon="bulb-o"
                    class="ai-trigger-btn"
                    @click="triggerStandardExplanation"
                  >
                    生成 AI 解析
                  </van-button>
                </div>
              </div>
            </van-tab>

            <van-tab title="⚡ 30秒秒杀" name="speed">
              <div class="tab-content-box ai-tab-box">
                <!-- 未配置模型 -->
                <div v-if="!settings.aiModel || !settings.aiApiKey" class="ai-box ai-empty-box">
                  <div class="ai-empty-title">尚未配置 AI 模型或 API Key</div>
                  <div class="ai-empty-desc">前往设置页面配置 MiniMax API Key 并拉取选定模型后即可使用</div>
                  <van-button size="small" type="primary" plain @click="router.push('/settings')">
                    前往配置
                  </van-button>
                </div>

                <!-- 生成中 -->
                <div v-else-if="speedLoading" class="ai-box ai-loading-box">
                  <van-loading size="22px" vertical color="#f59e0b">
                    正在提炼 30 秒极速秒杀绝技...
                  </van-loading>
                  <van-button size="mini" plain style="margin-top: 10px" @click="cancelSpeedRequest">
                    取消生成
                  </van-button>
                </div>

                <!-- 生成失败 -->
                <div v-else-if="speedError" class="ai-box ai-error-box">
                  <div class="ai-error-msg">生成秒杀失败：{{ speedError }}</div>
                  <van-button size="small" plain type="danger" @click="triggerSpeedExplanation">
                    重试
                  </van-button>
                </div>

                <!-- 已有 AI 解析 -->
                <AiAnalysisViewer
                  v-else-if="currentSpeedExplanation"
                  view-mode="speed"
                  :content="currentSpeedExplanation.content"
                  :model="currentSpeedExplanation.model"
                  @copy="copySpeedText"
                  @regenerate="triggerSpeedExplanation"
                />

                <!-- 未生成（手动触发初始态） -->
                <div v-else class="ai-box ai-init-box speed-init-box">
                  <div class="ai-init-tip">
                    考场实战极速破局：<span class="ai-model-name speed-name">30秒秒杀绝技</span>
                  </div>
                  <div class="ai-init-sub">彻底跳过繁琐演算，直击非常规破局技巧与命题漏洞</div>
                  <van-button
                    type="warning"
                    size="small"
                    icon="fire-o"
                    class="ai-trigger-btn speed-btn"
                    @click="triggerSpeedExplanation"
                  >
                    ⚡ 生成 30秒秒杀绝技
                  </van-button>
                </div>
              </div>
            </van-tab>
          </van-tabs>
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

/* ---------- 顶部 HUD 状态配速条 ---------- */
.hud-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
}
.hud-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hud-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--mc, var(--brand-a));
  background: var(--mat-bg);
  border: 1px solid var(--mc, var(--brand-a));
}
.hud-stat {
  color: var(--text-sub);
}
.hud-stat b {
  font-family: var(--font-mono);
  color: var(--text-main);
  font-weight: 700;
}
.hud-timer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 12px;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--mat-bg);
  border: 1px solid var(--border-color);
  transition: all 0.25s ease;
}
.timer-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-a);
}
.timer-dot.running {
  box-shadow: 0 0 6px var(--brand-glow);
  animation: timerPulse 1.2s infinite ease-in-out;
}
@keyframes timerPulse {
  0%, 100% { opacity: 0.35; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.2); }
}
.hud-timer.pace-normal {
  color: var(--brand-a);
}
.hud-timer.pace-warn {
  color: var(--warn);
  border-color: var(--warn);
  background: rgba(245, 158, 11, 0.1);
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.25);
}
.hud-timer.pace-warn .timer-dot {
  background: var(--warn);
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
}
.hud-timer.pace-bad {
  color: var(--bad);
  border-color: var(--bad);
  background: rgba(244, 63, 94, 0.1);
  box-shadow: 0 0 10px var(--bad-glow);
}
.hud-timer.pace-bad .timer-dot {
  background: var(--bad);
  box-shadow: 0 0 6px var(--bad-glow);
}
.pace-tip {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2px;
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
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
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
  font-family: var(--font-mono);
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

/* 动效：解析面板平滑浮入 */
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.analysis {
  animation: slideInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  margin-top: 12px;
  background: var(--card-bg);
  border-radius: var(--r-card);
  padding: 12px 14px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
  border-left-width: 4px;
  border-left-style: solid;
}
.analysis.is-ok {
  border-left-color: var(--ok);
  box-shadow: 0 0 14px var(--ok-glow);
}
.analysis.is-bad {
  border-left-color: var(--bad);
  box-shadow: 0 0 14px var(--bad-glow);
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
  padding: 4px 6px;
  border-radius: var(--r-sm);
  background: var(--mat-bg);
  font-size: 14px;
}
.ana-tabs :deep(.van-tabs__nav) {
  background: transparent;
  padding-bottom: 6px;
}
.ana-tabs :deep(.van-tab) {
  font-size: 13px;
  font-weight: 500;
  padding: 0 12px;
}
.tab-content-box {
  padding: 8px 6px;
}
.ana-text {
  line-height: 1.75;
  white-space: pre-wrap;
  text-align: justify;
}
.ana-src {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-sub);
}

/* AI 解析各状态模块 */
.ai-box {
  padding: 12px 8px;
  text-align: center;
}
.ai-empty-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 4px;
}
.ai-empty-desc {
  font-size: 12px;
  color: var(--text-sub);
  margin-bottom: 12px;
}
.ai-loading-box {
  padding: 18px 0;
}
.ai-error-box {
  color: var(--bad);
}
.ai-error-msg {
  font-size: 12px;
  margin-bottom: 8px;
}
.ai-init-box {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ai-init-tip {
  font-size: 13px;
  color: var(--text-color);
  margin-bottom: 4px;
}
.ai-model-name {
  font-weight: 600;
  color: var(--brand-a);
}
.speed-name {
  color: #d97706;
}
.speed-btn {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  border: none;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);
  font-weight: 700;
}
.ai-init-sub {
  font-size: 11px;
  color: var(--text-sub);
  margin-bottom: 12px;
}
.ai-result-box {
  text-align: left;
  padding: 4px 2px;
}
.ai-meta-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--border-color);
}
.ai-model-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--brand-a);
}
.ai-text {
  font-size: 13.5px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-color);
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

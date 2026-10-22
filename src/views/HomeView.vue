<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { showToast } from "vant";
import { MODULES, TOTAL_QUESTIONS } from "../data/modules";
import { listWrong, moduleProgress, overview, todayStats, usingFallback } from "../db/records";
import { useSettingsStore } from "../stores/settings";
import { usePracticeStore } from "../stores/practice";
import TechIcon from "../components/TechIcon.vue";

const router = useRouter();
const route = useRoute();
const settings = useSettingsStore();
const ps = usePracticeStore();

const todayCount = ref(0);
const todayCorrect = ref(0);
const doneByModule = ref<Record<string, number>>({});
const wrongPending = ref(0);
const streak = ref(0);
const dbError = ref("");
const startingQuick = ref(false);

async function loadStats() {
  try {
    const [t, prog, ov, wrong] = await Promise.all([
      todayStats(),
      moduleProgress(),
      overview(),
      listWrong(false),
    ]);
    todayCount.value = t.attempted;
    todayCorrect.value = t.correct;
    doneByModule.value = prog;
    streak.value = ov.streak;
    wrongPending.value = wrong.length;
    dbError.value = usingFallback()
      ? "SQLite 不可用（浏览器预览模式，记录存本地）"
      : "";
  } catch (e) {
    dbError.value = String(e);
  }
}

onMounted(async () => {
  await settings.init();
  await loadStats();
});

// 从做题页返回时刷新今日进度
watch(
  () => route.path,
  (p) => {
    if (p === "/") loadStats();
  }
);

const goal = computed(() => Math.max(settings.dailyGoal, 1));
const goalPct = computed(() => Math.min(Math.round((todayCount.value / goal.value) * 100), 100));
const todayAcc = computed(() =>
  todayCount.value ? Math.round((todayCorrect.value / todayCount.value) * 100) : 0
);

/** 模块完成度：按「做过的题数 / 题库总量」 */
function pctOf(key: string, total: number): number {
  const done = doneByModule.value[key] ?? 0;
  return Math.min(Math.round((done / Math.max(total, 1)) * 100), 100);
}

function goPractice(key: string) {
  router.push({ path: "/practice", query: { module: key } });
}

/** 一键智能速练 10 题（全题库随机抽取 10 题速练） */
async function startQuickPractice() {
  if (startingQuick.value) return;
  startingQuick.value = true;
  try {
    const bank = await ps.ensureBank();
    if (!bank || !bank.questions.length) {
      showToast("题库暂无题目");
      return;
    }
    const pool = bank.questions.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked = pool.slice(0, 10).map((q) => q.id);
    await ps.startWithIds(picked, {
      mode: "practice",
      title: "智能速练 · 10题",
      random: false,
    });
    router.push("/practice/session");
  } catch (err) {
    showToast("启动失败：" + err);
  } finally {
    startingQuick.value = false;
  }
}
</script>

<template>
  <div class="page">
    <!-- 今日进度头图 (Cyber Command Hero) -->
    <div class="hero">
      <div class="hero-top">
        <div class="hero-text">
          <div class="hero-title">行测刷题</div>
          <div class="hero-sub">
            共 {{ TOTAL_QUESTIONS }} 题 · 四大模块 · 离线可用
          </div>
        </div>
        <div class="hero-num">
          <b>{{ todayCount }}</b>
          <span>今日/{{ settings.dailyGoal }}</span>
        </div>
      </div>

      <div class="hero-bar">
        <div class="hero-bar-fill" :style="{ width: goalPct + '%' }"></div>
      </div>

      <div class="hero-foot">
        <span v-if="todayCount > 0">今日正确率 {{ todayAcc }}%</span>
        <span v-else>今天还没开张，来两题？</span>
        <span class="dot">·</span>
        <span>连续 {{ streak }} 天</span>
      </div>

      <!-- 智能速刷快捷通道 -->
      <div class="hero-actions">
        <button
          type="button"
          class="hero-btn primary"
          :disabled="startingQuick"
          @click="startQuickPractice"
        >
          <span class="btn-icon">⚡</span>
          <span>智能速练 10 题</span>
        </button>
        <button
          type="button"
          class="hero-btn ghost"
          @click="router.push('/wrong')"
        >
          <span>攻克错题 <b v-if="wrongPending">({{ wrongPending }})</b></span>
        </button>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        模块练习
        <span class="muted">已做 / 题库</span>
      </div>
      <div class="mod-grid">
        <div
          v-for="m in MODULES"
          :key="m.key"
          class="mod"
          :style="{ '--mc': m.color }"
          @click="goPractice(m.key)"
        >
          <div class="mod-bar"></div>
          <div class="mod-head">
            <div class="mod-title-wrap">
              <TechIcon :name="(m.key as any)" size="16" :color="m.color" />
              <span class="mod-name">{{ m.name }}</span>
            </div>
            <span class="mod-cnt">{{ doneByModule[m.key] ?? 0 }}/{{ m.total }}</span>
          </div>
          <div class="mod-track">
            <div class="mod-fill" :style="{ width: pctOf(m.key, m.total) + '%' }"></div>
          </div>
          <div class="mod-desc">{{ m.desc }}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">今日概览</div>
      <div class="stat-grid">
        <div>
          <b class="stat-num brand">{{ todayCount }}</b>
          <span class="stat-label">今日已做</span>
        </div>
        <div>
          <b class="stat-num ok">{{ todayCount ? todayAcc : 0 }}%</b>
          <span class="stat-label">今日正确率</span>
        </div>
        <div>
          <b class="stat-num bad">{{ wrongPending }}</b>
          <span class="stat-label">待攻克</span>
        </div>
        <div>
          <b class="stat-num">{{ streak }}</b>
          <span class="stat-label">连续天数</span>
        </div>
      </div>
      <div class="quick">
        <van-button size="small" plain type="danger" @click="router.push('/wrong')">
          去重做错题
        </van-button>
        <van-button size="small" plain type="primary" @click="router.push('/stats')">
          看统计
        </van-button>
      </div>
    </div>

    <div v-if="dbError" class="card">
      <div class="section-title">数据状态</div>
      <div class="muted">{{ dbError }}</div>
    </div>
  </div>
</template>

<style scoped>
/* ---------- 头图 (Cyber Command Hero) ---------- */
.hero {
  position: relative;
  overflow: hidden;
  border-radius: var(--r-card);
  padding: 18px 18px 16px;
  margin-bottom: 14px;
  color: #fff;
  background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 45%, #0284c7 100%);
  box-shadow: 0 10px 28px -4px rgba(37, 99, 235, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
.hero::after {
  content: "";
  position: absolute;
  right: -30px;
  top: -50px;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.25) 0%, rgba(255, 255, 255, 0) 70%);
  pointer-events: none;
}
.hero::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px);
  background-size: 16px 16px;
  pointer-events: none;
}
.hero-top {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.hero-title {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.hero-sub {
  font-size: 12px;
  opacity: 0.88;
  margin-top: 3px;
  letter-spacing: 0.2px;
}
.hero-num {
  text-align: right;
  position: relative;
}
.hero-num b {
  display: block;
  font-family: var(--font-mono);
  font-size: 32px;
  line-height: 1;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}
.hero-num span {
  font-size: 11px;
  opacity: 0.88;
  letter-spacing: 0.3px;
}
.hero-bar {
  position: relative;
  height: 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.22);
  margin: 15px 0 10px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
}
.hero-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #38bdf8, #ffffff);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.8);
  transition: width 0.4s ease;
}
.hero-foot {
  position: relative;
  font-size: 12px;
  opacity: 0.95;
  font-weight: 500;
}
.hero-foot .dot {
  margin: 0 6px;
  opacity: 0.6;
}

/* 智能速练快捷入口 */
.hero-actions {
  position: relative;
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.hero-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  border-radius: var(--r-sm);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.3px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.hero-btn.primary {
  background: #ffffff;
  color: #1d4ed8;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}
.hero-btn.primary:active {
  transform: scale(0.97);
  background: #f1f5f9;
}
.hero-btn.ghost {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.32);
  backdrop-filter: blur(8px);
}
.hero-btn.ghost:active {
  transform: scale(0.97);
  background: rgba(255, 255, 255, 0.25);
}
.hero-btn b {
  font-family: var(--font-mono);
  font-weight: 700;
}
.btn-icon {
  font-size: 14px;
}

/* ---------- 模块卡 ---------- */
.mod-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.mod {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  padding: 13px 13px 11px;
  background: var(--mat-bg);
  border: 1px solid var(--border-color);
  transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.18s ease;
}
.mod:active {
  transform: scale(0.96);
}
.mod-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3.5px;
  background: var(--mc);
  box-shadow: 0 0 8px var(--mc);
}
.mod-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.mod-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.mod-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--mc);
  letter-spacing: 0.2px;
}
.mod-cnt {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-sub);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.mod-track {
  height: 4.5px;
  border-radius: 999px;
  background: var(--border-color);
  margin: 9px 0 7px;
  overflow: hidden;
}
.mod-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--mc);
  box-shadow: 0 0 6px var(--mc);
  transition: width 0.4s ease;
}
.mod-desc {
  font-size: 11px;
  color: var(--text-sub);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ---------- 快捷入口 ---------- */
.quick {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.quick > * {
  flex: 1;
}
</style>

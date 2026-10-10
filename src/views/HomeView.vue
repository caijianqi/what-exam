<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { MODULES, TOTAL_QUESTIONS } from "../data/modules";
import { listWrong, moduleProgress, overview, todayStats, usingFallback } from "../db/records";
import { useSettingsStore } from "../stores/settings";

const router = useRouter();
const route = useRoute();
const settings = useSettingsStore();

const todayCount = ref(0);
const todayCorrect = ref(0);
const doneByModule = ref<Record<string, number>>({});
const wrongPending = ref(0);
const streak = ref(0);
const dbError = ref("");

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
</script>

<template>
  <div class="page">
    <!-- 今日进度头图 -->
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
            <span class="mod-name">{{ m.name }}</span>
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
/* ---------- 头图 ---------- */
.hero {
  position: relative;
  overflow: hidden;
  border-radius: var(--r-card);
  padding: 16px 16px 14px;
  margin-bottom: 12px;
  color: #fff;
  background: linear-gradient(135deg, #4f8dff 0%, #2f6bff 55%, #1f4ed8 100%);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.28);
}
.hero::after {
  content: "";
  position: absolute;
  right: -30px;
  top: -50px;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
}
.hero::before {
  content: "";
  position: absolute;
  right: 40px;
  bottom: -60px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}
.hero-top {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.hero-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.hero-sub {
  font-size: 12px;
  opacity: 0.85;
  margin-top: 2px;
}
.hero-num {
  text-align: right;
  position: relative;
}
.hero-num b {
  display: block;
  font-size: 30px;
  line-height: 1;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.hero-num span {
  font-size: 11px;
  opacity: 0.85;
}
.hero-bar {
  position: relative;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.28);
  margin: 14px 0 8px;
  overflow: hidden;
}
.hero-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: #fff;
  transition: width 0.4s ease;
}
.hero-foot {
  position: relative;
  font-size: 12px;
  opacity: 0.92;
}
.hero-foot .dot {
  margin: 0 6px;
  opacity: 0.6;
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
  padding: 12px 12px 10px;
  background: var(--mat-bg);
  border: 1px solid var(--border-color);
  transition: transform 0.15s ease;
}
.mod:active {
  transform: scale(0.97);
}
.mod-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--mc);
}
.mod-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px;
}
.mod-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--mc);
}
.mod-cnt {
  font-size: 11px;
  color: var(--text-sub);
  font-variant-numeric: tabular-nums;
}
.mod-track {
  height: 4px;
  border-radius: 999px;
  background: var(--border-color);
  margin: 8px 0 6px;
  overflow: hidden;
}
.mod-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--mc);
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

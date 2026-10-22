<script setup lang="ts">
/**
 * 统计页。
 *
 * 四块：总览数字卡 → 近 14 天趋势 → 各模块正确率 → 弱项题型 TOP。
 * 图表是纯 SVG 手绘（不引 ECharts，控制包体积）。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { loadBank } from "../data/bank";
import { MODULES, moduleName } from "../data/modules";
import {
  dailyTrend,
  moduleBreakdown,
  overview,
  subTypeBreakdown,
  usingFallback,
  type DayStat,
  type GroupStat,
  type Overview,
} from "../db/records";
import TrendChart from "../components/TrendChart.vue";
import RadarChart, { type RadarMetric } from "../components/RadarChart.vue";

const route = useRoute();

const ov = ref<Overview>({
  total: 0,
  correct: 0,
  accuracy: 0,
  durationMs: 0,
  wrongPending: 0,
  favorites: 0,
  streak: 0,
});
const trend = ref<DayStat[]>([]);
const byModule = ref<GroupStat[]>([]);
const bySubType = ref<GroupStat[]>([]);
const loading = ref(false);

const avgText = computed(() => {
  if (!ov.value.total) return "—";
  const s = ov.value.durationMs / 1000 / ov.value.total;
  return s >= 60 ? `${Math.floor(s / 60)}分${Math.round(s % 60)}秒` : `${Math.round(s)}秒`;
});

const trendTotal = computed(() => trend.value.reduce((a, d) => a + d.attempted, 0));

const radarData = computed<RadarMetric[]>(() => {
  return MODULES.map((m) => {
    const stat = byModule.value.find((b) => b.key === m.key);
    return {
      key: m.key,
      name: m.short || m.name,
      value: stat?.accuracy ?? 0,
      attempted: stat?.attempted ?? 0,
    };
  });
});

async function load() {
  loading.value = true;
  try {
    const bank = await loadBank();
    const map = new Map(bank.questions.map((q) => [q.id, q.subType]));
    const [o, t, m, s] = await Promise.all([
      overview(),
      dailyTrend(14),
      moduleBreakdown(),
      subTypeBreakdown((id) => map.get(id)),
    ]);
    ov.value = o;
    trend.value = t;
    byModule.value = m;
    bySubType.value = s;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(
  () => route.path,
  (p) => {
    if (p === "/stats") load();
  }
);

/** 模块名 + 该模块题库总量 */
function modLabel(key: string): string {
  return moduleName(key);
}
function modTotal(key: string): number {
  return MODULES.find((m) => m.key === key)?.total ?? 0;
}
function barColor(a: number): string {
  if (a >= 80) return "#10b981";
  if (a >= 60) return "#3b82f6";
  if (a >= 40) return "#f59e0b";
  return "#ef4444";
}
</script>

<template>
  <div class="page">
    <div class="card">
      <div class="section-title">总览</div>
      <div class="stat-grid">
        <div>
          <b class="stat-num">{{ ov.total }}</b>
          <span class="stat-label">累计做题</span>
        </div>
        <div>
          <b class="stat-num ok">{{ ov.accuracy }}%</b>
          <span class="stat-label">总正确率</span>
        </div>
        <div>
          <b class="stat-num brand">{{ ov.streak }}</b>
          <span class="stat-label">连续天数</span>
        </div>
        <div>
          <b class="stat-num">{{ avgText }}</b>
          <span class="stat-label">平均每题</span>
        </div>
      </div>
      <div class="muted">
        待攻克错题 {{ ov.wrongPending }} 道 · 收藏 {{ ov.favorites }} 道
      </div>
      <div v-if="usingFallback()" class="muted tip">
        当前为非 Tauri 预览环境，记录存在浏览器本地
      </div>
    </div>

    <!-- 四维能力雷达图 -->
    <div class="card">
      <div class="section-title">
        四维战力雷达
        <span class="muted">四大模块掌握度</span>
      </div>
      <RadarChart :data="radarData" />
    </div>

    <div class="card">
      <div class="section-title">
        近 14 天
        <span class="muted">共 {{ trendTotal }} 题</span>
      </div>
      <TrendChart :data="trend" />
      <div class="legend">
        <span><i class="sw ok"></i>做对</span>
        <span><i class="sw"></i>总数</span>
        <span><i class="ln"></i>正确率</span>
      </div>
    </div>

    <div class="card">
      <div class="section-title">各模块正确率</div>
      <div v-if="byModule.length === 0" class="muted">还没有数据</div>
      <div v-for="m in byModule" :key="m.key" class="bar-row">
        <div class="bar-head">
          <span>{{ modLabel(m.key) }}</span>
          <span class="muted">
            {{ m.correct }}/{{ m.attempted }}（题库 {{ modTotal(m.key) }}）
          </span>
        </div>
        <van-progress
          :percentage="m.accuracy"
          :color="barColor(m.accuracy)"
          :show-pivot="false"
        />
        <div class="pct" :style="{ color: barColor(m.accuracy) }">{{ m.accuracy }}%</div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">弱项题型（正确率升序）</div>
      <div v-if="bySubType.length === 0" class="muted">还没有数据</div>
      <div v-for="s in bySubType.slice(0, 8)" :key="s.key" class="bar-row">
        <div class="bar-head">
          <span>{{ s.key }}</span>
          <span class="muted">{{ s.correct }}/{{ s.attempted }}</span>
        </div>
        <van-progress
          :percentage="s.accuracy"
          :color="barColor(s.accuracy)"
          :show-pivot="false"
        />
        <div class="pct" :style="{ color: barColor(s.accuracy) }">{{ s.accuracy }}%</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tip {
  margin-top: 6px;
}

.legend {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-sub);
  justify-content: center;
}
.sw {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--chart-bar, #c8d3e0);
  margin-right: 4px;
}
.sw.ok {
  background: var(--ok);
}
.ln {
  display: inline-block;
  width: 12px;
  height: 2px;
  background: var(--brand-b);
  margin-right: 4px;
  vertical-align: middle;
}

.bar-row {
  margin-bottom: 14px;
}
.bar-row:last-child {
  margin-bottom: 2px;
}
.bar-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  margin-bottom: 5px;
}
.bar-head .muted {
  font-variant-numeric: tabular-nums;
}
.pct {
  text-align: right;
  font-size: 11px;
  margin-top: 3px;
  font-weight: 600;
}
</style>

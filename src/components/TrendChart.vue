<script setup lang="ts">
/**
 * 近 N 天做题趋势图：柱状（每日题量，柱内深色段=做对）+ 正确率折线。
 * 纯 SVG 手绘，不引图表库（省体积，也避免老 WebView 兼容问题）。
 */
import { computed } from "vue";
import type { DayStat } from "../db/records";

const props = withDefaults(defineProps<{ data: DayStat[]; height?: number }>(), {
  height: 130,
});

const W = 320;
const PAD_L = 4;
const PAD_B = 16;
const PAD_T = 10;

const max = computed(() => Math.max(1, ...props.data.map((d) => d.attempted)));
const innerH = computed(() => props.height - PAD_B - PAD_T);
const slot = computed(() => (W - PAD_L * 2) / Math.max(props.data.length, 1));
const barW = computed(() => Math.min(18, slot.value * 0.62));

function xOf(i: number): number {
  return PAD_L + slot.value * i + slot.value / 2;
}
function hOf(v: number): number {
  return (v / max.value) * innerH.value;
}

const points = computed(() =>
  props.data
    .map((d, i) => {
      const y =
        PAD_T + innerH.value - (d.attempted ? (d.correct / d.attempted) * innerH.value : 0);
      return `${xOf(i).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ")
);

/** 日期标签：每隔 n 天显示，避免拥挤 */
const labelStep = computed(() => (props.data.length > 14 ? 3 : props.data.length > 7 ? 2 : 1));
</script>

<template>
  <svg
    class="chart"
    :viewBox="`0 0 ${W} ${height}`"
    role="img"
    aria-label="近几日做题趋势"
  >
    <!-- 基线 -->
    <line
      :x1="PAD_L"
      :y1="height - PAD_B"
      :x2="W - PAD_L"
      :y2="height - PAD_B"
      class="axis"
    />

    <g v-for="(d, i) in data" :key="d.date">
      <rect
        v-if="d.attempted > 0"
        :x="xOf(i) - barW / 2"
        :y="height - PAD_B - hOf(d.attempted)"
        :width="barW"
        :height="hOf(d.attempted)"
        rx="2"
        class="bar"
      />
      <rect
        v-if="d.attempted > 0"
        :x="xOf(i) - barW / 2"
        :y="height - PAD_B - hOf(d.correct)"
        :width="barW"
        :height="hOf(d.correct)"
        rx="2"
        class="bar-ok"
      />
      <text
        v-if="i % labelStep === labelStep - 1"
        :x="xOf(i)"
        :y="height - 4"
        text-anchor="middle"
        class="label"
      >
        {{ d.date.slice(5) }}
      </text>
    </g>

    <polyline :points="points" class="line" />
  </svg>
</template>

<style scoped>
.chart {
  width: 100%;
  height: auto;
  display: block;
}
.axis {
  stroke: var(--border-color);
  stroke-width: 1;
}
.bar {
  fill: var(--chart-bar, #c8d3e0);
}
.bar-ok {
  fill: var(--chart-bar-ok, var(--ok));
}
.line {
  fill: none;
  stroke: var(--brand-b);
  stroke-width: 1.6;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.label {
  font-size: 9px;
  fill: var(--text-sub);
}
</style>

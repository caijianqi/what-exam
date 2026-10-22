<script setup lang="ts">
/**
 * 纯 SVG 手绘四维能力雷达图（0 依赖，包体积零开销）。
 * 展现数量关系、判断推理、言语理解与表达、资料分析的综合掌握度。
 */
import { computed } from "vue";

export interface RadarMetric {
  key: string;
  name: string;
  value: number; // 0 - 100
  attempted?: number;
}

const props = withDefaults(
  defineProps<{
    data: RadarMetric[];
    size?: number;
  }>(),
  {
    size: 260,
  }
);

const W = computed(() => props.size);
const H = computed(() => props.size);
const cx = computed(() => W.value / 2);
const cy = computed(() => H.value / 2);
const R = computed(() => W.value * 0.34);

const rings = [0.25, 0.5, 0.75, 1.0];

function angleOf(i: number, total: number): number {
  return -Math.PI / 2 + (2 * Math.PI * i) / Math.max(total, 1);
}

// 环形多边形顶点坐标
const ringPolygons = computed(() => {
  const n = props.data.length || 4;
  return rings.map((factor) => {
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = angleOf(i, n);
      const x = cx.value + R.value * factor * Math.cos(a);
      const y = cy.value + R.value * factor * Math.sin(a);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  });
});

// 轴线
const axes = computed(() => {
  const n = props.data.length || 4;
  return Array.from({ length: n }).map((_, i) => {
    const a = angleOf(i, n);
    return {
      x2: cx.value + R.value * Math.cos(a),
      y2: cy.value + R.value * Math.sin(a),
    };
  });
});

// 数据多边形与顶点节点
const dataNodes = computed(() => {
  const n = props.data.length;
  if (!n) return [];
  return props.data.map((d, i) => {
    const a = angleOf(i, n);
    // 即使为 0，也赋予微量底值（10%）便于视觉锚定
    const pct = Math.max(d.value, 10);
    const r = (pct / 100) * R.value;
    const x = cx.value + r * Math.cos(a);
    const y = cy.value + r * Math.sin(a);
    return {
      x,
      y,
      name: d.name,
      val: d.value,
      attempted: d.attempted ?? 0,
      labelX: cx.value + (R.value + 26) * Math.cos(a),
      labelY: cy.value + (R.value + 16) * Math.sin(a),
      align:
        Math.cos(a) > 0.35 ? "start" : Math.cos(a) < -0.35 ? "end" : "middle",
    };
  });
});

const dataPolygon = computed(() =>
  dataNodes.value.map((node) => `${node.x.toFixed(1)},${node.y.toFixed(1)}`).join(" ")
);
</script>

<template>
  <div class="radar-container">
    <svg
      class="radar-svg"
      :viewBox="`0 0 ${W} ${H}`"
      role="img"
      aria-label="行测能力雷达图"
    >
      <defs>
        <!-- 科技感脉冲径向渐变 -->
        <radialGradient id="radarGlowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="var(--brand-a)" stop-opacity="0.5" />
          <stop offset="70%" stop-color="var(--brand-b)" stop-opacity="0.25" />
          <stop offset="100%" stop-color="var(--brand-b)" stop-opacity="0.05" />
        </radialGradient>
      </defs>

      <!-- 环状同心刻度线 -->
      <polygon
        v-for="(pts, idx) in ringPolygons"
        :key="idx"
        :points="pts"
        class="radar-ring"
        :class="{ outer: idx === rings.length - 1 }"
      />

      <!-- 辐射轴线 -->
      <line
        v-for="(ax, idx) in axes"
        :key="`ax-${idx}`"
        :x1="cx"
        :y1="cy"
        :x2="ax.x2"
        :y2="ax.y2"
        class="radar-axis"
      />

      <!-- 实际能力覆盖多边形 -->
      <polygon
        v-if="dataNodes.length >= 3"
        :points="dataPolygon"
        class="radar-area"
      />

      <!-- 顶点指示点与微光 -->
      <g v-for="(node, idx) in dataNodes" :key="`pt-${idx}`">
        <circle
          :cx="node.x"
          :cy="node.y"
          r="4"
          class="radar-dot"
        />
        <!-- 标签与数值 -->
        <text
          :x="node.labelX"
          :y="node.labelY"
          :text-anchor="node.align"
          class="radar-label"
        >
          {{ node.name }}
          <tspan class="radar-val">{{ node.val }}%</tspan>
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.radar-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4px 0 8px;
}
.radar-svg {
  width: 100%;
  max-width: 280px;
  height: auto;
  overflow: visible;
}
.radar-ring {
  fill: none;
  stroke: var(--border-color);
  stroke-width: 1;
  stroke-dasharray: 3 3;
  opacity: 0.8;
}
.radar-ring.outer {
  stroke-dasharray: none;
  stroke-width: 1.2;
  opacity: 1;
}
.radar-axis {
  stroke: var(--border-color);
  stroke-width: 1;
  opacity: 0.8;
}
.radar-area {
  fill: url(#radarGlowGrad);
  stroke: var(--brand-a);
  stroke-width: 2.2;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 8px var(--brand-glow));
  transition: all 0.4s ease;
}
.radar-dot {
  fill: var(--brand-a);
  stroke: #ffffff;
  stroke-width: 1.5;
  filter: drop-shadow(0 0 4px var(--brand-glow));
}
[data-theme="dark"] .radar-dot {
  stroke: #111622;
}
.radar-label {
  font-size: 11px;
  font-weight: 600;
  fill: var(--text-main);
  letter-spacing: 0.2px;
}
.radar-val {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  fill: var(--brand-a);
}
</style>

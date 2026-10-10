<script setup lang="ts">
/** 答题卡：题号网格 + 状态着色，点格子直接跳题 */
import type { Question } from "../data/bank";

const props = defineProps<{
  show: boolean;
  queue: Question[];
  currentIndex: number;
  statuses: Record<string, "none" | "correct" | "wrong">;
  examMode: boolean;
}>();

const emit = defineEmits<{
  (e: "update:show", v: boolean): void;
  (e: "jump", i: number): void;
  (e: "submit"): void;
}>();

function close() {
  emit("update:show", false);
}
function jump(i: number) {
  emit("jump", i);
  close();
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    :style="{ height: '62%' }"
    safe-area-inset-bottom
    @update:show="emit('update:show', $event)"
  >
    <div class="sheet">
      <div class="sheet-head">
        <span class="legend"><i class="dot none"></i>未做</span>
        <span class="legend"><i class="dot correct"></i>正确</span>
        <span class="legend"><i class="dot wrong"></i>错误</span>
      </div>

      <div class="grid">
        <div
          v-for="(q, i) in queue"
          :key="q.id"
          class="cell"
          :class="[statuses[q.id] ?? 'none', { current: i === currentIndex }]"
          @click="jump(i)"
        >
          {{ i + 1 }}
        </div>
      </div>

      <div class="sheet-foot">
        <van-button v-if="examMode" block type="primary" @click="emit('submit'); close()">
          交卷并查看结果
        </van-button>
        <van-button v-else block plain @click="close">继续做题</van-button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
}

.sheet-head {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--text-sub);
  margin-bottom: 10px;
}
.legend {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}
.dot.none {
  background: var(--cell-none-bg);
  border: 1px solid var(--border-color);
}
.dot.correct {
  background: var(--ok);
}
.dot.wrong {
  background: var(--bad);
}

.grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  align-content: start;
}

.cell {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 14px;
  background: var(--cell-none-bg);
  border: 1px solid var(--border-color);
  color: var(--text-main);
}
.cell.correct {
  background: var(--ok);
  border-color: var(--ok);
  color: #fff;
}
.cell.wrong {
  background: var(--bad);
  border-color: var(--bad);
  color: #fff;
}
.cell.current {
  outline: 2px solid var(--brand-b);
  outline-offset: 1px;
}

.sheet-foot {
  padding-top: 10px;
  padding-bottom: var(--safe-bottom);
}
</style>

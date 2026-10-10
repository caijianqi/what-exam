<script setup lang="ts">
/** 结算面板：正确率、用时、错题数 + 三种后续动作 */
import { computed, ref, watch } from "vue";

const props = defineProps<{
  show: boolean;
  total: number;
  correct: number;
  wrong: number;
  answered: number;
  durationMs: number;
}>();

const emit = defineEmits<{
  (e: "update:show", v: boolean): void;
  (e: "redoWrong"): void;
  (e: "restart"): void;
  (e: "exit"): void;
}>();

const accuracy = computed(() =>
  props.answered ? Math.round((props.correct / props.answered) * 100) : 0
);

// 环形进度用 v-model 驱动动画，不能直接绑 props
const rate = ref(0);
watch(
  () => props.show,
  (v) => {
    if (!v) return;
    rate.value = 0;
    setTimeout(() => {
      rate.value = accuracy.value;
    }, 60);
  }
);
const avgText = computed(() => {
  if (!props.answered) return "—";
  const s = props.durationMs / 1000 / props.answered;
  return s >= 60
    ? `${Math.floor(s / 60)} 分 ${Math.round(s % 60)} 秒`
    : `${Math.round(s)} 秒`;
});
const totalText = computed(() => {
  const s = props.durationMs / 1000;
  return s >= 60 ? `${Math.floor(s / 60)} 分 ${Math.round(s % 60)} 秒` : `${Math.round(s)} 秒`;
});

function act(name: "redoWrong" | "restart" | "exit") {
  emit("update:show", false);
  if (name === "redoWrong") emit("redoWrong");
  else if (name === "restart") emit("restart");
  else emit("exit");
}
</script>

<template>
  <van-popup
    :show="show"
    position="center"
    :style="{ width: '84%', borderRadius: '18px' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="result">
      <div class="title">本组完成</div>
      <div class="sub">{{ total }} 题 · 用时 {{ totalText }}</div>

      <div class="ring">
        <van-circle
          v-model:current-rate="rate"
          :rate="accuracy"
          :speed="20"
          :stroke-width="70"
          :color="{ '0%': '#5b93ff', '100%': '#2563eb' }"
          size="100px"
        >
          <template #default>
            <div class="ring-inner">
              <div class="ring-num">{{ accuracy }}%</div>
              <div class="ring-sub">正确率</div>
            </div>
          </template>
        </van-circle>
      </div>

      <div class="stats">
        <div><b>{{ answered }}</b><span>已做</span></div>
        <div class="ok"><b>{{ correct }}</b><span>正确</span></div>
        <div class="bad"><b>{{ wrong }}</b><span>错误</span></div>
        <div><b>{{ avgText }}</b><span>平均/题</span></div>
      </div>

      <div class="actions">
        <van-button v-if="wrong > 0" block type="danger" plain @click="act('redoWrong')">
          只重做 {{ wrong }} 道错题
        </van-button>
        <van-button block type="primary" @click="act('restart')">再来一组</van-button>
        <van-button block plain @click="act('exit')">返回</van-button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.result {
  padding: 20px 16px 16px;
  background: var(--card-bg);
  border-radius: 18px;
}
.title {
  text-align: center;
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 2px;
}
.sub {
  text-align: center;
  font-size: 12px;
  color: var(--text-sub);
  margin-bottom: 14px;
}
.ring {
  display: flex;
  justify-content: center;
}
.ring-inner {
  text-align: center;
  line-height: 1.2;
}
.ring-num {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(135deg, var(--brand-a), var(--brand-b));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.ring-sub {
  font-size: 11px;
  color: var(--text-sub);
}
.stats {
  display: flex;
  margin-top: 16px;
  padding: 12px 0;
  border-radius: 12px;
  background: var(--mat-bg);
}
.stats > div {
  flex: 1;
  text-align: center;
}
.stats b {
  display: block;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}
.stats span {
  font-size: 11px;
  color: var(--text-sub);
}
.stats .ok b {
  color: var(--ok);
}
.stats .bad b {
  color: var(--bad);
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}
</style>

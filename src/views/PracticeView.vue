<script setup lang="ts">
/**
 * 练习配置页。
 * 首页点模块进来会带 ?module=xxx 预选，也可在这里换模块 / 题型 / 模式。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { showToast } from "vant";
import { MODULES, moduleColor, subTypesOf } from "../data/modules";
import { usePracticeStore, type PracticeMode } from "../stores/practice";

const route = useRoute();
const router = useRouter();
const ps = usePracticeStore();

const moduleKey = ref(String(route.query.module ?? MODULES[0].key));
const subType = ref("");
const mode = ref<PracticeMode>("practice");
const order = ref<"seq" | "random">("seq");
const limit = ref(0); // 0 = 全部
const starting = ref(false);

const subTypes = computed(() => {
  const b = ps.bank;
  if (!b) return [] as { name: string; count: number }[];
  return subTypesOf(b, moduleKey.value);
});

/** 当前筛选下的实际题量 */
const available = computed(() => {
  const b = ps.bank;
  if (!b) return 0;
  const list = b.questions.filter(
    (q) => q.module === moduleKey.value && (!subType.value || q.subType === subType.value)
  );
  return list.length;
});

const finalCount = computed(() =>
  limit.value === 0 ? available.value : Math.min(limit.value, available.value)
);

watch(moduleKey, () => {
  subType.value = "";
  limit.value = 0;
});

onMounted(async () => {
  try {
    await ps.ensureBank();
  } catch {
    showToast("题库加载失败");
  }
});

async function begin() {
  if (!available.value) {
    showToast("该条件下没有题目");
    return;
  }
  starting.value = true;
  try {
    await ps.start({
      module: moduleKey.value,
      subType: subType.value || undefined,
      mode: mode.value,
      order: order.value,
      limit: limit.value,
    });
    router.push("/practice/session");
  } catch (e) {
    showToast("开始失败：" + e);
  } finally {
    starting.value = false;
  }
}

const moduleName = computed(
  () => MODULES.find((m) => m.key === moduleKey.value)?.name ?? moduleKey.value
);
const accent = computed(() => moduleColor(moduleKey.value));

const modeOptions = [
  { value: "practice" as PracticeMode, title: "练习", desc: "答完即判，立刻看解析" },
  { value: "exam" as PracticeMode, title: "模考", desc: "全部答完交卷后统一判分" },
];
const orderOptions = [
  { value: "seq" as const, title: "顺序" },
  { value: "random" as const, title: "随机" },
];
</script>

<template>
  <div class="page">
    <div v-if="ps.loadError" class="card">
      <div class="muted">题库加载失败：{{ ps.loadError }}</div>
    </div>

    <div class="card">
      <div class="section-title">选择模块</div>
      <div class="mods">
        <div
          v-for="m in MODULES"
          :key="m.key"
          class="mod-item"
          :class="{ on: m.key === moduleKey }"
          :style="{ '--mc': m.color }"
          @click="moduleKey = m.key"
        >
          <span class="mod-item-name">{{ m.short }}</span>
          <span class="mod-item-total">{{ m.total }}</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        二级题型
        <span class="muted">{{ moduleName }}</span>
      </div>
      <div class="chips">
        <span class="chip" :class="{ on: !subType }" @click="subType = ''">
          全部（{{ ps.bank ? ps.bank.questions.filter((q) => q.module === moduleKey).length : 0 }}）
        </span>
        <span
          v-for="s in subTypes"
          :key="s.name"
          class="chip"
          :class="{ on: s.name === subType }"
          @click="subType = s.name"
        >
          {{ s.name }}（{{ s.count }}）
        </span>
      </div>
    </div>

    <div class="card">
      <div class="section-title">练习方式</div>
      <div class="pick-row">
        <div
          v-for="o in modeOptions"
          :key="o.value"
          class="pick"
          :class="{ on: mode === o.value }"
          @click="mode = o.value"
        >
          <div class="pick-title">{{ o.title }}</div>
          <div class="pick-desc">{{ o.desc }}</div>
        </div>
      </div>
      <div class="order-row">
        <span
          v-for="o in orderOptions"
          :key="o.value"
          class="chip"
          :class="{ on: order === o.value }"
          @click="order = o.value"
        >
          {{ o.title }}
        </span>
        <span class="grow"></span>
        <span class="muted">题量</span>
        <van-stepper
          v-model="limit"
          :min="0"
          :max="available || 200"
          :step="5"
          button-size="22px"
        />
      </div>
      <div class="muted count-line">
        本次 <b class="hl" :style="{ color: accent }">{{ finalCount }}</b> 题
        {{ limit === 0 ? "（全部）" : "" }}
        {{ order === "random" ? "· 随机打乱" : "· 按题号顺序" }}
      </div>
    </div>

    <div class="start-card">
      <van-button block type="primary" size="large" :loading="starting" @click="begin">
        开始{{ mode === "exam" ? "模考" : "练习" }}
      </van-button>
      <div class="muted" style="margin-top: 8px; text-align: center">
        答错自动进错题本，记录在 SQLite
      </div>
    </div>
  </div>
</template>

<style scoped>
.mods {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.mod-item {
  border-radius: 12px;
  padding: 10px 4px;
  text-align: center;
  border: 1px solid var(--border-color);
  background: var(--mat-bg);
  transition: all 0.16s ease;
}
.mod-item.on {
  border-color: var(--mc);
  background: var(--mc);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
}
.mod-item-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--mc);
}
.mod-item-total {
  display: block;
  font-size: 11px;
  color: var(--text-sub);
  margin-top: 1px;
  font-variant-numeric: tabular-nums;
}
.mod-item.on .mod-item-name,
.mod-item.on .mod-item-total {
  color: #fff;
}

.pick-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.pick {
  border-radius: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  background: var(--mat-bg);
  transition: all 0.16s ease;
}
.pick.on {
  border-color: var(--brand-a);
  background: var(--brand-soft);
}
.pick-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}
.pick.on .pick-title {
  color: var(--brand-b);
}
.pick-desc {
  font-size: 11px;
  color: var(--text-sub);
  line-height: 1.4;
  margin-top: 2px;
}

.order-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.grow {
  flex: 1;
}
.count-line {
  margin-top: 10px;
}
.hl {
  color: var(--brand-b);
  font-size: 15px;
}

.start-card {
  margin: 4px 0 8px;
}
</style>

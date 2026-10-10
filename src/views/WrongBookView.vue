<script setup lang="ts">
/**
 * 错题本。
 *
 * 数据来自 wrong_book 表，题干/选项从题库 JSON 里 join（SQLite 只存 id）。
 * 三种操作：单题重做、标记掌握（隐藏但保留）、彻底移除。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { showConfirmDialog, showToast } from "vant";
import { loadBank, type Question } from "../data/bank";
import { MODULES, moduleColor, moduleName } from "../data/modules";
import {
  listWrong,
  removeWrong,
  setMastered,
  type WrongRow,
} from "../db/records";
import { usePracticeStore } from "../stores/practice";

const route = useRoute();
const router = useRouter();
const ps = usePracticeStore();

const rows = ref<WrongRow[]>([]);
const allRows = ref<WrongRow[]>([]);
const bankMap = ref<Record<string, Question>>({});
const filterKey = ref("all"); // all | 模块 key
const showMastered = ref(false);
const loading = ref(false);

const pendingCount = computed(() => allRows.value.filter((r) => !r.mastered).length);
const masteredCount = computed(() => allRows.value.filter((r) => r.mastered).length);

const visible = computed(() => {
  const list = showMastered.value ? allRows.value : rows.value;
  if (filterKey.value === "all") return list;
  return list.filter((r) => r.question_id.split("-")[0] === filterKey.value);
});

function q(id: string): Question | undefined {
  return bankMap.value[id];
}

function brief(id: string): string {
  const item = q(id);
  if (!item) return id;
  const s = item.stem.replace(/\s+/g, " ").trim();
  const tag = item.stemImages.length || item.optionImage ? "[图] " : "";
  return tag + (s.length > 52 ? s.slice(0, 52) + "…" : s);
}

async function load() {
  loading.value = true;
  try {
    const bank = await loadBank();
    const map: Record<string, Question> = {};
    for (const item of bank.questions) map[item.id] = item;
    bankMap.value = map;

    allRows.value = await listWrong(true);
    rows.value = allRows.value.filter((r) => !r.mastered);
  } catch (e) {
    showToast("加载失败：" + e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
// 从做题页返回时刷新（重做答对会自动转为已掌握）
watch(
  () => route.path,
  (p) => {
    if (p === "/wrong") load();
  }
);
watch(showMastered, load);

async function redoOne(id: string) {
  await ps.startWithIds([id], { title: "错题重做" });
  router.push("/practice/session");
}

async function redoAll() {
  const ids = visible.value.map((r) => r.question_id);
  if (!ids.length) {
    showToast("当前筛选下没有题目");
    return;
  }
  await ps.startWithIds(ids, { title: `错题重做（${ids.length} 题）` });
  router.push("/practice/session");
}

async function onRemove(row: WrongRow) {
  await showConfirmDialog({
    title: "移出错题本",
    message: "将彻底删除这道错题的记录（含错误次数），确定继续？",
  });
  await removeWrong(row.question_id);
  showToast("已移除");
  await load();
}
</script>

<template>
  <div class="page">
    <div class="card">
      <div class="section-title">错题本</div>
      <div class="stat-grid">
        <div>
          <b class="stat-num bad">{{ pendingCount }}</b>
          <span class="stat-label">待攻克</span>
        </div>
        <div>
          <b class="stat-num ok">{{ masteredCount }}</b>
          <span class="stat-label">已掌握</span>
        </div>
        <div>
          <b class="stat-num">{{ visible.length }}</b>
          <span class="stat-label">当前筛选</span>
        </div>
      </div>
      <div class="filter-row">
        <van-checkbox v-model="showMastered" shape="square">显示已掌握</van-checkbox>
      </div>
    </div>

    <div class="card">
      <div class="chips">
        <span
          class="chip"
          :class="{ on: filterKey === 'all' }"
          @click="filterKey = 'all'"
        >
          全部
        </span>
        <span
          v-for="m in MODULES"
          :key="m.key"
          class="chip"
          :class="{ on: filterKey === m.key }"
          @click="filterKey = m.key"
        >
          {{ m.short }}
        </span>
      </div>
      <van-button
        block
        type="danger"
        plain
        style="margin-top: 10px"
        :disabled="visible.length === 0"
        @click="redoAll"
      >
        重做这 {{ visible.length }} 道
      </van-button>
    </div>

    <van-empty v-if="!loading && visible.length === 0" description="还没有错题，先去刷几题" />

    <van-swipe-cell
      v-for="r in visible"
      :key="r.question_id"
      class="wrong-cell"
    >
      <div
        class="card item"
        :style="{ '--mc': moduleColor(r.question_id.split('-')[0]) }"
        @click="redoOne(r.question_id)"
      >
        <div class="item-head">
          <span class="tag">{{ moduleName(r.question_id.split("-")[0]) }}</span>
          <span class="muted">{{ q(r.question_id)?.subType ?? "" }}</span>
          <span class="grow"></span>
          <span class="muted">{{ r.question_id }}</span>
        </div>
        <div class="brief">{{ brief(r.question_id) }}</div>
        <div class="item-foot">
          <span :class="['cnt', { mastered: r.mastered }]">
            错 {{ r.wrong_count }} 次
          </span>
          <span v-if="r.mastered" class="ok-tag">已掌握</span>
          <span v-else-if="r.last_wrong_at" class="muted">{{ r.last_wrong_at }}</span>
        </div>
      </div>

      <template #right>
        <van-button
          square
          type="primary"
          class="swipe-btn"
          :text="r.mastered ? '取消掌握' : '掌握'"
          @click="setMastered(r.question_id, !r.mastered).then(load)"
        />
        <van-button square type="danger" class="swipe-btn" text="移除" @click="onRemove(r)" />
      </template>
    </van-swipe-cell>

    <div style="margin-top: 12px">
      <van-button block plain type="primary" @click="router.push('/practice')">
        去刷题
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.filter-row {
  margin-top: 12px;
}

.wrong-cell {
  display: block;
  margin-bottom: 10px;
  border-radius: var(--r-card);
  overflow: hidden;
}

.item {
  margin-bottom: 0;
  border-radius: 0;
  border-left: 3px solid var(--mc);
  transition: transform 0.12s ease;
}
.item:active {
  transform: scale(0.995);
}
.item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.grow {
  flex: 1;
}
.tag {
  padding: 1px 9px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--mc);
  border: 1px solid var(--mc);
}
.brief {
  margin: 8px 0;
  font-size: 14px;
  line-height: 1.6;
}
.item-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.cnt {
  color: var(--bad);
  font-weight: 500;
}
.cnt.mastered {
  color: var(--text-sub);
  font-weight: 400;
}
.ok-tag {
  color: var(--ok);
}
.swipe-btn {
  height: 100%;
}
</style>

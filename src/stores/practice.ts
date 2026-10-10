/**
 * 刷题会话。
 *
 * 一个 store 管一场练习：题目队列、当前位置、每道题的作答与判分、
 * 计时、以及把结果落库（records.ts）。页面只负责渲染与手势。
 *
 * 两种模式：
 *   practice 练习模式 —— 选完立即判对错并展开解析
 *   exam     模考模式 —— 选完不判，交卷后统一判分（M5 会再加计时器）
 */
import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  assetUrl,
  loadBank,
  materialOf,
  type Bank,
  type Material,
  type Question,
} from "../data/bank";
import { recordAttempt } from "../db/records";

export type PracticeMode = "practice" | "exam";

export interface AnswerState {
  chosen: string;
  isCorrect: boolean;
  durationMs: number;
  /** 是否已落库（避免重复写 attempts） */
  saved: boolean;
}

export interface StartOptions {
  module: string;
  subType?: string; // 二级题型，空表示全部
  mode: PracticeMode;
  order: "seq" | "random";
  limit?: number; // 0 / 空表示全部
}

export const usePracticeStore = defineStore("practice", () => {
  const bank = ref<Bank | null>(null);
  const loading = ref(false);
  const loadError = ref("");

  const queue = ref<Question[]>([]);
  const index = ref(0);
  const answers = ref<Record<string, AnswerState>>({});
  const mode = ref<PracticeMode>("practice");
  const moduleKey = ref("");
  /** 会话标题：普通练习是模块名，错题重做/收藏练习是自定义名 */
  const title = ref("");
  const subType = ref("");
  const startedAt = ref(0);
  const questionShownAt = ref(0);
  const submitted = ref(false); // 模考模式是否已交卷
  const materialOpen = ref(true);
  const lastMaterialId = ref<string | null>(null);

  const current = computed<Question | null>(() => queue.value[index.value] ?? null);
  const total = computed(() => queue.value.length);
  const answeredCount = computed(() => Object.keys(answers.value).length);
  const correctCount = computed(
    () => Object.values(answers.value).filter((a) => a.isCorrect).length
  );
  const wrongCount = computed(() => answeredCount.value - correctCount.value);
  const accuracy = computed(() =>
    answeredCount.value ? Math.round((correctCount.value / answeredCount.value) * 100) : 0
  );
  const finished = computed(
    () => total.value > 0 && (submitted.value || answeredCount.value >= total.value)
  );

  const currentAnswer = computed<AnswerState | null>(() =>
    current.value ? answers.value[current.value.id] ?? null : null
  );
  const currentMaterial = computed<Material | null>(() => {
    const q = current.value;
    if (!q || !bank.value) return null;
    return materialOf(bank.value, q);
  });

  async function ensureBank() {
    if (bank.value) return bank.value;
    loading.value = true;
    loadError.value = "";
    try {
      bank.value = await loadBank();
    } catch (e) {
      loadError.value = String(e);
      throw e;
    } finally {
      loading.value = false;
    }
    return bank.value;
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function setupSession(list: Question[], opts: {
    mode: PracticeMode;
    module?: string;
    subType?: string;
    title?: string;
  }) {
    queue.value = list;
    index.value = 0;
    answers.value = {};
    mode.value = opts.mode;
    moduleKey.value = opts.module ?? list[0]?.module ?? "";
    subType.value = opts.subType ?? "";
    title.value = opts.title ?? "";
    submitted.value = false;
    materialOpen.value = true;
    lastMaterialId.value = list[0]?.materialId ?? null;
    startedAt.value = Date.now();
    questionShownAt.value = Date.now();
  }

  async function start(opts: StartOptions) {
    const b = await ensureBank();
    let list = b.questions.filter((q) => q.module === opts.module);
    if (opts.subType) list = list.filter((q) => q.subType === opts.subType);
    if (opts.order === "random") list = shuffle(list);
    if (opts.limit && opts.limit > 0) list = list.slice(0, opts.limit);
    setupSession(list, { mode: opts.mode, module: opts.module, subType: opts.subType });
  }

  /** 用指定题目集合开一场（错题重做 / 收藏练习） */
  async function startWithIds(
    ids: string[],
    opts: { mode?: PracticeMode; title?: string; random?: boolean } = {}
  ) {
    const b = await ensureBank();
    const set = new Set(ids);
    let list = b.questions.filter((q) => set.has(q.id));
    if (opts.random) list = shuffle(list);
    setupSession(list, {
      mode: opts.mode ?? "practice",
      title: opts.title ?? "",
      module: list[0]?.module ?? "",
    });
  }

  /** 定位到某一题；若切换了材料组，自动展开材料区 */
  function jumpTo(i: number) {
    if (i < 0 || i >= queue.value.length) return;
    index.value = i;
    const mid = queue.value[i].materialId ?? null;
    if (mid !== lastMaterialId.value) {
      materialOpen.value = true;
      lastMaterialId.value = mid;
    }
    questionShownAt.value = Date.now();
  }

  function next() {
    if (index.value < queue.value.length - 1) jumpTo(index.value + 1);
  }

  function prev() {
    if (index.value > 0) jumpTo(index.value - 1);
  }

  /** 选择选项；练习模式立即判分并落库 */
  async function choose(key: string) {
    const q = current.value;
    if (!q || submitted.value) return;
    if (answers.value[q.id]) return; // 已作答，不可改

    const durationMs = Date.now() - questionShownAt.value;
    const isCorrect = key === q.answer;
    answers.value[q.id] = { chosen: key, isCorrect, durationMs, saved: false };

    // 落库失败不打断做题
    try {
      await recordAttempt({
        questionId: q.id,
        chosen: key,
        isCorrect,
        durationMs,
        mode: mode.value,
      });
      answers.value[q.id].saved = true;
    } catch (e) {
      console.warn("[practice] 记录写入失败：", e);
    }
  }

  /** 模考模式交卷 */
  function submit() {
    submitted.value = true;
  }

  /** 重做当前这组题 */
  function restart() {
    answers.value = {};
    submitted.value = false;
    index.value = 0;
    questionShownAt.value = Date.now();
    startedAt.value = Date.now();
  }

  /** 只重做答错的题 */
  function redoWrong() {
    const wrongIds = queue.value
      .filter((q) => answers.value[q.id] && !answers.value[q.id].isCorrect)
      .map((q) => q.id);
    if (!wrongIds.length) return;
    queue.value = queue.value.filter((q) => wrongIds.includes(q.id));
    answers.value = {};
    submitted.value = false;
    index.value = 0;
    questionShownAt.value = Date.now();
  }

  function statusOf(q: Question): "none" | "correct" | "wrong" {
    const a = answers.value[q.id];
    if (!a) return "none";
    return a.isCorrect ? "correct" : "wrong";
  }

  function imgUrl(path: string): string {
    return assetUrl(path);
  }

  return {
    bank,
    loading,
    loadError,
    queue,
    index,
    answers,
    mode,
    moduleKey,
    subType,
    title,
    submitted,
    materialOpen,
    current,
    currentAnswer,
    currentMaterial,
    total,
    answeredCount,
    correctCount,
    wrongCount,
    accuracy,
    finished,
    ensureBank,
    start,
    startWithIds,
    jumpTo,
    next,
    prev,
    choose,
    submit,
    restart,
    redoWrong,
    statusOf,
    imgUrl,
  };
});

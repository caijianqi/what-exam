/**
 * 做题记录读写层。
 *
 * 三张表协同：
 *   attempts    每次作答一行（用于统计与趋势）
 *   wrong_book  错题聚合（自动记错，答对不自动移除，由错题本手动掌握）
 *   daily_stats 按天汇总（首页进度条）
 *
 * 浏览器环境（npm run dev 直连 Vite、没有 Tauri）下自动降级到 localStorage，
 * 保证桌面预览与真机行为一致，不会出现"做题没反应"。
 */
import { exec, query } from "./index";

const LS_KEY = "whatexam.records";
let memoryMode = false;
let backendChecked = false;

/**
 * 首次访问前先探测一次后端。
 *
 * 不能在 run/select 里"失败就静默降级"——那样当次写入会被吞掉
 * （SQL 分支走完才发现没有 Tauri，数据既没进 SQLite 也没进 localStorage）。
 * 所以所有公开 API 进来先 ready()，确定好走哪条路，再分流执行。
 */
async function ready(): Promise<void> {
  if (memoryMode || backendChecked) return;
  backendChecked = true;
  try {
    await query<{ n: number }>(`SELECT 1 AS n`);
  } catch (e) {
    if (!isTauriMissing(e)) return; // 真实 SQL 错误留给具体调用去抛
    memoryMode = true;
    console.warn("[records] SQLite 不可用，降级到 localStorage：", e);
  }
}

interface MemoryState {
  attempts: Record<string, unknown>[];
  wrong: Record<string, { question_id: string; wrong_count: number; mastered: number }>;
  favorites: Record<string, string>;
  ai_explanations: Record<string, { question_id: string; model: string; content: string; created_at: string }>;
}

function emptyMemory(): MemoryState {
  return { attempts: [], wrong: {}, favorites: {}, ai_explanations: {} };
}

function readMemory(): MemoryState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...emptyMemory(), ...(JSON.parse(raw) as MemoryState) };
  } catch {
    /* ignore */
  }
  return emptyMemory();
}

function writeMemory(s: MemoryState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** 执行一条写操作；Tauri 不可用时降级内存/localStorage */
async function run(sql: string, args: unknown[] = []): Promise<void> {
  if (memoryMode) return;
  try {
    await exec(sql, args);
  } catch (e) {
    if (isTauriMissing(e)) {
      memoryMode = true;
      console.warn("[records] SQLite 不可用，降级到 localStorage：", e);
      return;
    }
    throw e;
  }
}

async function select<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  if (memoryMode) return [] as T[];
  try {
    return await query<T>(sql, args);
  } catch (e) {
    if (isTauriMissing(e)) {
      memoryMode = true;
      console.warn("[records] SQLite 不可用，降级到 localStorage：", e);
      return [] as T[];
    }
    throw e;
  }
}

/** 判断失败原因是不是"当前不在 Tauri 里"，是则降级到 localStorage */
function isTauriMissing(e: unknown): boolean {
  const s = String(e).toLowerCase();
  return (
    s.includes("__tauri_internals__") ||
    s.includes("invoke") ||
    s.includes("is not defined") ||
    s.includes("cannot read properties") ||
    s.includes("undefined (reading") ||
    s.includes("plugin-sql")
  );
}

/** 内存/本地存储版的一次作答 */
function saveAttemptToMemory(a: AttemptInput) {
  const s = readMemory();
  s.attempts.push({
    question_id: a.questionId,
    chosen: a.chosen,
    is_correct: a.isCorrect ? 1 : 0,
    duration_ms: a.durationMs,
    mode: a.mode,
    created_at: new Date().toISOString(),
  });
  if (!a.isCorrect) {
    const w = s.wrong[a.questionId];
    if (w) {
      w.wrong_count += 1;
      w.mastered = 0;
    } else
      s.wrong[a.questionId] = {
        question_id: a.questionId,
        wrong_count: 1,
        mastered: 0,
      };
  } else if (s.wrong[a.questionId]) {
    // 重做答对 → 移出待攻克（记录保留，错题本可切到「已掌握」查看）
    s.wrong[a.questionId].mastered = 1;
  }
  writeMemory(s);
}

/** SQLite 版的一次作答：三张表 */
async function saveAttemptToSql(a: AttemptInput): Promise<void> {
  await run(
    `INSERT INTO attempts (question_id, chosen, is_correct, duration_ms, mode)
     VALUES (?, ?, ?, ?, ?)`,
    [a.questionId, a.chosen, a.isCorrect ? 1 : 0, a.durationMs, a.mode]
  );
  await run(
    `INSERT INTO daily_stats (date, attempted, correct, duration_ms)
     VALUES (date('now','localtime'), 1, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       attempted = attempted + 1,
       correct = correct + excluded.correct,
       duration_ms = duration_ms + excluded.duration_ms`,
    [a.isCorrect ? 1 : 0, a.durationMs]
  );
  if (!a.isCorrect) {
    await run(
      `INSERT INTO wrong_book (question_id, wrong_count, mastered, last_wrong_at)
       VALUES (?, 1, 0, datetime('now','localtime'))
       ON CONFLICT(question_id) DO UPDATE SET
         wrong_count = wrong_count + 1,
         mastered = 0,
         last_wrong_at = datetime('now','localtime')`,
      [a.questionId]
    );
  } else {
    // 重做答对 → 标记已掌握（只更新已存在的错题行，不影响没错过的新题）
    await run(
      `UPDATE wrong_book SET mastered = 1 WHERE question_id = ? AND mastered = 0`,
      [a.questionId]
    );
  }
}

export interface AttemptInput {
  questionId: string;
  chosen: string;
  isCorrect: boolean;
  durationMs: number;
  mode: string;
}

/**
 * 记录一次作答：写 attempts、累加每日统计、答错自动进错题本。
 * 三条写操作互不阻塞失败，任一步失败不影响其余（练习不被打断）。
 */
export async function recordAttempt(a: AttemptInput): Promise<void> {
  await ready();
  if (memoryMode) {
    saveAttemptToMemory(a);
    return;
  }
  try {
    await saveAttemptToSql(a);
  } catch (e) {
    // 第一次真正写入才发现没有 Tauri：降级后补一次，保证不丢这次作答
    if (!isTauriMissing(e)) throw e;
    memoryMode = true;
    console.warn("[records] SQLite 不可用，降级到 localStorage：", e);
    saveAttemptToMemory(a);
  }
}

/** 今日做题数与正确数 */
export async function todayStats(): Promise<{ attempted: number; correct: number }> {
  await ready();
  if (memoryMode) {
    const s = readMemory();
    const today = new Date().toISOString().slice(0, 10);
    const rows = s.attempts.filter((r) =>
      String(r.created_at ?? "").slice(0, 10) === today
    );
    return {
      attempted: rows.length,
      correct: rows.filter((r) => Number(r.is_correct) === 1).length,
    };
  }
  const rows = await select<{ attempted: number; correct: number }>(
    `SELECT attempted, correct FROM daily_stats WHERE date = date('now','localtime')`
  );
  return { attempted: Number(rows[0]?.attempted ?? 0), correct: Number(rows[0]?.correct ?? 0) };
}

/** 各模块已做题量（按 question_id 前缀聚合） */
export async function moduleProgress(): Promise<Record<string, number>> {
  await ready();
  const out: Record<string, number> = { shuliang: 0, panduan: 0, yanyu: 0, ziliao: 0 };
  if (memoryMode) {
    const s = readMemory();
    const seen = new Set<string>();
    for (const r of s.attempts) {
      const id = String(r.question_id);
      if (seen.has(id)) continue;
      seen.add(id);
      const k = id.split("-")[0];
      if (k in out) out[k] += 1;
    }
    return out;
  }
  const rows = await select<{ qid: string }>(
    `SELECT DISTINCT question_id AS qid FROM attempts`
  );
  for (const r of rows) {
    const k = String(r.qid).split("-")[0];
    if (k in out) out[k] += 1;
  }
  return out;
}

/** 某题的历史作答情况（做过的次数、最近一次是否正确） */
export async function historyOf(questionId: string): Promise<{
  count: number;
  lastCorrect: boolean | null;
}> {
  await ready();
  if (memoryMode) {
    const s = readMemory();
    const rows = s.attempts.filter((r) => String(r.question_id) === questionId);
    if (!rows.length) return { count: 0, lastCorrect: null };
    const last = rows[rows.length - 1];
    return { count: rows.length, lastCorrect: Number(last.is_correct) === 1 };
  }
  const [total, last] = await Promise.all([
    select<{ c: number }>(`SELECT COUNT(*) AS c FROM attempts WHERE question_id = ?`, [
      questionId,
    ]),
    select<{ ok: number }>(
      `SELECT is_correct AS ok FROM attempts WHERE question_id = ? ORDER BY id DESC LIMIT 1`,
      [questionId]
    ),
  ]);
  const count = Number(total[0]?.c ?? 0);
  return { count, lastCorrect: count ? Number(last[0]?.ok ?? 0) === 1 : null };
}

export async function isFavorite(questionId: string): Promise<boolean> {
  await ready();
  if (memoryMode) return !!readMemory().favorites[questionId];
  const rows = await select<{ c: number }>(
    `SELECT COUNT(*) AS c FROM favorites WHERE question_id = ?`,
    [questionId]
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

export async function toggleFavorite(questionId: string): Promise<boolean> {
  await ready();
  if (memoryMode) {
    const s = readMemory();
    if (s.favorites[questionId]) delete s.favorites[questionId];
    else s.favorites[questionId] = new Date().toISOString();
    writeMemory(s);
    return !!s.favorites[questionId];
  }
  const on = await isFavorite(questionId);
  if (on) {
    await run(`DELETE FROM favorites WHERE question_id = ?`, [questionId]);
    return false;
  }
  await run(
    `INSERT INTO favorites (question_id, created_at) VALUES (?, datetime('now','localtime'))`,
    [questionId]
  );
  return true;
}

export async function wrongIds(): Promise<string[]> {
  await ready();
  if (memoryMode) return Object.keys(readMemory().wrong);
  const rows = await select<{ question_id: string }>(
    `SELECT question_id FROM wrong_book ORDER BY last_wrong_at DESC`
  );
  return rows.map((r) => String(r.question_id));
}

export interface WrongRow {
  question_id: string;
  wrong_count: number;
  mastered: number;
  last_wrong_at: string | null;
}

/** 错题本明细（已掌握的可选包含） */
export async function listWrong(includeMastered = false): Promise<WrongRow[]> {
  await ready();
  if (memoryMode) {
    const s = readMemory();
    return Object.values(s.wrong)
      .filter((w) => includeMastered || !w.mastered)
      .map((w) => ({
        question_id: w.question_id,
        wrong_count: w.wrong_count,
        mastered: w.mastered,
        last_wrong_at: null,
      }))
      .sort((a, b) => b.wrong_count - a.wrong_count);
  }
  const sql = includeMastered
    ? `SELECT question_id, wrong_count, mastered, last_wrong_at FROM wrong_book ORDER BY mastered ASC, last_wrong_at DESC`
    : `SELECT question_id, wrong_count, mastered, last_wrong_at FROM wrong_book WHERE mastered = 0 ORDER BY last_wrong_at DESC`;
  return select<WrongRow>(sql);
}

/** 从错题本移除（彻底删除记录） */
export async function removeWrong(questionId: string): Promise<void> {
  await ready();
  if (memoryMode) {
    const s = readMemory();
    delete s.wrong[questionId];
    writeMemory(s);
    return;
  }
  await run(`DELETE FROM wrong_book WHERE question_id = ?`, [questionId]);
}

/** 标记/取消「已掌握」（保留记录，仅从待攻克列表隐藏） */
export async function setMastered(questionId: string, mastered: boolean): Promise<void> {
  await ready();
  if (memoryMode) {
    const s = readMemory();
    if (s.wrong[questionId]) s.wrong[questionId].mastered = mastered ? 1 : 0;
    writeMemory(s);
    return;
  }
  await run(`UPDATE wrong_book SET mastered = ? WHERE question_id = ?`, [
    mastered ? 1 : 0,
    questionId,
  ]);
}

/* ---------------------------------- 统计 ---------------------------------- */

export interface Overview {
  total: number;
  correct: number;
  accuracy: number;
  durationMs: number;
  wrongPending: number;
  favorites: number;
  streak: number; // 连续打卡天数
}

export interface DayStat {
  date: string;
  attempted: number;
  correct: number;
}

export interface GroupStat {
  key: string;
  attempted: number;
  correct: number;
  accuracy: number;
}

function pct(c: number, t: number): number {
  return t ? Math.round((c / t) * 100) : 0;
}

export async function overview(): Promise<Overview> {
  const [agg, wrong, fav, streak] = await Promise.all([
    (async () => {
      if (memoryMode) {
        const s = readMemory();
        const total = s.attempts.length;
        const correct = s.attempts.filter((r) => Number(r.is_correct) === 1).length;
        const ms = s.attempts.reduce((a, r) => a + Number(r.duration_ms ?? 0), 0);
        return { total, correct, ms };
      }
      const rows = await select<{ total: number; correct: number; ms: number }>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(is_correct),0) AS correct,
                COALESCE(SUM(duration_ms),0) AS ms FROM attempts`
      );
      const r = rows[0] ?? { total: 0, correct: 0, ms: 0 };
      return { total: Number(r.total), correct: Number(r.correct), ms: Number(r.ms) };
    })(),
    listWrong(false),
    favoriteCount(),
    streakDays(),
  ]);

  return {
    total: agg.total,
    correct: agg.correct,
    accuracy: pct(agg.correct, agg.total),
    durationMs: agg.ms,
    wrongPending: wrong.length,
    favorites: fav,
    streak,
  };
}

/** 近 N 天每日做题量（按 daily_stats，缺天补 0） */
export async function dailyTrend(days = 14): Promise<DayStat[]> {
  await ready();
  const out: DayStat[] = [];
  const today = new Date();
  const map = new Map<string, DayStat>();

  if (memoryMode) {
    const s = readMemory();
    for (const r of s.attempts) {
      const d = String(r.created_at ?? "").slice(0, 10);
      if (!d) continue;
      const cur = map.get(d) ?? { date: d, attempted: 0, correct: 0 };
      cur.attempted += 1;
      cur.correct += Number(r.is_correct) === 1 ? 1 : 0;
      map.set(d, cur);
    }
  } else {
    const rows = await select<{ d: string; attempted: number; correct: number }>(
      `SELECT date(created_at) AS d, COUNT(*) AS attempted,
              COALESCE(SUM(is_correct),0) AS correct
       FROM attempts
       WHERE date(created_at) >= date('now','localtime',?)
       GROUP BY d`,
      [`-${Math.max(days - 1, 0)} days`]
    );
    for (const r of rows)
      map.set(r.d, { date: r.d, attempted: Number(r.attempted), correct: Number(r.correct) });
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    out.push(map.get(d) ?? { date: d, attempted: 0, correct: 0 });
  }
  return out;
}

/** 按模块聚合（question_id 前缀即模块 key） */
export async function moduleBreakdown(): Promise<GroupStat[]> {
  const rows = await attemptPairs();
  const map = new Map<string, { a: number; c: number }>();
  for (const r of rows) {
    const k = r.id.split("-")[0];
    const cur = map.get(k) ?? { a: 0, c: 0 };
    cur.a += 1;
    cur.c += r.ok ? 1 : 0;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      attempted: v.a,
      correct: v.c,
      accuracy: pct(v.c, v.a),
    }))
    .sort((a, b) => b.attempted - a.attempted);
}

/**
 * 按二级题型聚合。题型在题库 JSON 里，SQLite 里没有，
 * 所以把「题目 → 做对/做错次数」拉出来在内存 join。
 */
export async function subTypeBreakdown(
  subTypeOf: (id: string) => string | undefined
): Promise<GroupStat[]> {
  const rows = await attemptPairs();
  const map = new Map<string, { a: number; c: number }>();
  for (const r of rows) {
    const k = subTypeOf(r.id) ?? "其他";
    const cur = map.get(k) ?? { a: 0, c: 0 };
    cur.a += 1;
    cur.c += r.ok ? 1 : 0;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      attempted: v.a,
      correct: v.c,
      accuracy: pct(v.c, v.a),
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempted - a.attempted);
}

interface Pair {
  id: string;
  ok: boolean;
}

async function attemptPairs(): Promise<Pair[]> {
  await ready();
  if (memoryMode) {
    return readMemory().attempts.map((r) => ({
      id: String(r.question_id),
      ok: Number(r.is_correct) === 1,
    }));
  }
  const rows = await select<{ question_id: string; is_correct: number }>(
    `SELECT question_id, is_correct FROM attempts`
  );
  return rows.map((r) => ({ id: String(r.question_id), ok: Number(r.is_correct) === 1 }));
}

async function favoriteCount(): Promise<number> {
  await ready();
  if (memoryMode) return Object.keys(readMemory().favorites).length;
  const rows = await select<{ c: number }>(`SELECT COUNT(*) AS c FROM favorites`);
  return Number(rows[0]?.c ?? 0);
}

/** 连续打卡天数（今天没做题则从昨天往前算） */
async function streakDays(): Promise<number> {
  await ready();
  const days = new Set<string>();
  if (memoryMode) {
    for (const r of readMemory().attempts) {
      const d = String(r.created_at ?? "").slice(0, 10);
      if (d) days.add(d);
    }
  } else {
    const rows = await select<{ d: string }>(
      `SELECT DISTINCT date(created_at) AS d FROM attempts ORDER BY d DESC LIMIT 400`
    );
    for (const r of rows) days.add(r.d);
  }
  if (!days.size) return 0;

  let streak = 0;
  const cursor = new Date();
  // 今天没做题时不算断签，从昨天起算
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function favoriteIds(): Promise<string[]> {
  await ready();
  if (memoryMode) return Object.keys(readMemory().favorites);
  const rows = await select<{ question_id: string }>(
    `SELECT question_id FROM favorites ORDER BY created_at DESC`
  );
  return rows.map((r) => String(r.question_id));
}

/* ------------------------------- 备份与恢复 ------------------------------- */

export interface BackupPayload {
  version: number;
  exportedAt: string;
  attempts: Record<string, unknown>[];
  wrong_book: Record<string, unknown>[];
  favorites: Record<string, unknown>[];
  daily_stats: Record<string, unknown>[];
}

export async function exportData(): Promise<BackupPayload> {
  await ready();
  const dump = async (table: string): Promise<Record<string, unknown>[]> => {
    if (memoryMode) {
      const s = readMemory();
      if (table === "attempts") return s.attempts;
      if (table === "wrong_book") return Object.values(s.wrong);
      if (table === "favorites")
        return Object.entries(s.favorites).map(([question_id, created_at]) => ({
          question_id,
          created_at,
        }));
      return [];
    }
    return select<Record<string, unknown>>(`SELECT * FROM ${table}`);
  };
  const [attempts, wrong_book, favorites, daily_stats] = await Promise.all([
    dump("attempts"),
    dump("wrong_book"),
    dump("favorites"),
    dump("daily_stats"),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    attempts,
    wrong_book,
    favorites,
    daily_stats,
  };
}

export interface ImportResult {
  attempts: number;
  wrong: number;
  favorites: number;
}

/**
 * 导入备份：按主键 upsert，同 id 的 attempts 以自增 id 为准去重。
 * 返回各表实际写入条数。
 */
export async function importData(payload: BackupPayload): Promise<ImportResult> {
  await ready();
  const attempts = Array.isArray(payload?.attempts) ? payload.attempts : [];
  const wrong = Array.isArray(payload?.wrong_book) ? payload.wrong_book : [];
  const favs = Array.isArray(payload?.favorites) ? payload.favorites : [];

  if (memoryMode) {
    const s = readMemory();
    const seen = new Set(s.attempts.map((r) => `${r.question_id}|${r.created_at}`));
    for (const r of attempts) {
      const k = `${r.question_id}|${r.created_at}`;
      if (seen.has(k)) continue;
      seen.add(k);
      s.attempts.push(r);
    }
    for (const w of wrong) {
      const id = String(w.question_id);
      const old = s.wrong[id];
      s.wrong[id] = {
        question_id: id,
        wrong_count: Math.max(Number(w.wrong_count ?? 1), old?.wrong_count ?? 0),
        mastered: Number(w.mastered ?? 0) ? 1 : old?.mastered ?? 0,
      };
    }
    for (const f of favs) s.favorites[String(f.question_id)] = String(f.created_at ?? "");
    writeMemory(s);
    return { attempts: attempts.length, wrong: wrong.length, favorites: favs.length };
  }

  // 去重键：同一题 + 同一时刻 + 同一选择视为同一条，重复导入不产生副本
  const existing = new Set(
    (await select<{ question_id: string; created_at: string; chosen: string }>(
      `SELECT question_id, created_at, chosen FROM attempts`
    )).map((r) => `${r.question_id}|${r.created_at}|${r.chosen}`)
  );
  let nAttempts = 0;
  for (const r of attempts) {
    const key = `${r.question_id}|${r.created_at}|${r.chosen}`;
    if (existing.has(key)) continue;
    existing.add(key);
    await run(
      `INSERT INTO attempts (question_id, chosen, is_correct, duration_ms, mode, created_at)
       VALUES (?,?,?,?,?,?)`,
      [
        r.question_id,
        r.chosen,
        Number(r.is_correct ?? 0),
        Number(r.duration_ms ?? 0),
        r.mode ?? "practice",
        r.created_at ?? null,
      ]
    );
    nAttempts += 1;
  }
  for (const w of wrong) {
    await run(
      `INSERT INTO wrong_book (question_id, wrong_count, mastered, last_wrong_at)
       VALUES (?,?,?,?)
       ON CONFLICT(question_id) DO UPDATE SET
         wrong_count = MAX(wrong_book.wrong_count, excluded.wrong_count),
         mastered = excluded.mastered,
         last_wrong_at = COALESCE(excluded.last_wrong_at, wrong_book.last_wrong_at)`,
      [
        w.question_id,
        Number(w.wrong_count ?? 1),
        Number(w.mastered ?? 0),
        w.last_wrong_at ?? null,
      ]
    );
  }
  for (const f of favs) {
    await run(
      `INSERT INTO favorites (question_id, created_at) VALUES (?,?)
       ON CONFLICT(question_id) DO NOTHING`,
      [f.question_id, f.created_at ?? null]
    );
  }
  await rebuildDailyStats();
  return { attempts: nAttempts, wrong: wrong.length, favorites: favs.length };
}

/** 导入后按 attempts 重算 daily_stats，避免历史日期统计对不上 */
async function rebuildDailyStats(): Promise<void> {
  if (memoryMode) return;
  await run(`DELETE FROM daily_stats`);
  await run(
    `INSERT INTO daily_stats (date, attempted, correct, duration_ms)
     SELECT date(created_at) AS d, COUNT(*), COALESCE(SUM(is_correct),0),
            COALESCE(SUM(duration_ms),0)
     FROM attempts GROUP BY d`
  );
}

/** 清空全部用户数据 */
export async function clearAllData(): Promise<void> {
  await ready();
  if (memoryMode) {
    writeMemory(emptyMemory());
    return;
  }
  for (const t of ["attempts", "wrong_book", "favorites", "daily_stats", "ai_explanations"]) {
    await run(`DELETE FROM ${t}`);
  }
}

export interface CachedAiExplanation {
  question_id: string;
  model: string;
  content: string;
  created_at?: string;
}

/** 读取题目的 AI 解析缓存 */
export async function getAiExplanation(
  questionId: string
): Promise<CachedAiExplanation | null> {
  await ready();
  if (memoryMode) {
    const s = readMemory();
    return s.ai_explanations?.[questionId] ?? null;
  }
  const rows = await query<CachedAiExplanation>(
    `SELECT question_id, model, content, created_at FROM ai_explanations WHERE question_id = ? LIMIT 1`,
    [questionId]
  );
  return rows[0] ?? null;
}

/** 保存或更新题目的 AI 解析缓存 */
export async function saveAiExplanation(
  questionId: string,
  model: string,
  content: string
): Promise<void> {
  await ready();
  if (memoryMode) {
    const s = readMemory();
    if (!s.ai_explanations) s.ai_explanations = {};
    s.ai_explanations[questionId] = {
      question_id: questionId,
      model,
      content,
      created_at: new Date().toISOString(),
    };
    writeMemory(s);
    return;
  }
  await run(
    `INSERT INTO ai_explanations (question_id, model, content, created_at)
     VALUES (?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(question_id) DO UPDATE SET
       model = excluded.model,
       content = excluded.content,
       created_at = excluded.created_at`,
    [questionId, model, content]
  );
}

export function usingFallback(): boolean {
  return memoryMode;
}

/**
 * 错题本 / 统计 / 备份恢复 冒烟测试（M3）。
 *
 * 无 Tauri 环境，records 走 localStorage 降级路径；
 * 语义与 SQLite 分支保持一致（同样的落库/统计/导入导出逻辑）。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import Vant from "vant";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  clearAllData,
  exportData,
  importData,
  listWrong,
  overview,
  dailyTrend,
  moduleBreakdown,
  subTypeBreakdown,
  removeWrong,
  setMastered,
} from "../src/db/records";
import { usePracticeStore } from "../src/stores/practice";
import WrongBookView from "../src/views/WrongBookView.vue";
import StatsView from "../src/views/StatsView.vue";
import { loadBank } from "../src/data/bank";

const BANK_PATH = path.resolve(__dirname, "../public/data/questions.json");

beforeAll(() => {
  const bank = JSON.parse(readFileSync(BANK_PATH, "utf-8"));
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => bank,
  })) as unknown as typeof fetch;
});

/** 新建一个会话用的 store；reset=true 时连本地记录一起清空 */
async function makeStore(reset = true) {
  if (reset) localStorage.clear();
  const pinia = createPinia();
  setActivePinia(pinia);
  return usePracticeStore(pinia);
}

describe("错题本", () => {
  beforeEach(() => localStorage.clear());

  it("答错进错题本，重做答对后自动转为已掌握", async () => {
    const ps = await makeStore();
    await ps.start({ module: "shuliang", mode: "practice", order: "seq", limit: 3 });

    // 第 1 题故意答错
    const q1 = ps.current!;
    const wrongKey = ["A", "B", "C", "D"].find((k) => k !== q1.answer)!;
    await ps.choose(wrongKey);
    await flushPromises();

    let rows = await listWrong(false);
    expect(rows.length).toBe(1);
    expect(rows[0].question_id).toBe(q1.id);
    expect(rows[0].wrong_count).toBe(1);

    // 重做答对（新会话，但保留已有错题记录）
    const ps2 = await makeStore(false);
    await ps2.startWithIds([q1.id], { title: "错题重做" });
    await ps2.choose(q1.answer);
    await flushPromises();

    rows = await listWrong(false);
    expect(rows.length).toBe(0); // 待攻克清空
    const all = await listWrong(true);
    expect(all.length).toBe(1);
    expect(all[0].mastered).toBe(1); // 记录保留、标记掌握
  });

  it("移除与手动标记掌握都生效", async () => {
    const ps = await makeStore();
    await ps.start({ module: "panduan", mode: "practice", order: "seq", limit: 2 });
    const q1 = ps.current!;
    await ps.choose(["A", "B", "C", "D"].find((k) => k !== q1.answer)!);
    await flushPromises();

    await setMastered(q1.id, true);
    expect((await listWrong(false)).length).toBe(0);
    await setMastered(q1.id, false);
    expect((await listWrong(false)).length).toBe(1);

    await removeWrong(q1.id);
    expect((await listWrong(true)).length).toBe(0);
  });

  it("错题页能渲染题干摘要并可一键重做", async () => {
    const ps = await makeStore();
    await ps.start({ module: "ziliao", mode: "practice", order: "seq", limit: 2 });
    const q1 = ps.current!;
    await ps.choose(["A", "B", "C", "D"].find((k) => k !== q1.answer)!);
    await flushPromises();

    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/wrong", component: WrongBookView },
        { path: "/practice/session", component: { template: "<div>session</div>" } },
      ],
    });
    await router.push("/wrong");
    await router.isReady();
    const wrapper = mount(WrongBookView, { global: { plugins: [pinia, router, Vant] } });
    await flushPromises();

    expect(wrapper.text()).toContain("待攻克");
    expect(wrapper.text()).toContain("错 1 次");

    // 点条目进入重做会话
    await wrapper.find(".item").trigger("click");
    await flushPromises();
    const ps2 = usePracticeStore(pinia);
    expect(ps2.total).toBe(1);
    expect(ps2.current?.id).toBe(q1.id);
    expect(router.currentRoute.value.path).toBe("/practice/session");
    wrapper.unmount();
  });
});

describe("统计", () => {
  beforeEach(() => localStorage.clear());

  it("总览数字与按模块/题型聚合正确", async () => {
    const ps = await makeStore();
    await ps.start({ module: "shuliang", mode: "practice", order: "seq", limit: 4 });
    // 前两题答对、后两题答错
    for (let i = 0; i < 4; i++) {
      const q = ps.current!;
      const key = i < 2 ? q.answer : ["A", "B", "C", "D"].find((k) => k !== q.answer)!;
      await ps.choose(key);
      await flushPromises();
      if (i < 3) ps.next();
    }

    const ov = await overview();
    expect(ov.total).toBe(4);
    expect(ov.correct).toBe(2);
    expect(ov.accuracy).toBe(50);
    expect(ov.wrongPending).toBe(2);

    const mods = await moduleBreakdown();
    expect(mods.length).toBe(1);
    expect(mods[0].key).toBe("shuliang");
    expect(mods[0].attempted).toBe(4);
    expect(mods[0].accuracy).toBe(50);

    const bank = await loadBank();
    const map = new Map(bank.questions.map((q) => [q.id, q.subType]));
    const subs = await subTypeBreakdown((id) => map.get(id));
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.reduce((a, s) => a + s.attempted, 0)).toBe(4);
  });

  it("近 14 天趋势返回 14 天且今日有数据", async () => {
    const ps = await makeStore();
    await ps.start({ module: "yanyu", mode: "practice", order: "seq", limit: 1 });
    await ps.choose(ps.current!.answer);
    await flushPromises();

    const t = await dailyTrend(14);
    expect(t.length).toBe(14);
    expect(t[t.length - 1].attempted).toBe(1);
  });

  it("统计页可渲染总览与图表", async () => {
    const ps = await makeStore();
    await ps.start({ module: "panduan", mode: "practice", order: "seq", limit: 2 });
    await ps.choose(ps.current!.answer);
    await flushPromises();

    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/stats", component: StatsView }],
    });
    await router.push("/stats");
    await router.isReady();
    const wrapper = mount(StatsView, { global: { plugins: [pinia, router, Vant] } });
    await flushPromises();

    expect(wrapper.text()).toContain("总览");
    expect(wrapper.text()).toContain("100%");
    expect(wrapper.find("svg.chart").exists()).toBe(true);
    wrapper.unmount();
  });
});

describe("备份与恢复", () => {
  beforeEach(() => localStorage.clear());

  it("导出 → 清空 → 导入，记录与错题都回来", async () => {
    const ps = await makeStore();
    await ps.start({ module: "shuliang", mode: "practice", order: "seq", limit: 3 });
    const q1 = ps.current!;
    await ps.choose(["A", "B", "C", "D"].find((k) => k !== q1.answer)!);
    await flushPromises();

    const backup = await exportData();
    expect(backup.attempts.length).toBe(1);
    expect(backup.wrong_book.length).toBe(1);

    await clearAllData();
    expect((await listWrong(true)).length).toBe(0);
    expect((await overview()).total).toBe(0);

    const r = await importData(backup);
    expect(r.attempts).toBe(1);
    expect(r.wrong).toBe(1);

    expect((await overview()).total).toBe(1);
    const rows = await listWrong(false);
    expect(rows.length).toBe(1);
    expect(rows[0].question_id).toBe(q1.id);
  });

  it("重复导入同一份备份不产生重复记录", async () => {
    const ps = await makeStore();
    await ps.start({ module: "shuliang", mode: "practice", order: "seq", limit: 2 });
    await ps.choose(ps.current!.answer);
    await flushPromises();

    const backup = await exportData();
    await importData(backup);
    await importData(backup);
    expect((await overview()).total).toBe(1);
  });
});

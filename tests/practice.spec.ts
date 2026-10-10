/**
 * 刷题核心链路冒烟测试（M2）。
 *
 * 覆盖：题库加载 → 建会话 → 渲染 → 作答判分 → 解析 → 切题 → 自动记错。
 * 这里没有 Tauri 环境，records 层会降级到 localStorage，正好也验证降级路径。
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import Vant from "vant";
import { readFileSync } from "node:fs";
import path from "node:path";

import SessionView from "../src/views/SessionView.vue";
import PracticeView from "../src/views/PracticeView.vue";
import { usePracticeStore } from "../src/stores/practice";

const BANK_PATH = path.resolve(__dirname, "../public/data/questions.json");

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/practice", component: PracticeView },
      { path: "/practice/session", component: SessionView },
    ],
  });
}

async function mountSession(router: ReturnType<typeof makeRouter>, pinia: ReturnType<typeof createPinia>) {
  await router.push("/practice/session");
  await router.isReady();
  return mount(SessionView, { global: { plugins: [pinia, router, Vant] } });
}

describe("题库与刷题会话", () => {
  beforeAll(() => {
    const bank = JSON.parse(readFileSync(BANK_PATH, "utf-8"));
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => bank,
    })) as unknown as typeof fetch;
    localStorage.clear();
  });

  it("题库可加载且题量正确", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ps = usePracticeStore(pinia);
    const bank = await ps.ensureBank();
    expect(bank.questions.length).toBe(500);
    expect(Object.keys(bank.materials).length).toBeGreaterThan(0);
  });

  it("按模块建会话，队列与题号正确", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ps = usePracticeStore(pinia);
    await ps.start({ module: "shuliang", mode: "practice", order: "seq", limit: 10 });
    expect(ps.total).toBe(10);
    expect(ps.queue.every((q) => q.module === "shuliang")).toBe(true);
    expect(ps.queue.map((q) => q.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("渲染做题页，题干与四个选项都在", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ps = usePracticeStore(pinia);
    await ps.start({ module: "shuliang", mode: "practice", order: "seq", limit: 5 });
    const router = makeRouter();
    const wrapper = await mountSession(router, pinia);
    await flushPromises();

    expect(wrapper.text()).toContain("1 / 5");
    // 四个选项键 A-D
    const keys = wrapper.findAll(".opt-key").map((n) => n.text());
    expect(keys).toEqual(["A", "B", "C", "D"]);
    wrapper.unmount();
  });

  it("作答后判分、展开解析、可切下一题", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ps = usePracticeStore(pinia);
    await ps.start({ module: "shuliang", mode: "practice", order: "seq", limit: 5 });
    const router = makeRouter();
    const wrapper = await mountSession(router, pinia);
    await flushPromises();

    const correctKey = ps.current!.answer;
    const idx = ["A", "B", "C", "D"].indexOf(correctKey);
    await wrapper.findAll(".opt")[idx].trigger("click");
    await flushPromises();

    expect(ps.currentAnswer?.isCorrect).toBe(true);
    expect(wrapper.text()).toContain("回答正确");
    expect(wrapper.text()).toContain("解析");

    // 切下一题
    const nextBtn = wrapper.findAll("button").find((b) => b.text() === "下一题");
    expect(nextBtn).toBeTruthy();
    await nextBtn!.trigger("click");
    await flushPromises();
    expect(ps.index).toBe(1);
    wrapper.unmount();
  });

  it("答错自动记错并落库（SQLite 不可用时降级 localStorage）", async () => {
    localStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const ps = usePracticeStore(pinia);
    await ps.start({ module: "shuliang", mode: "practice", order: "seq", limit: 3 });
    const router = makeRouter();
    const wrapper = await mountSession(router, pinia);
    await flushPromises();

    const wrongIdx = ["A", "B", "C", "D"].findIndex((k) => k !== ps.current!.answer);
    await wrapper.findAll(".opt")[wrongIdx].trigger("click");
    await flushPromises();

    expect(ps.currentAnswer?.isCorrect).toBe(false);
    expect(wrapper.text()).toContain("回答错误");

    // 等记录写入（异步落库）
    await flushPromises();
    const saved = localStorage.getItem("whatexam.records");
    expect(saved).toBeTruthy();
    const state = JSON.parse(saved!);
    expect(state.attempts.length).toBeGreaterThan(0);
    expect(Object.keys(state.wrong).length).toBe(1);
    wrapper.unmount();
  });

  it("资料分析题渲染材料区（含图片）", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ps = usePracticeStore(pinia);
    await ps.start({ module: "ziliao", mode: "practice", order: "seq", limit: 1 });
    const router = makeRouter();
    const wrapper = await mountSession(router, pinia);
    await flushPromises();

    expect(wrapper.text()).toContain("材料");
    expect(ps.currentMaterial).toBeTruthy();
    // 材料区至少渲染出若干段落或一个材料图
    const hasBody =
      wrapper.findAll(".mat-p").length > 0 || wrapper.findAll(".mat-img").length > 0;
    expect(hasBody).toBe(true);
    wrapper.unmount();
  });

  it("图形选项题渲染合图与 A-D 点选按钮", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ps = usePracticeStore(pinia);
    await ps.start({ module: "panduan", mode: "practice", order: "seq" });
    const router = makeRouter();
    const graphic = ps.queue.find((q) => q.optionImage)!;
    expect(graphic).toBeTruthy();
    ps.jumpTo(ps.queue.indexOf(graphic));
    const wrapper = await mountSession(router, pinia);
    await flushPromises();

    expect(wrapper.find(".opt-image").exists()).toBe(true);
    expect(wrapper.findAll(".gkey").map((n) => n.text())).toEqual(["A", "B", "C", "D"]);
    wrapper.unmount();
  });
});

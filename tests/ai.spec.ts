import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAiModels, generateAiExplanation } from "../src/api/ai";
import { getAiExplanation, saveAiExplanation } from "../src/db/records";
import { parseAiDualViews, parseAiSections } from "../src/utils/aiFormat";
import type { Question } from "../src/data/bank";

describe("AI API 与缓存模块", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("fetchAiModels: 缺少 API Key 时抛出异常", async () => {
    await expect(fetchAiModels("https://api.minimax.chat/v1", "")).rejects.toThrow(
      "请先填写 API Key"
    );
  });

  it("fetchAiModels: 成功拉取模型列表并去重排序", async () => {
    const mockResponse = {
      data: [{ id: "MiniMax-Text-01" }, { id: "abab6.5s-chat" }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const models = await fetchAiModels("https://api.minimax.chat/v1", "test-key");
    expect(models).toEqual(["MiniMax-Text-01", "abab6.5s-chat"].sort());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.minimax.chat/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );
  });

  it("generateAiExplanation: 校验未配置模型或 Key", async () => {
    const fakeQ: Question = {
      id: "shuliang-001",
      module: "shuliang",
      no: 1,
      subType: "数字推理",
      stem: "1, 2, 4, 8, ()",
      stemImages: [],
      optionImage: null,
      graphicOptions: false,
      options: [
        { key: "A", text: "16", image: null },
        { key: "B", text: "32", image: null },
      ],
      answer: "A",
      explanation: "公比为2的等比数列",
      materialId: null,
      srcPage: 10,
    };

    await expect(
      generateAiExplanation({
        baseUrl: "https://api.minimax.chat/v1",
        apiKey: "",
        model: "MiniMax-Text-01",
        question: fakeQ,
      })
    ).rejects.toThrow("未配置 API Key");

    await expect(
      generateAiExplanation({
        baseUrl: "https://api.minimax.chat/v1",
        apiKey: "some-key",
        model: "",
        question: fakeQ,
      })
    ).rejects.toThrow("未配置 AI 模型");
  });

  it("generateAiExplanation: 成功生成 AI 解析", async () => {
    const fakeQ: Question = {
      id: "shuliang-001",
      module: "shuliang",
      no: 1,
      subType: "数字推理",
      stem: "1, 2, 4, 8, ()",
      stemImages: [],
      optionImage: null,
      graphicOptions: false,
      options: [
        { key: "A", text: "16", image: null },
        { key: "B", text: "32", image: null },
      ],
      answer: "A",
      explanation: "等比数列",
      materialId: null,
      srcPage: 10,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "本题考查等比数列，公比为2，下一项为16。" } }],
      }),
    } as unknown as Response);

    const result = await generateAiExplanation({
      baseUrl: "https://api.minimax.chat/v1",
      apiKey: "some-key",
      model: "MiniMax-Text-01",
      question: fakeQ,
      chosen: "B",
    });

    expect(result).toContain("等比数列");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.minimax.chat/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("getAiExplanation & saveAiExplanation 缓存读写与独立类型隔离", async () => {
    const cachedBefore = await getAiExplanation("shuliang-001");
    expect(cachedBefore).toBeNull();

    await saveAiExplanation("shuliang-001", "MiniMax-Text-01", "这是标准教研解析", "standard");
    await saveAiExplanation("shuliang-001", "MiniMax-Text-01", "这是30秒极速秒杀", "speed");

    const stdCached = await getAiExplanation("shuliang-001", "standard");
    const spdCached = await getAiExplanation("shuliang-001", "speed");

    expect(stdCached?.content).toBe("这是标准教研解析");
    expect(spdCached?.content).toBe("这是30秒极速秒杀");
  });

  it("parseAiSections: 成功解析公考结构化卡片与 LaTeX 公式", () => {
    const raw = `一、【考点定位】
本题考查的是**数量关系**。

二、【解题思路】
1. **先两两分组：**
\\[
16\\div4=4
\\]
\\[
31\\div22=\\frac{31}{22}\\approx1.409
\\]

三、【选项辨析】
- **A项31：** 排除。
- **C项22：** 正确答案。

四、【名师点拨】
速记口诀：先分组，后求商。`;

    const sections = parseAiSections(raw);
    expect(sections).toHaveLength(4);
    expect(sections[0].type).toBe("point");
    expect(sections[0].title).toBe("考点定位");
    expect(sections[0].html).toContain("<strong>数量关系</strong>");

    expect(sections[1].type).toBe("steps");
    expect(sections[1].html).toContain("÷");
    expect(sections[1].html).toContain("≈");
    expect(sections[1].html).toContain("ai-frac");

    expect(sections[2].type).toBe("options");
    expect(sections[2].html).toContain("ai-opt-badge");

    expect(sections[3].type).toBe("tips");
    expect(sections[3].title).toBe("名师点拨");
  });

  it("formatLatexAndSymbols: 成功转换 aligned 多行等式与上标平方", () => {
    const raw = `\\[
\\begin{aligned}
102&=10^2+2\\\\
62&=8^2-2\\\\
38&=6^2+2\\\\
6&=2^2+2
\\end{aligned}
\\]`;
    const sections = parseAiSections(raw);
    expect(sections).toHaveLength(1);
    const html = sections[0].html;

    // 不包含未转义的 LaTeX 环境标签
    expect(html).not.toContain("begin{aligned}");
    expect(html).not.toContain("end{aligned}");
    expect(html).not.toContain("&=");

    // 包含换行和上标
    expect(html).toContain("<br/>");
    expect(html).toContain("102 = 10<sup>2</sup>+2");
    expect(html).toContain("62 = 8<sup>2</sup>-2");
    expect(html).toContain("ai-math-block");
  });

  it("formatLatexAndSymbols: 成功清理 \\ (反斜杠空格) 与数列标点转义", () => {
    const raw = `\\[
81,\\ 49,\\ 25,\\ 9,\\ 1
\\]`;
    const sections = parseAiSections(raw);
    expect(sections).toHaveLength(1);
    const html = sections[0].html;

    expect(html).not.toContain("\\");
    expect(html).toContain("81, 49, 25, 9, 1");
  });

  it("formatMarkdown: 成功将 Markdown 表格与 > 引用块转为富文本", () => {
    const raw = `将它们每两个分为一组，再分别求和：

| 项次 | 相邻质数 | 和 |
|---|---|---|
| 第1项 | 2＋3 | 5 |
| 第2项 | 5＋7 | 12 |

因此原数列可以写成：

> 5，12，24，**36**，52，68  
> ↓　↓　↓　↓　↓　↓  
> 2＋3，5＋7，11＋13，17＋19，23＋29，31＋37`;

    const sections = parseAiSections(raw);
    expect(sections).toHaveLength(1);
    const html = sections[0].html;

    expect(html).toContain("ai-table-wrap");
    expect(html).toContain("<th>项次</th>");
    expect(html).toContain("<td>2＋3</td>");
    // 自动升级为精准列对齐推导流
    expect(html).toContain("ai-mapping-flow");
    expect(html).toContain("map-col");
    expect(html).toContain("map-arrow");
    expect(html).toContain("<strong>36</strong>");
  });

  it("formatLatexAndSymbols: 成功解析 \\boxed{59} 为重点答案框", () => {
    const raw = `\\[
\\boxed{59}
\\]`;
    const sections = parseAiSections(raw);
    expect(sections).toHaveLength(1);
    const html = sections[0].html;

    expect(html).not.toContain("\\boxed");
    expect(html).toContain("ai-math-boxed");
    expect(html).toContain("59");
  });

  it("parseAiDualViews: 成功将全量解析拆分为教研精析与30秒极速秒杀双视图", () => {
    const raw = `一、【考点定位】
本题考查等差数列。

二、【解题思路】
详细计算过程略。

三、【选项辨析】
- **A项：** 错误。
- **B项：** 正确。

四、【名师点拨】
注意审题。

五、【30秒极速秒杀】
【秒杀心法】：观察尾数直接锁定。
【秒杀步骤】：只需看最后一位 3+6=9。
【秒杀口诀】：算尾不算头，秒杀不用愁。`;

    const dual = parseAiDualViews(raw);
    expect(dual.standard).toHaveLength(4);
    expect(dual.standard.map((s) => s.title)).toEqual(["考点定位", "解题思路", "选项辨析", "名师点拨"]);

    expect(dual.speed).toHaveLength(1);
    expect(dual.speed[0].title).toBe("30秒极速秒杀");
    expect(dual.speed[0].type).toBe("speed");
    expect(dual.speed[0].html).toContain("算尾不算头");
  });

  it("formatLatexAndSymbols: 成功将 \\overset{\\times 0.5}{\\longrightarrow} 转换为结构化步骤箭头", () => {
    const raw = `\\[4\\overset{\\times 0.5}{\\longrightarrow}2\\overset{\\times 0.5}{\\longrightarrow}1\\overset{\\times 0.5}{\\longrightarrow}0.5\\]`;
    const sections = parseAiSections(raw);
    expect(sections).toHaveLength(1);
    const html = sections[0].html;

    expect(html).not.toContain("\\overset");
    expect(html).not.toContain("\\longrightarrow");
    expect(html).toContain("ai-step-arrow");
    expect(html).toContain("4");
    expect(html).toContain("──[× 0.5]──→");
    expect(html).toContain("2");
    expect(html).toContain("1");
    expect(html).toContain("0.5");
  });
});

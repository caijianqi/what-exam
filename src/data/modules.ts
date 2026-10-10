import type { Bank, Question } from "./bank";

export interface ExamModule {
  key: string;
  name: string;
  /** 卡片/标签里的短名 */
  short: string;
  total: number;
  desc: string;
  /** 模块品牌色（用于卡片强调、进度条） */
  color: string;
}

/** 四大模块（题量与二级题型来自 pipeline 实际解析结果） */
export const MODULES: ExamModule[] = [
  {
    key: "shuliang",
    name: "数量关系",
    short: "数量",
    total: 120,
    desc: "数字推理 · 数学运算",
    color: "#2f7cf6",
  },
  {
    key: "panduan",
    name: "判断推理",
    short: "判断",
    total: 130,
    desc: "图形推理 · 定义判断 · 类比推理 · 逻辑判断",
    color: "#7a5cf0",
  },
  {
    key: "yanyu",
    name: "言语理解与表达",
    short: "言语",
    total: 130,
    desc: "逻辑填空 · 片段阅读 · 语句排序 · 篇章阅读",
    color: "#ff8f3f",
  },
  {
    key: "ziliao",
    name: "资料分析",
    short: "资料",
    total: 120,
    desc: "文字型 · 综合型（表格/图表）",
    color: "#16b3a3",
  },
];

export const TOTAL_QUESTIONS = MODULES.reduce((s, m) => s + m.total, 0);

export function moduleName(key: string): string {
  return MODULES.find((m) => m.key === key)?.name ?? key;
}

export function moduleColor(key: string): string {
  return MODULES.find((m) => m.key === key)?.color ?? "#2f7cf6";
}

/** 按模块分组题库（顺序与 MODULES 一致） */
export function groupByModule(bank: Bank): Record<string, Question[]> {
  const out: Record<string, Question[]> = {};
  for (const m of MODULES) out[m.key] = [];
  for (const q of bank.questions) (out[q.module] ??= []).push(q);
  return out;
}

/** 某模块下的二级题型及其题量 */
export function subTypesOf(bank: Bank, key: string): { name: string; count: number }[] {
  const counter = new Map<string, number>();
  for (const q of bank.questions) {
    if (q.module !== key) continue;
    counter.set(q.subType, (counter.get(q.subType) ?? 0) + 1);
  }
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

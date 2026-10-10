/**
 * 题库（只读资产）。
 *
 * 数据由 pipeline/emit.py 产出到 public/data/questions.json，
 * 图片在 public/img/{graph,material}/ 下，JSON 里存的是相对 public 根的路径。
 * 构建时 public/ 原样拷进 dist，运行时用 fetch + BASE_URL 拼 URL。
 */

export interface QuestionOption {
  key: string; // A / B / C / D
  text: string; // 图形选项时为空
  image: string | null;
}

export interface MaterialBlock {
  t: "text" | "img";
  v: string;
}

export interface Material {
  id: string;
  module: string;
  title: string; // 材料序号，如「一」「篇章1」
  content: MaterialBlock[];
}

export interface Question {
  id: string; // 例：shuliang-001
  module: string; // shuliang / panduan / yanyu / ziliao
  no: number; // 模块内题号
  subType: string; // 二级题型，例：数字推理 / 图形推理 / 篇章阅读
  stem: string; // 可能含 <sup>/<sub>，用 v-html 渲染
  stemImages: string[];
  /** 四个选项合成的一张图（分数/折线图/图形推理） */
  optionImage: string | null;
  /** 选项整体为图形，A/B/C/D 只能看图点选 */
  graphicOptions: boolean;
  options: QuestionOption[];
  answer: string;
  explanation: string;
  materialId: string | null;
  srcPage: number | null; // 原 PDF 页码，校对用
}

export interface Bank {
  version: number;
  source: string;
  modules: { key: string; name: string; total: number }[];
  materials: Record<string, Material>;
  questions: Question[];
}

const BASE = import.meta.env.BASE_URL || "/";

/** 把题库里的相对路径（如 img/graph/xxx.png）转成可访问 URL */
export function assetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return BASE + path.replace(/^\//, "");
}

let cache: Bank | null = null;
let pending: Promise<Bank> | null = null;

export function loadBank(): Promise<Bank> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch(assetUrl("data/questions.json"))
    .then((r) => {
      if (!r.ok) throw new Error("题库加载失败: " + r.status);
      return r.json() as Promise<Bank>;
    })
    .then((b) => {
      cache = b;
      pending = null;
      return b;
    });
  return pending;
}

export function getBank(): Bank | null {
  return cache;
}

/** 取某题所属材料 */
export function materialOf(bank: Bank, q: Question): Material | null {
  return q.materialId ? bank.materials[q.materialId] ?? null : null;
}

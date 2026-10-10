/**
 * 题干富文本清洗。
 *
 * 题库里的 stem 由 PDF 解析而来，只可能带 <sup>/<sub>/<br>/<b>/<i>，
 * 但来源是外部文件，渲染前统一做转义 + 白名单还原，避免 v-html 引入意外标签。
 */
const ALLOWED = ["sup", "sub", "b", "i", "strong", "em"];

export function richText(input: string): string {
  if (!input) return "";
  let s = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  for (const tag of ALLOWED) {
    s = s.replace(
      new RegExp(`&lt;(${tag})&gt;`, "gi"),
      (_, t: string) => `<${t.toLowerCase()}>`
    );
    s = s.replace(
      new RegExp(`&lt;(/${tag})&gt;`, "gi"),
      (_, t: string) => `<${t.toLowerCase()}>`
    );
  }
  s = s.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  return s;
}

/** 把换行转成 <br>，用于纯文本题干 */
export function nl2br(input: string): string {
  return (input ?? "").replace(/\n/g, "<br>");
}

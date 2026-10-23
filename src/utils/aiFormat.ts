/**
 * AI 解析文本美化与结构化渲染引擎
 * 针对公考行测题目解析中常见的 Markdown、LaTeX 数学公式与公考结构化卡片排版
 */

export interface AiSection {
  type: "point" | "steps" | "options" | "tips" | "speed" | "general";
  title: string;
  icon: string;
  html: string;
}

export interface DualAiViewSections {
  standard: AiSection[];
  speed: AiSection[];
}

/**
 * 转换 LaTeX 符号与数学表达式
 */
export function formatLatexAndSymbols(text: string): string {
  let s = text;

  // 1. 优先提取独立的 aligned / cases 等多行环境并包装为公式块
  s = s.replace(/\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}/g, (_, formula) => {
    return `<div class="ai-math-block">${cleanMath(formula)}</div>`;
  });
  s = s.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, formula) => {
    return `<div class="ai-math-block">${cleanMath(formula)}</div>`;
  });

  // 2. 块级公式 \[ ... \] 或 $$ ... $$
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, formula) => {
    return `<div class="ai-math-block">${cleanMath(formula)}</div>`;
  });
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
    return `<div class="ai-math-block">${cleanMath(formula)}</div>`;
  });

  // 3. 行内公式 \( ... \)
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, formula) => {
    return `<span class="ai-math-inline">${cleanMath(formula)}</span>`;
  });

  // 4. 处理正文中遗留的反斜杠符号或环境标签
  s = cleanMath(s);

  return s;
}

/** 清理并美化 LaTeX 符号为可读数学符号 */
function cleanMath(formula: string): string {
  let s = formula;

  // 剥除遗留的环境标签
  s = s.replace(/\\begin\{[a-zA-Z*]+\}(?:\{[^}]*\})?/g, "");
  s = s.replace(/\\end\{[a-zA-Z*]+\}/g, "");

  // 文本与重点标签
  s = s.replace(/\\boxed\{([\s\S]*?)\}/g, '<span class="ai-math-boxed">$1</span>');
  s = s.replace(/\\underline\{([\s\S]*?)\}/g, '<span class="ai-math-underline">$1</span>');
  s = s.replace(/\\bm\{([^}]+)\}|\\boldsymbol\{([^}]+)\}/g, "<strong>$1$2</strong>");
  s = s.replace(/\\(?:text|mathrm|mathbf|textbf|textit|mathit)\{([\s\S]*?)\}/g, "$1");
  s = s.replace(/\\left\s*([(\[{.|])/g, "$1");
  s = s.replace(/\\right\s*([)\]}.|])/g, "$1");

  // LaTeX 多行公式换行符 \\ 或 \\ [1ex] -> <br/>
  s = s.replace(/\\\\(?:\s*\[[\s\S]*?\])?/g, "<br/>");

  // 箭头与推导标注（支持 \overset、\stackrel、\underset、\xrightarrow 等推导箭头）
  s = s.replace(
    /\\(?:overset|stackrel)\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}/g,
    (_, above, base) => {
      const cleanAbove = cleanMath(above);
      const isLeft = /\\(?:longleftarrow|leftarrow|Leftarrow|Longleftarrow)|<-|←|⇐/i.test(base);
      const isRight = /\\(?:longrightarrow|rightarrow|to|Rightarrow|Longrightarrow)|->|→|⇒/i.test(base);
      if (isLeft) {
        return ` <span class="ai-step-arrow">←──[${cleanAbove}]──</span> `;
      }
      if (isRight) {
        return ` <span class="ai-step-arrow">──[${cleanAbove}]──→</span> `;
      }
      const cleanBase = cleanMath(base);
      return ` ${cleanBase}[${cleanAbove}] `;
    }
  );

  s = s.replace(
    /\\underset\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}/g,
    (_, below, base) => {
      const cleanBelow = cleanMath(below);
      const cleanBase = cleanMath(base);
      return ` ${cleanBase}[${cleanBelow}] `;
    }
  );

  s = s.replace(
    /\\xrightarrow(?:\s*\[([\s\S]*?)\])?\s*\{([\s\S]*?)\}/g,
    (_, below, above) => {
      const cleanAbove = cleanMath(above);
      const cleanBelow = below ? cleanMath(below) : "";
      const label = cleanBelow ? `${cleanAbove} / ${cleanBelow}` : cleanAbove;
      return ` <span class="ai-step-arrow">──[${label}]──→</span> `;
    }
  );

  // 对齐符号 &= 或 &
  s = s.replace(/&=/g, " = ");
  s = s.replace(/&/g, " ");

  // 独立箭头
  s = s.replace(/\\(?:longrightarrow|rightarrow|to)(?![a-zA-Z])/g, " → ");
  s = s.replace(/\\(?:longleftarrow|leftarrow)(?![a-zA-Z])/g, " ← ");
  s = s.replace(/\\(?:Longrightarrow|implies|Rightarrow)(?![a-zA-Z])/g, " ⇒ ");
  s = s.replace(/\\(?:Longleftarrow|Leftarrow)(?![a-zA-Z])/g, " ⇐ ");
  s = s.replace(/\\(?:iff|Longleftrightarrow|Leftrightarrow)(?![a-zA-Z])/g, " ⇔ ");

  // 关系符与运算符
  s = s.replace(/\\div(?![a-zA-Z])/g, " ÷ ");
  s = s.replace(/\\times(?![a-zA-Z])/g, " × ");
  s = s.replace(/\\approx(?![a-zA-Z])/g, " ≈ ");
  s = s.replace(/\\neq(?![a-zA-Z])/g, " ≠ ");
  s = s.replace(/\\ne(?![a-zA-Z])/g, " ≠ ");
  s = s.replace(/\\leq(?![a-zA-Z])/g, " ≤ ");
  s = s.replace(/\\le(?![a-zA-Z])/g, " ≤ ");
  s = s.replace(/\\geq(?![a-zA-Z])/g, " ≥ ");
  s = s.replace(/\\ge(?![a-zA-Z])/g, " ≥ ");
  s = s.replace(/\\pm(?![a-zA-Z])/g, " ± ");
  s = s.replace(/\\cdot(?![a-zA-Z])/g, " · ");
  s = s.replace(/\\(?:dots|cdots|ldots)(?![a-zA-Z])/g, " … ");

  // 间距与空格转义：\ (反斜杠加空格), \quad, \qquad, \;, \:, \!
  s = s.replace(/\\qquad(?![a-zA-Z])/g, "  ");
  s = s.replace(/\\quad(?![a-zA-Z])/g, " ");
  s = s.replace(/\\[ ,;:]/g, " ");
  s = s.replace(/\\!/g, "");
  s = s.replace(/\\([%${}_&#])/g, "$1");

  // 标点符号周围多余空格优化（如 81,   49 -> 81, 49）
  s = s.replace(/,\s+/g, ", ");
  s = s.replace(/，\s+/g, "，");

  // 根号与分式
  s = s.replace(/\\sqrt\[(.*?)\]\{(.*?)\}/g, "<sup>$1</sup>√($2)");
  s = s.replace(/\\sqrt\{(.*?)\}/g, "√($1)");
  s = s.replace(/\\frac\{([\s\S]*?)\}\{([\s\S]*?)\}/g, '<span class="ai-frac"><span class="frac-n">$1</span><span class="frac-d">$2</span></span>');

  // 上标与指数：10^2 -> 10<sup>2</sup>，10^{2+n} -> 10<sup>2+n</sup>
  s = s.replace(/\^\{([^}]+)\}/g, "<sup>$1</sup>");
  s = s.replace(/\^([0-9a-zA-Z]+)/g, "<sup>$1</sup>");

  // 下标：a_n -> a<sub>n</sub>，a_{n-1} -> a<sub>n-1</sub>
  s = s.replace(/_\{([^}]+)\}/g, "<sub>$1</sub>");
  s = s.replace(/_([0-9a-zA-Z]+)/g, "<sub>$1</sub>");

  // 合并多余的连续空格
  s = s.replace(/ {2,}/g, " ");

  return s.trim();
}

/**
 * 解析并转换 Markdown 表格为 HTML table
 */
function parseMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.endsWith("|") && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine.startsWith("|") && nextLine.endsWith("|") && /^\|[\s\-:|]+\|$/.test(nextLine)) {
        const headers = line
          .slice(1, -1)
          .split("|")
          .map((h) => h.trim());

        let tableHtml = `<div class="ai-table-wrap"><table class="ai-table"><thead><tr>`;
        for (const h of headers) {
          tableHtml += `<th>${h}</th>`;
        }
        tableHtml += `</tr></thead><tbody>`;

        i += 2;
        while (i < lines.length) {
          const rowLine = lines[i].trim();
          if (!rowLine.startsWith("|") || !rowLine.endsWith("|")) {
            break;
          }
          const cells = rowLine
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim());
          tableHtml += `<tr>`;
          for (let cIdx = 0; cIdx < headers.length; cIdx++) {
            tableHtml += `<td>${cells[cIdx] ?? ""}</td>`;
          }
          tableHtml += `</tr>`;
          i++;
        }
        tableHtml += `</tbody></table></div>`;
        result.push(tableHtml);
        continue;
      }
    }
    result.push(lines[i]);
    i++;
  }

  return result.join("\n");
}

/**
 * 尝试将多行箭头对应关系解析为精准列对齐的数列推导流（Sequence Mapping Flow）
 */
function tryParseMappingFlow(lines: string[]): { isMapping: boolean; html: string } {
  const arrowLineIdx = lines.findIndex((l) => {
    const arrows = l.match(/[↓↑→←]/g);
    return arrows && arrows.length >= 2;
  });

  if (arrowLineIdx === -1 || arrowLineIdx === 0 || arrowLineIdx + 1 >= lines.length) {
    return { isMapping: false, html: "" };
  }

  const topLine = lines[arrowLineIdx - 1].trim();
  const arrowLine = lines[arrowLineIdx].trim();
  const bottomLine = lines[arrowLineIdx + 1].trim();

  // 1. 优先按逗号切分
  let topItems = topLine.split(/[，,]/).map((s) => s.trim()).filter(Boolean);
  let botItems = bottomLine.split(/[，,]/).map((s) => s.trim()).filter(Boolean);
  const arrows = arrowLine.match(/[↓↑→←]/g) || [];

  // 2. 如果逗号切分长度不匹配，尝试按多空格或全角空格切分
  if (topItems.length !== arrows.length || botItems.length !== arrows.length) {
    const spaceSplit = (str: string) =>
      str.split(/\s{2,}|\t|　/).map((s) => s.trim()).filter(Boolean);
    const altTop = spaceSplit(topLine);
    const altBot = spaceSplit(bottomLine);
    if (altTop.length === arrows.length && altBot.length === arrows.length) {
      topItems = altTop;
      botItems = altBot;
    }
  }

  // 3. 校验并生成结构化列对齐
  if (
    topItems.length >= 2 &&
    topItems.length === arrows.length &&
    arrows.length === botItems.length
  ) {
    let flowHtml = `<div class="ai-mapping-wrap"><div class="ai-mapping-flow">`;
    for (let c = 0; c < topItems.length; c++) {
      flowHtml += `<div class="map-col"><span class="map-top">${topItems[c]}</span><span class="map-arrow">${arrows[c]}</span><span class="map-bottom">${botItems[c]}</span></div>`;
      if (c < topItems.length - 1) {
        flowHtml += `<span class="map-sep">，</span>`;
      }
    }
    flowHtml += `</div></div>`;

    const preLines = lines.slice(0, arrowLineIdx - 1);
    const postLines = lines.slice(arrowLineIdx + 2);
    const parts = [...preLines, flowHtml, ...postLines].filter(Boolean);

    return { isMapping: true, html: parts.join("<br/>") };
  }

  return { isMapping: false, html: "" };
}

/**
 * 解析并转换 Markdown 引用块（> ...）
 */
function parseMarkdownBlockquotes(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inQuote = false;
  let quoteBuffer: string[] = [];

  const flushQuote = () => {
    if (!quoteBuffer.length) return;
    const mapping = tryParseMappingFlow(quoteBuffer);
    if (mapping.isMapping) {
      result.push(mapping.html);
    } else {
      result.push(`<blockquote class="ai-quote">${quoteBuffer.join("<br/>")}</blockquote>`);
    }
    quoteBuffer = [];
    inQuote = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith(">")) {
      inQuote = true;
      quoteBuffer.push(trimmed.replace(/^>\s?/, ""));
    } else {
      if (inQuote) {
        flushQuote();
      }
      result.push(line);
    }
  }

  if (inQuote && quoteBuffer.length > 0) {
    flushQuote();
  }

  return result.join("\n");
}

/**
 * Markdown 语法格式化（加粗、列表、表格、引用块、选项标签等）
 */
export function formatMarkdown(text: string): string {
  let s = text;

  // 1. 优先解析表格与引用块（包含自动识别数列推导流）
  s = parseMarkdownTables(s);
  s = parseMarkdownBlockquotes(s);

  // 如果正文中也存在未加 > 的裸数列推导流，支持自动转换
  const flowCheck = tryParseMappingFlow(s.split("\n"));
  if (flowCheck.isMapping) {
    s = flowCheck.html;
  }

  // 2. 加粗 **bold**
  s = s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // 3. 代码行内块 `code`
  s = s.replace(/`([^`]+)`/g, '<code class="ai-code">$1</code>');

  // 4. 辨析中的选项标签美化：如 <strong>A项31：</strong> 或 - <strong>B项...</strong>
  s = s.replace(
    /(?:^|\n)([-*•]\s*)?<strong>([A-D]项[^：:\n]*)[：:]<\/strong>/g,
    (_, _prefix, optTitle) => {
      let badgeClass = "badge-neutral";
      if (optTitle.includes("正确") || optTitle.includes("答案")) {
        badgeClass = "badge-correct";
      } else if (optTitle.includes("考生") || optTitle.includes("所选")) {
        badgeClass = "badge-user";
      }
      return `\n<div class="ai-opt-item"><span class="ai-opt-badge ${badgeClass}">${optTitle}</span> `;
    }
  );

  // 5. 标号列表 1. 2. 3. 换行段落美化
  s = s.replace(/(?:^|\n)(\d+)\.\s+/g, "\n<div class=\"ai-num-item\"><span class=\"ai-num\">$1</span>");

  // 6. 换行规范：连续换行转为段落间距
  s = s.replace(/\n{2,}/g, "</p><p>");
  s = s.replace(/\n/g, "<br/>");

  return `<p>${s}</p>`;
}

/**
 * 将整篇 AI 解析拆分为结构化模块卡片
 */
export function parseAiSections(raw: string): AiSection[] {
  if (!raw || !raw.trim()) return [];

  // 识别模块大标题规则
  // 例如：一、【考点定位】 或 【考点定位】 或 五、【30秒极速秒杀】
  const pattern = /(?:^|\n)(?:[一二三四五六七八九十]、)?(?:#{1,3}\s*)?【\s*(考点定位|解题思路|选项辨析|名师点拨|核心考点|题目解析|30秒极速秒杀|极速秒杀|秒杀技巧|秒解技巧|30秒秒杀)\s*】/g;

  const matches: Array<{ index: number; title: string; fullLen: number }> = [];
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(raw)) !== null) {
    matches.push({
      index: m.index,
      title: m[1],
      fullLen: m[0].length,
    });
  }

  // 如果没有标准结构化大标题，直接作为通用卡片展示
  if (matches.length === 0) {
    const formatted = formatMarkdown(formatLatexAndSymbols(raw.trim()));
    return [{
      type: "general",
      title: "详细解析",
      icon: "bulb-o",
      html: formatted,
    }];
  }

  const sections: AiSection[] = [];

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const startIndex = cur.index + cur.fullLen;
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    const bodyText = raw.slice(startIndex, endIndex).trim();

    let type: AiSection["type"] = "general";
    let icon = "info-o";

    if (cur.title.includes("秒杀") || cur.title.includes("秒解") || cur.title.includes("速解")) {
      type = "speed";
      icon = "fire-o"; // 极速秒杀
    } else if (cur.title.includes("考点")) {
      type = "point";
      icon = "aim"; // 考点定位
    } else if (cur.title.includes("思路") || cur.title.includes("解析")) {
      type = "steps";
      icon = "guide-o"; // 解题思路
    } else if (cur.title.includes("选项") || cur.title.includes("辨析")) {
      type = "options";
      icon = "records-o"; // 选项辨析
    } else if (cur.title.includes("点拨") || cur.title.includes("技巧")) {
      type = "tips";
      icon = "award-o"; // 名师点拨
    }

    const html = formatMarkdown(formatLatexAndSymbols(bodyText));

    sections.push({
      type,
      title: cur.title,
      icon,
      html,
    });
  }

  return sections;
}

/**
 * 将整篇解析内容拆分为「教研精析」和「30秒极速秒杀」双视图
 */
export function parseAiDualViews(raw: string): DualAiViewSections {
  const allSections = parseAiSections(raw);
  const standard: AiSection[] = [];
  const speed: AiSection[] = [];

  for (const sec of allSections) {
    if (sec.type === "speed") {
      speed.push(sec);
    } else {
      standard.push(sec);
    }
  }

  // 兜底保障：若历史缓存的解析缺少秒杀模块，给予友好提示卡片
  if (speed.length === 0) {
    speed.push({
      type: "speed",
      title: "30秒极速秒杀",
      icon: "fire-o",
      html: `<div class="ai-speed-empty-tip">本题尚未生成专项秒杀技巧，点击右上角【重新生成】即可一键获取 30 秒极速破题思路。</div>`,
    });
  }

  return { standard, speed };
}

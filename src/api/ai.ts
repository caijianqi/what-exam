import type { Question } from "../data/bank";

export interface AiModelItem {
  id: string;
  name?: string;
}

export interface GenerateAiExplanationParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  question: Question;
  materialText?: string;
  chosen?: string | null;
  type?: "standard" | "speed";
  signal?: AbortSignal;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** 剥除简单 HTML 标签用于组装 Prompt */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * 在线拉取 AI 模型列表
 * 适配 MiniMax 及 OpenAI 兼容接口规范 (GET /models)
 */
export async function fetchAiModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = `${normalizeUrl(baseUrl)}/models`;
  const cleanKey = apiKey.trim();

  if (!cleanKey) {
    throw new Error("请先填写 API Key");
  }

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${cleanKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    let errMsg = `请求失败 (${res.status} ${res.statusText})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        errMsg = errJson.error.message;
      } else if (errJson?.message) {
        errMsg = errJson.message;
      }
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      throw new Error(`认证失败 (401)：请检查 API Key 是否正确`);
    }
    throw new Error(errMsg);
  }

  const json = await res.json();
  const rawList = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.models)
    ? json.models
    : [];

  const models: string[] = rawList
    .map((item: unknown) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null && "id" in item) {
        return String((item as { id: unknown }).id);
      }
      return "";
    })
    .filter((id: string) => id.length > 0);

  if (models.length === 0) {
    throw new Error("获取成功但未找到可用模型列表，请确认服务商接口返回");
  }

  // 排序提升展示体验
  return models.sort();
}

/**
 * 生成行测题目 AI 解析
 */
export async function generateAiExplanation(
  params: GenerateAiExplanationParams
): Promise<string> {
  const { baseUrl, apiKey, model, question, materialText, chosen, signal } = params;
  const cleanKey = apiKey.trim();
  const cleanModel = model.trim();

  if (!cleanKey) throw new Error("未配置 API Key，请前往设置配置");
  if (!cleanModel) throw new Error("未配置 AI 模型，请前往设置拉取并选择模型");

  const url = `${normalizeUrl(baseUrl)}/chat/completions`;

  // 组装选项文本
  const optionsText = question.options
    .map((opt) => `${opt.key}. ${opt.text || (opt.image ? "[图形选项]" : "")}`)
    .join("\n");

  const promptParts: string[] = [];

  if (materialText && materialText.trim()) {
    promptParts.push(`【关联材料】\n${materialText.trim()}`);
  }

  promptParts.push(`【题干】\n${stripHtml(question.stem)}`);

  if (optionsText) {
    promptParts.push(`【选项】\n${optionsText}`);
  }

  promptParts.push(`【参考答案】\n${question.answer}`);

  if (chosen) {
    promptParts.push(`【考生所选】\n${chosen}`);
  }

  if (question.explanation) {
    promptParts.push(`【题库原解析参考】\n${question.explanation}`);
  }

  const userContent = promptParts.join("\n\n");

  const isSpeedMode = params.type === "speed";

  const systemPrompt = isSpeedMode
    ? `你是一位精通国家公务员考试行测实战秒杀的高分导师。
请针对给出的题目，【彻底摒弃列方程、繁琐计算与长篇大论】，只输出专为考场 30~50 秒快速拿分的【非常规极速秒杀绝技】！
请按以下结构输出：
【30秒极速秒杀】
1. 【秒杀心法】：直接指出命题人的破绽与最快破局切入点（如整除特性、尾数法、奇偶倍数、极端假设、代入排除、选项逆推、特征图形直觉、语境极性排除等）；
2. 【秒杀步骤】：不超过 3 步的极简破局推演，突出高维思维；
3. 【秒杀口诀】：一句话考场应试秒选速记口诀。
若本题确实为纯概念/记忆型题目无特殊计算技巧，直接给出考场 30 秒直觉速选策略。内容干脆利落，直击得分点！`
    : `你是一位经验丰富的国家公务员考试行测教研名师。请针对考生给出的题目进行深入浅出、结构严密的教研解析。
请按以下四大结构完整输出解析：
一、【考点定位】：准确点明本题考查的具体题型与核心考点（如行测言语/数量/判断/资料中的细分考点）；
二、【解题思路】：分步骤进行严密的逻辑推导、速算技巧或解题公式，结构完整、条理清晰；
三、【选项辨析】：针对正确选项说明理由，对干扰选项分析陷阱（若考生做错，特别剖析考生所选项的常见思维误区）；
四、【名师点拨】：提炼该类题型的命题规律与应试要点。

注意：内容条理清晰，各模块标题必须严格使用【】包裹，使用换行和标号区分层次，语气鼓励且专业。`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cleanKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cleanModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
    }),
    signal,
  });

  if (!res.ok) {
    let errMsg = `请求失败 (${res.status} ${res.statusText})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        errMsg = errJson.error.message;
      } else if (errJson?.message) {
        errMsg = errJson.message;
      }
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      throw new Error(`认证失败 (401)：请检查 API Key 是否有效`);
    }
    throw new Error(errMsg);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI 接口返回成功，但未解析到回答内容");
  }

  return String(content).trim();
}

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { load } from "@tauri-apps/plugin-store";

export type ThemeMode = "auto" | "light" | "dark";

const FALLBACK_KEY = "whatexam.settings";

/** 读写封装：Tauri 环境走 plugin-store，浏览器环境降级到 localStorage */
async function getStore() {
  try {
    return await load("settings.json", { autoSave: true });
  } catch {
    return null;
  }
}

export const useSettingsStore = defineStore("settings", () => {
  const themeMode = ref<ThemeMode>("auto");
  const fontSize = ref(15);
  const autoShowAnalysis = ref(true);
  const dailyGoal = ref(30);

  // AI 相关配置
  const aiProvider = ref("minimax");
  const aiApiKey = ref("");
  const aiBaseUrl = ref("https://api.minimax.chat/v1");
  const aiModel = ref(""); // 不默认设置模型，需通过拉取获取
  const aiModelList = ref<string[]>([]);

  const ready = ref(false);

  // Vant 的 theme 只接受 light / dark，auto 需自行解析
  const resolvedTheme = computed<"light" | "dark">(() => {
    if (themeMode.value === "auto") {
      const dark =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      return dark ? "dark" : "light";
    }
    return themeMode.value;
  });

  async function init() {
    if (ready.value) return;
    const store = await getStore();
    if (store) {
      const [t, f, a, g, aip, key, base, model, list] = await Promise.all([
        store.get<ThemeMode>("themeMode"),
        store.get<number>("fontSize"),
        store.get<boolean>("autoShowAnalysis"),
        store.get<number>("dailyGoal"),
        store.get<string>("aiProvider"),
        store.get<string>("aiApiKey"),
        store.get<string>("aiBaseUrl"),
        store.get<string>("aiModel"),
        store.get<string[]>("aiModelList"),
      ]);
      if (t) themeMode.value = t;
      if (f) fontSize.value = f;
      if (a !== undefined && a !== null) autoShowAnalysis.value = a;
      if (g) dailyGoal.value = g;
      if (aip) aiProvider.value = aip;
      if (key) aiApiKey.value = key;
      if (base) {
        aiBaseUrl.value = base === "https://api.minimaxi.chat/v1" ? "https://api.minimax.chat/v1" : base;
      }
      if (model) aiModel.value = model;
      if (Array.isArray(list)) aiModelList.value = list;
    } else {
      const raw = localStorage.getItem(FALLBACK_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{
          themeMode: ThemeMode;
          fontSize: number;
          autoShowAnalysis: boolean;
          dailyGoal: number;
          aiProvider: string;
          aiApiKey: string;
          aiBaseUrl: string;
          aiModel: string;
          aiModelList: string[];
        }>;
        if (saved.themeMode) themeMode.value = saved.themeMode;
        if (saved.fontSize) fontSize.value = saved.fontSize;
        if (saved.autoShowAnalysis !== undefined) autoShowAnalysis.value = saved.autoShowAnalysis;
        if (saved.dailyGoal) dailyGoal.value = saved.dailyGoal;
        if (saved.aiProvider) aiProvider.value = saved.aiProvider;
        if (saved.aiApiKey) aiApiKey.value = saved.aiApiKey;
        if (saved.aiBaseUrl) {
          aiBaseUrl.value = saved.aiBaseUrl === "https://api.minimaxi.chat/v1" ? "https://api.minimax.chat/v1" : saved.aiBaseUrl;
        }
        if (saved.aiModel) aiModel.value = saved.aiModel;
        if (Array.isArray(saved.aiModelList)) aiModelList.value = saved.aiModelList;
      }
    }
    ready.value = true;
  }

  async function persist(key: string, value: unknown) {
    const store = await getStore();
    if (store) {
      await store.set(key, value);
    } else {
      const existing = (() => {
        try {
          return JSON.parse(localStorage.getItem(FALLBACK_KEY) || "{}");
        } catch {
          return {};
        }
      })();
      existing[key] = value;
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(existing));
    }
  }

  watch(themeMode, (v) => persist("themeMode", v));
  watch(fontSize, (v) => persist("fontSize", v));
  watch(autoShowAnalysis, (v) => persist("autoShowAnalysis", v));
  watch(dailyGoal, (v) => persist("dailyGoal", v));
  watch(aiProvider, (v) => persist("aiProvider", v));
  watch(aiApiKey, (v) => persist("aiApiKey", v));
  watch(aiBaseUrl, (v) => persist("aiBaseUrl", v));
  watch(aiModel, (v) => persist("aiModel", v));
  watch(aiModelList, (v) => persist("aiModelList", v), { deep: true });

  return {
    themeMode,
    fontSize,
    autoShowAnalysis,
    dailyGoal,
    aiProvider,
    aiApiKey,
    aiBaseUrl,
    aiModel,
    aiModelList,
    ready,
    resolvedTheme,
    init,
  };
});

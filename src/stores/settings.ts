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
      const [t, f, a, g] = await Promise.all([
        store.get<ThemeMode>("themeMode"),
        store.get<number>("fontSize"),
        store.get<boolean>("autoShowAnalysis"),
        store.get<number>("dailyGoal"),
      ]);
      if (t) themeMode.value = t;
      if (f) fontSize.value = f;
      if (a !== undefined && a !== null) autoShowAnalysis.value = a;
      if (g) dailyGoal.value = g;
    } else {
      const raw = localStorage.getItem(FALLBACK_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{
          themeMode: ThemeMode;
          fontSize: number;
        }>;
        if (saved.themeMode) themeMode.value = saved.themeMode;
        if (saved.fontSize) fontSize.value = saved.fontSize;
      }
    }
    ready.value = true;
  }

  async function persist(key: string, value: unknown) {
    const store = await getStore();
    if (store) {
      await store.set(key, value);
    } else {
      localStorage.setItem(
        FALLBACK_KEY,
        JSON.stringify({ themeMode: themeMode.value, fontSize: fontSize.value })
      );
    }
  }

  watch(themeMode, (v) => persist("themeMode", v));
  watch(fontSize, (v) => persist("fontSize", v));
  watch(autoShowAnalysis, (v) => persist("autoShowAnalysis", v));
  watch(dailyGoal, (v) => persist("dailyGoal", v));

  return {
    themeMode,
    fontSize,
    autoShowAnalysis,
    dailyGoal,
    ready,
    resolvedTheme,
    init,
  };
});

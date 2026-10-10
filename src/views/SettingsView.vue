<script setup lang="ts">
import { onMounted, ref } from "vue";
import { showConfirmDialog, showDialog, showToast } from "vant";
import { useSettingsStore, type ThemeMode } from "../stores/settings";
import { clearAllData, exportData, importData } from "../db/records";

const settings = useSettingsStore();
const fileInput = ref<HTMLInputElement | null>(null);
const importing = ref(false);

onMounted(() => settings.init());

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** 导出：Tauri 下写应用数据目录（BaseDirectory.AppData），浏览器降级为下载文件 */
async function exportBackup() {
  let payload;
  try {
    payload = await exportData();
  } catch (err) {
    showToast("读取记录失败：" + err);
    return;
  }
  const json = JSON.stringify(payload, null, 1);
  const name = `backup-${stamp()}.json`;

  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    try {
      const fs = await import("@tauri-apps/plugin-fs");
      const { BaseDirectory } = await import("@tauri-apps/api/path");
      await fs.writeTextFile(name, json, { baseDir: Number(BaseDirectory.AppData) });
      await showDialog({
        title: "导出成功",
        message: `已保存到应用数据目录：\n${name}\n\n共 ${payload.attempts.length} 条记录、${payload.wrong_book.length} 条错题`,
        messageAlign: "left",
      });
    } catch (err) {
      showToast("Tauri 写入失败：" + (err instanceof Error ? err.message : String(err)));
    }
    return;
  }

  /* 浏览器预览模式：blob 下载 */
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  showToast("已导出为下载文件");
}

function pickFile() {
  fileInput.value?.click();
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importing.value = true;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!payload || (!payload.attempts && !payload.wrong_book)) {
      showToast("文件格式不对，缺少 attempts / wrong_book");
      return;
    }
    await showConfirmDialog({
      title: "导入备份",
      message: `将合并 ${payload.attempts?.length ?? 0} 条记录、${payload.wrong_book?.length ?? 0} 条错题到本机，确定继续？`,
    });
    const r = await importData(payload);
    showToast(`导入完成：记录 ${r.attempts} / 错题 ${r.wrong} / 收藏 ${r.favorites}`);
  } catch (err) {
    showToast("导入失败：" + err);
  } finally {
    importing.value = false;
    input.value = "";
  }
}

const themeOptions: { label: string; value: ThemeMode }[] = [
  { label: "跟随系统", value: "auto" },
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" },
];

async function clearData() {
  await showConfirmDialog({
    title: "清空做题数据",
    message: "将删除全部做题记录、错题本与收藏，且不可恢复。确定继续？",
  });
  await clearAllData();
  showToast("已清空");
}
</script>

<template>
  <div class="page">
    <div class="card">
      <div class="section-title">外观</div>
      <van-field label="主题模式">
        <template #input>
          <van-radio-group v-model="settings.themeMode" direction="horizontal">
            <van-radio
              v-for="o in themeOptions"
              :key="o.value"
              :name="o.value"
              style="margin-right: 12px"
            >
              {{ o.label }}
            </van-radio>
          </van-radio-group>
        </template>
      </van-field>

      <van-field :label="`字号（${settings.fontSize}px）`">
        <template #input>
          <van-slider v-model="settings.fontSize" :min="13" :max="20" :step="1" />
        </template>
      </van-field>
    </div>

    <div class="card">
      <div class="section-title">刷题</div>
      <van-field label="每日目标（题）">
        <template #input>
          <van-stepper v-model="settings.dailyGoal" :min="5" :max="200" :step="5" />
        </template>
      </van-field>
      <van-field label="作答后自动展开解析">
        <template #input>
          <van-switch v-model="settings.autoShowAnalysis" size="20" />
        </template>
      </van-field>
    </div>

    <div class="card">
      <div class="section-title">数据备份</div>
      <div class="muted" style="margin-bottom: 10px">
        导出做题记录 / 错题 / 收藏为 JSON，换机时导入即可恢复
      </div>
      <van-button block plain type="primary" @click="exportBackup">
        导出备份
      </van-button>
      <van-button
        block
        plain
        style="margin-top: 8px"
        :loading="importing"
        @click="pickFile"
      >
        从文件导入
      </van-button>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        hidden
        @change="onFile"
      />
    </div>

    <div class="card">
      <div class="section-title">数据</div>
      <van-button block plain type="danger" @click="clearData">
        清空做题数据
      </van-button>
      <div class="muted" style="margin-top: 8px">
        题库内置于应用，不受此操作影响
      </div>
    </div>

    <div class="card">
      <div class="section-title">关于</div>
      <div class="about">
        <div class="about-brand">行测刷题</div>
        <div class="muted">v0.2.0 · Tauri 2 + Vue 3</div>
      </div>
      <div class="muted">题库 500 题（数量 120 / 判断 130 / 言语 130 / 资料 120）</div>
      <div class="muted">开发期运行在桌面窗口（390×844 模拟手机视口）</div>
    </div>
  </div>
</template>

<style scoped>
.about {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}
.about-brand {
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--brand-a), var(--brand-b));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
</style>

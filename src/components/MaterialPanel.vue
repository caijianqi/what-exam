<script setup lang="ts">
/**
 * 材料区（资料分析的图表/表格、言语的篇章阅读）。
 *
 * 做题时材料必须能随时看到，但也不能把题干挤出屏幕：
 *   - 折叠态：一行标题 + 摘要，点开展开
 *   - 展开态：限高滚动，图片可点开全屏
 *   - 「全屏」按钮：弹层里完整阅读，适合长材料
 */
import { computed, ref } from "vue";
import { showImagePreview } from "vant";
import type { Material } from "../data/bank";
import { assetUrl } from "../data/bank";

const props = defineProps<{ material: Material; open: boolean }>();
const emit = defineEmits<{ (e: "toggle"): void }>();

const fullscreen = ref(false);

const texts = computed(() =>
  props.material.content.filter((c) => c.t === "text").map((c) => c.v)
);
const images = computed(() =>
  props.material.content.filter((c) => c.t === "img").map((c) => assetUrl(c.v))
);
const summary = computed(() => {
  const s = texts.value.join("").replace(/\s+/g, " ").trim();
  return s.length > 46 ? s.slice(0, 46) + "…" : s;
});

function preview(i: number) {
  showImagePreview({ images: images.value, startPosition: i, closeable: true, maxZoom: 3 });
}
</script>

<template>
  <div class="material">
    <div class="mat-head" @click="emit('toggle')">
      <span class="mat-title">材料 · {{ material.title }}</span>
      <span v-if="!open" class="mat-summary">{{ summary }}</span>
      <van-icon :name="open ? 'arrow-up' : 'arrow-down'" class="mat-arrow" />
    </div>

    <div v-if="open" class="mat-body">
      <p v-for="(t, i) in texts" :key="'t' + i" class="mat-p">{{ t }}</p>
      <img
        v-for="(src, i) in images"
        :key="'i' + i"
        class="mat-img"
        :src="src"
        alt="材料图"
        @click="preview(i)"
      />
      <div class="mat-actions">
        <van-button size="mini" plain type="primary" @click="fullscreen = true">
          全屏阅读
        </van-button>
        <van-button size="mini" plain @click="emit('toggle')">收起</van-button>
      </div>
    </div>

    <van-popup
      v-model:show="fullscreen"
      position="bottom"
      :style="{ height: '88%' }"
      safe-area-inset-bottom
    >
      <div class="mat-full">
        <div class="mat-full-title">材料 · {{ material.title }}</div>
        <div class="mat-full-body">
          <p v-for="(t, i) in texts" :key="'ft' + i" class="mat-p">{{ t }}</p>
          <img
            v-for="(src, i) in images"
            :key="'fi' + i"
            class="mat-img"
            :src="src"
            alt="材料图"
            @click="preview(i)"
          />
        </div>
        <div class="mat-full-foot">
          <van-button block type="primary" @click="fullscreen = false">
            回到题目
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.material {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--mat-bg);
  overflow: hidden;
}

.mat-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  min-height: 38px;
}

.mat-title {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-b);
}

.mat-summary {
  flex: 1;
  font-size: 12px;
  color: var(--text-sub);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mat-arrow {
  flex: none;
  color: var(--text-sub);
}

.mat-body {
  max-height: 42vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 10px 10px;
  border-top: 1px dashed var(--border-color);
}

.mat-p {
  margin: 8px 0;
  font-size: calc(var(--app-font-size, 15px) - 1px);
  line-height: 1.65;
  text-align: justify;
}

.mat-img {
  width: 100%;
  display: block;
  border-radius: 6px;
  margin: 6px 0;
  border: 1px solid var(--border-color);
}

.mat-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 6px;
}

.mat-full {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.mat-full-title {
  padding: 10px 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
}
.mat-full-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
}
.mat-full-foot {
  padding: 8px 12px calc(8px + var(--safe-bottom));
  border-top: 1px solid var(--border-color);
}
</style>

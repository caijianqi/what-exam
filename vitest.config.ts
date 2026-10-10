import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.spec.ts"],
    // 题库 JSON 较大，放宽单测超时
    testTimeout: 20000,
  },
});

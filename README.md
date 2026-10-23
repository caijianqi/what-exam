# 行测刷题 (What-Exam)

> 基于 **Tauri 2.x + Vue 3 + TypeScript** 的轻量、单手可刷行测备考应用。  
> 纯离线优先，内置完整题库与图文解析，支持 **Android** 与 **Windows / macOS** 桌面端跨平台运行。

---

## ✨ 核心特性

- **纯离线优先 (Offline-First)**：内置 500+ 道行测经典真题与逐题详解，无需网络连接、无登录认证、无服务器依赖，随时随地专注刷题。
- **四大核心模块完整覆盖**：
  - 📝 **言语理解与表达**：逻辑填空、片段阅读
  - 🔢 **数量关系**：数字推理、数学运算（含复杂分式排版优化）
  - 🧩 **判断推理**：图形推理（高清裁图内置）、定义判断、类比推理、逻辑判断
  - 📊 **资料分析**：多组复杂材料与统计表格裁图无缝嵌入
- **沉浸式刷题体验**：
  - **模块练习 & 自由刷题**：自由定制题量，快速进入练习状态
  - **即时对题 & 答案解析**：单选即判、查看深度文字解析与考点剖析
  - **悬浮答题卡**：全景掌握答题进度，一键快速跳转题号
- **错题本与强化巩固**：
  - 做错题目自动收录错题本，支持按模块筛选
  - 错题重做与消灭机制，攻克薄弱环节
- **数据统计与成长看板**：
  - 答题总题量、累计用时、正确率实时统计
  - 各模块掌握度与雷达/柱状图表分析
- **现代科技感视觉**：
  - 极客科技感深色/浅色主题自由切换
  - 动态字号无级缩放（14px ~ 20px）全局适配
  - 定制 SVG 科技图标系统与流畅微交互动效

---

## 🛠️ 技术架构

| 层级 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **跨平台引擎** | [Tauri 2.x](https://v2.tauri.app/) (Rust) | 提供跨平台 WebView 宿主，低内存占用，高性能原生桥接 |
| **前端框架** | [Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/) | Composition API + `<script setup>` |
| **构建工具** | [Vite 6+](https://vitejs.dev/) | 极速热重载 (HMR) 与轻量生产打包 |
| **UI 组件库** | [Vant 4](https://vant-ui.github.io/vant/) | 移动端交互设计与组件库，针对桌面与移动端统一适配 |
| **状态管理** | [Pinia 3+](https://pinia.vuejs.org/) | 响应式状态管理（设置、练习进度、历史记录） |
| **路由导航** | [Vue Router 4+](https://router.vuejs.org/) | 单页应用无缝路由切换 |
| **数据持久化** | SQLite (`@tauri-apps/plugin-sql`) + Tauri Store | 本地嵌入式数据库，存储刷题记录与用户偏好 |

---

## 🚀 快速上手与本地开发

### 1. 环境准备

- [Node.js](https://nodejs.org/) (建议 v18 或更高版本)
- [Rust](https://www.rust-lang.org/) (建议最新稳定版，已配置 `cargo`)
- Windows 桌面开发需安装 C++ 构建工具与 WebView2
- Android 开发需安装 [Android Studio](https://developer.android.com/studio) (含 Android SDK、NDK 27+ 及 JDK 17)

### 2. 克隆与安装依赖

```bash
git clone https://github.com/caijianqi/what-exam.git
cd what-exam
npm install
```

### 3. 桌面端开发调试

在 Windows / macOS 桌面窗口中运行：

```bash
npm run tauri dev
```

### 4. 桌面端构建打包

生成独立的桌面端发布二进制及安装程序：

```bash
npm run tauri build
```

---

## 📱 Android 打包与签名指南

### 1. 真机 / 模拟器调试 (Debug)

连接手机并开启 USB 调试，运行：

```bash
npm run tauri android dev
```

> **注意**：Debug 模式为了支持 HMR 热更新，默认会访问开发机 Vite 端口（如 `http://192.168.x.x:1420`）。请确保手机与电脑处于同一局域网 WiFi。

---

### 2. 独立离线版 APK 打包 (Release)

若要安装至手机独立离线运行，需生成签名后的 Release APK：

#### 步骤一：生成签名密钥库（如已有可跳过）

在项目根目录打开终端执行：

```bash
keytool -genkey -v -keystore release.keystore -alias whatexam -keyalg RSA -keysize 2048 -validity 10000
```
将生成的 `release.keystore` 复制到 `src-tauri/gen/android/app/` 目录下。

#### 步骤二：配置 Gradle 签名

在 `src-tauri/gen/android/app/build.gradle.kts` 的 `android` 块中配置：

```kotlin
android {
    // ...
    signingConfigs {
        create("release") {
            keyAlias = "whatexam"
            keyPassword = "YOUR_KEY_PASSWORD"
            storeFile = file("release.keystore")
            storePassword = "YOUR_STORE_PASSWORD"
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            optimization {
               enable = true
            }
            // ...
        }
    }
}
```

#### 步骤三：执行打包

```bash
# 全架构打包（通用包）：
npm run tauri android build

# 或仅针对现代手机 ARM64 打包（构建速度快、体积更小）：
npm run tauri android build -- --target aarch64
```

构建产物 APK 位于：
`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
（或 `arm64/release/app-arm64-v8a-release.apk`）

传至手机即可直接安装、完全离线单机刷题！

---

## 📂 项目目录结构

```text
what-exam/
├── docs/                   # 需求、设计与开发方案文档
├── pipeline/               # PDF 题库清洗、图文提取与验证脚本
├── public/                 # 静态资源、题库 questions.json 及裁剪题图
├── src/                    # 前端源码
│   ├── assets/             # 静态图片与全局样式
│   ├── components/         # 题板、答题卡、图表、科技图标等组件
│   ├── data/               # 题库加载与模块定义常量
│   ├── db/                 # SQLite 数据库模型与刷题记录持久化
│   ├── router/             # 路由配置
│   ├── stores/             # Pinia 状态中心 (练习会话、用户偏好)
│   ├── styles/             # 全局科技风 CSS 变量与主题样式
│   ├── views/              # 页面视图 (首页、练习、会话、错题本、统计、设置)
│   ├── App.vue             # 根组件
│   └── main.ts             # 应用入口
├── src-tauri/              # Tauri 跨平台 Rust 后端
│   ├── src/                # Rust 核心逻辑
│   ├── Cargo.toml          # Rust 依赖声明
│   ├── tauri.conf.json     # Tauri 2.0 应用核心配置
│   └── gen/                # 跨平台（Android）原生项目工程
├── package.json
└── vite.config.ts
```

---

## 📄 免责与版权声明

1. 本软件为开源交流与个人备考学习工具，代码采用 MIT 许可证开放。
2. 内置题库资料整理自公开公考备考资料，仅供个人学习、研究与交流使用，禁止用于任何商业营利性用途。

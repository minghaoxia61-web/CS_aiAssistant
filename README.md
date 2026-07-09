# CS_Assistant — 智能复习助手

> 基于 RAG + 向量语义检索 + SOLO Agent 主动智能的 AI 学习助手，专为计算机科学课程复习设计。
> 课件上传一次，AI 问答、测验、错题、复习资料全自动联动。

## 项目简介

CS_Assistant 是一个面向大学生的智能复习助手 Web 应用。用户上传课程 PDF/DOCX/PPTX 课件后，系统在浏览器本地完成解析、分块、向量化，构建可语义检索的知识库。在此基础上提供 AI 问答、自动出题测验、错题本、复习资料生成、学情分析等功能。

**核心创新**：SOLO Agent 主动智能引擎。系统不是被动等待用户提问，而是主动分析学情数据（错题率、章节分布、复习频率），在用户无操作时主动推送薄弱章节预警、高频错题提醒、每日学习日报，区别于普通"套壳 ChatGPT"工具。

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器（前端 + 本地计算）              │
│                                                         │
│  React 18 + TypeScript + Vite + Zustand                 │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ 知识板块  │  │ AI 对话  │  │ 自我测验  │  │ 学情分析 │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │              │              │              │    │
│  ┌────┴──────────────┴──────────────┴──────────────┴────┐ │
│  │              RAG 检索引擎（混合召回）                  │ │
│  │  BM25 关键词检索 × 0.4 + 向量语义检索 × 0.6            │ │
│  │  TopK=8 硬限制 · 按科目隔离 · 多轮对话自动摘要          │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────┴──────────────────────────────┐ │
│  │           Web Worker 异步计算池                      │ │
│  │  PDF/DOCX/PPTX 解析 · transformers.js 向量化         │ │
│  │  并发控制 · 任务队列 · 取消支持                       │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────┴──────────────────────────────┐ │
│  │           IndexedDB 本地存储（9 张分表）              │ │
│  │  subjects · materials · chunks · vectors            │ │
│  │  chatSessions · quizSessions · wrongQuestions       │ │
│  │  reviewDocs · cache                                 │ │
│  │  外键索引 · 级联删除 · 缓存 TTL · 存储统计            ││
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  SOLO Agent 主动智能引擎                           │  │
│  │  5 触发器 · 冷却管理 · 优先级排序 · 桌面通知         │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  PWA Service Worker（离线访问 · 向量模型 CDN 缓存）       │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP（仅 LLM 代理 + 知识库下发）
┌──────────────────────┴──────────────────────────────────┐
│                   Express 服务端（无状态）                │
│  /api/llm/stream  → LLM API 流式代理（不暴露 API Key）    │
│  /api/parse       → 文件解析代理（可选，Worker 优先）      │
│  /api/knowledge   → 25 篇计算机基础知识库文章              │
└─────────────────────────────────────────────────────────┘
```

## 核心技术亮点

### 1. 前端向量语义检索（无需后端向量数据库）

使用 [transformers.js](https://github.com/xenova/transformers.js) 在浏览器中加载 `all-MiniLM-L6-v2` 模型（384 维，~23MB），将课件分块向量化并持久化到 IndexedDB。

- **混合召回**：BM25 关键词检索 × 0.4 + 向量语义检索 × 0.6，比纯 BM25 精度更高
- **上传一次，永久复用**：向量持久化到 IndexedDB，刷新页面/重新打开无需重复计算
- **降级兼容**：向量模型未加载时自动回退纯 BM25 检索
- **按科目隔离**：进入某科目对话只加载该科目的分块和向量，不遍历全部文档

### 2. IndexedDB 分表存储（浏览器即数据库）

数据完全存储在浏览器本地，后端变为纯无状态 LLM 代理。9 张表 + 外键索引：

| 表名 | 用途 | 索引 |
|------|------|------|
| subjects | 科目 | id |
| materials | 课件元数据 | subject_id, status |
| chunks | 文本分块 | subject_id, material_id, [subject_id+index] |
| vectors | 向量索引 | subject_id |
| chatSessions | 对话记录 | subject_id, created_at |
| quizSessions | 测验记录 | subject_id, created_at |
| wrongQuestions | 错题本 | subject_id, [subject_id+reviewed] |
| reviewDocs | 复习资料 | subject_id |
| cache | 通用缓存 | key, expires_at |

级联删除、过期缓存自动清理、存储占用统计面板。

### 3. Web Worker 异步计算（主线程零阻塞）

PDF/DOCX/PPTX 解析、文本分块、向量计算全部在 Web Worker 后台线程执行：

- **Worker 池**：并发数 `Math.min(hardwareConcurrency - 1, 2)`，任务队列 FIFO 调度
- **批量上传**：分片队列 + 并发限制，避免浏览器内存爆满
- **取消支持**：一键终止批量解析任务
- **进度反馈**：向量模型加载进度、解析进度实时展示

### 4. SOLO Agent 主动智能（大赛核心创新）

区别于被动问答工具，Agent 主动分析学情并推送干预：

| 触发器 | 条件 | 动作 | 冷却 |
|--------|------|------|------|
| 薄弱章节预警 | 某章节错题率 > 60% 且未复习 ≥ 3 道 | 推送专项练习建议 | 24h |
| 高频错题考点 | 某章节累计错题 ≥ 3 道 | 提醒重点复习 | 12h |
| 每日学习日报 | 当天首次打开且有学习数据 | 生成日报 + 次日规划 | 每日 1 次 |
| 连续复习奖励 | 连续 ≥ 3 天有复习记录 | 鼓励 + 建议冲刺卡片 | 24h |
| 待办提醒 | 有未复习错题 | 推送去复习 | 6h |

- 冷却管理持久化到 localStorage，刷新后不重复触发
- 按优先级排序（high > medium > low）
- 高优先级建议同时发送桌面通知（Notification API）

### 5. RAG 检索全链路优化

- **自实现 BM25**：完整 IDF/TF/k1/b 公式 + 中英文分词（英文单词 + 中文 2-gram/3-gram）
- **n-gram 模糊匹配**：字符 2-gram 相似度，处理错别字和近义词
- **TopK 硬限制**：单次问答最多 Top8 高相似度片段送入 LLM，严格控制 Token
- **多样化策略**：先从每份资料取最高分块（轮询），确保多资料覆盖
- **多轮对话摘要**：对话轮次超过 6 轮自动压缩早期历史，防止上下文膨胀
- **Map-Reduce 压缩**：多份资料合并提问时自动精简文本

## 功能清单

| 模块 | 功能 |
|------|------|
| 知识板块 | 25 篇计算机基础知识库文章，按分类浏览 |
| 资料库 | 上传 PDF/DOCX/PPTX/TXT/MD，按科目管理，标签分类 |
| AI 对话 | 基于 RAG 的流式问答，支持 Markdown/LaTeX/Mermaid/代码运行 |
| 复习中心 | AI 自动生成知识摘要、大纲、背诵卡片 |
| 自我测验 | AI 出题（单选/多选/简答/代码），自动批改，难度分层 |
| 错题本 | 自动收录错题，按章节分组，支持标记复习 |
| 学情分析 | 学习统计可视化 + SOLO Agent 建议 + 每日日报 |
| 设置 | 多 API 配置管理，密码锁，缓存清理，演示数据 |

## 快速开始

### 在线体验

访问部署地址 → 设置页 → **一键加载示例数据** → 即可体验全部功能。

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器（前端 + 后端）
npm run dev:web

# 构建
npm run build:web

# 启动生产服务器
npm run start:web
```

### 配置 LLM API

支持任何 OpenAI 兼容接口：
- **智谱 GLM**（推荐，免费额度）：`https://open.bigmodel.cn/api/paas/v4`
- **DeepSeek**：`https://api.deepseek.com/v1`
- **OpenAI**：`https://api.openai.com/v1`
- **通义千问**：`https://dashscope.aliyuncs.com/compatible-mode/v1`

在设置页添加配置，输入 API Key 即可。API Key 仅存储在浏览器本地，不经过服务端持久化。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | React 18 + TypeScript + Vite |
| 状态管理 | Zustand |
| 路由 | React Router v6（HashRouter） |
| 样式 | Tailwind CSS + CSS 变量主题系统 |
| Markdown | react-markdown + remark/rehype + KaTeX + Mermaid |
| 向量检索 | @xenova/transformers (all-MiniLM-L6-v2) |
| 文件解析 | pdfjs-dist + mammoth + JSZip |
| 本地存储 | IndexedDB（原生 API 封装） |
| 异步计算 | Web Worker + Worker 池 |
| PWA | Service Worker + Web App Manifest |
| 后端 | Express + Multer（纯 LLM 代理） |
| 部署 | Railway |

## 项目结构

```
src/
├── pages/          # 9 个页面（知识/对话/资料/复习/测验/错题/分析/档案/设置）
├── components/     # Layout, Sidebar, Markdown, AgentToast, DailyReport 等
├── lib/
│   ├── db.ts          # IndexedDB 封装（9 张表 + 外键索引）
│   ├── db-adapter.ts  # ElectronAPI 的 IndexedDB 实现
│   ├── rag.ts         # BM25 + n-gram 混合检索
│   ├── vector.ts      # transformers.js 向量检索 + 持久化
│   ├── chat-store.ts  # 对话状态管理 + 多轮摘要
│   ├── solo-agent.ts  # SOLO Agent 主动智能引擎
│   ├── worker-pool.ts # Web Worker 池管理
│   ├── notify.ts      # Notification API 封装
│   ├── demo-data.ts   # 一键演示数据
│   └── ...
├── workers/
│   └── rag-worker.ts  # PDF/DOCX/PPTX 解析 + 向量化 Worker
└── public/
    ├── demo/          # 4 份示例 PDF 课件
    ├── sw.js          # Service Worker
    └── manifest.json  # PWA Manifest
```

## 部署

### Railway 部署

1. Fork 本仓库
2. 在 Railway 中创建新项目，连接 GitHub 仓库
3. 构建命令：`npm run build:web`
4. 启动命令：`npm run start:web`
5. 添加环境变量（可选）：`PORT=3000`

### 本地 Electron 桌面应用

```bash
npm run dev          # 开发模式
npm run package      # 打包为 Windows 安装包
```



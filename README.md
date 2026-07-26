# ATab

ATab 是一个本地优先的 AI 浏览器工作台，用于统一管理标签页、标签组、书签、会话和网页知识。

当前仓库处于第一阶段：先完成浏览器数据底座和安全的 AI 操作协议，再逐步接入云同步、语义检索和模型服务。

> AI 或自动化参与开发前必须先阅读 [`AGENTS.md`](AGENTS.md)，遵守浏览器权限、数据事实来源、AI 写操作、云同步和堆叠 PR 边界。

## 产品目标

- 用新标签页承载搜索、快捷网站和工作空间入口。
- 用全屏工作台管理多个窗口、标签组和浏览会话。
- 管理 Chrome/Edge 原生书签，并为云收藏库预留独立数据层。
- 通过统一 `resource` 模型对网页去重，避免标签页、书签和历史重复索引。
- 让 AI 生成可审计的结构化操作计划，由扩展验证并执行。
- 默认本地保存，正文采集、历史同步和 AI 读取均需单独授权。

## 当前已实现

- Vue 3 + TypeScript + Manifest V3 扩展骨架。
- 新标签页、标签页工作台和设置页。
- 标签页读取、切换、关闭、固定、静音和创建标签组。
- 标签页搜索、按域名聚合和批量选择。
- 本地规则版 AI 计划器：支持 GitHub 分组与静音的确认执行；重复标签当前只提供只读检测结果，不自动关闭。
- URL 规范化和追踪参数清理。
- Dexie/IndexedDB 数据库骨架。
- Chrome 109 降级兼容思路：不依赖 Side Panel API。
- CI：类型检查、测试和构建。

## 技术栈

- Vue 3、TypeScript、Pinia
- Vite、CRXJS、Manifest V3
- Dexie / IndexedDB
- Vitest
- 后续：Fastify、PostgreSQL、pgvector、Supabase Auth/Realtime/Storage

## 本地开发

```bash
pnpm install
pnpm dev
```

生产构建：

```bash
pnpm build
```

随后在 Chrome/Edge 的扩展管理页面中启用开发者模式，加载 `apps/extension/dist`。

## 文档

- [总体架构](docs/architecture.md)
- [数据模型](docs/data-model.md)
- [AI 安全与执行协议](docs/ai-security.md)
- [实施路线图](docs/roadmap.md)
- [AI 协作指南](AGENTS.md)

## 核心原则

> AI 负责理解、检索和提出建议；确定性程序负责验证和执行；用户保留最终控制权。

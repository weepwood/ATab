# ATab

ATab 是一个本地优先的 AI 浏览器工作台，用于统一管理标签页、标签组、书签、会话和网页知识。

当前仓库正在建立浏览器数据底座、安全的 AI 操作协议和可替换模型服务，后续将继续接入云同步与语义检索。

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
- Chrome/Edge 原生书签树、搜索、创建、编辑、移动和安全删除。
- 浏览会话保存、恢复、自动快照以及 JSON 导入导出。
- 本地 Mock AI Provider 与独立 Fastify AI API。
- 兼容严格 JSON Schema 输出的远程模型 Provider。
- 扩展与 API 共用操作协议、运行时校验和操作白名单。
- AI 计划风险预览、用户确认和执行前目标 URL 重校验。
- 按具体 AI 服务来源申请可撤销的主机权限。
- URL 规范化和追踪参数清理。
- Dexie/IndexedDB 本地数据库。
- Chrome 109 核心路径兼容，不依赖 Side Panel API。
- CI：类型检查、测试和构建。

## 技术栈

- Vue 3、TypeScript、Pinia
- Vite、CRXJS、Manifest V3
- Dexie / IndexedDB
- Fastify
- Vitest
- 后续：PostgreSQL、pgvector、Supabase Auth/Realtime/Storage

## 本地开发

安装依赖：

```bash
pnpm install
```

启动扩展开发环境：

```bash
pnpm dev:extension
```

启动本地 Mock AI API：

```bash
pnpm dev:api
```

完整验证：

```bash
pnpm typecheck
pnpm test
pnpm build
```

随后在 Chrome/Edge 的扩展管理页面中启用开发者模式，加载 `apps/extension/dist`。

## 文档

- [总体架构](docs/architecture.md)
- [数据模型](docs/data-model.md)
- [AI 安全与执行协议](docs/ai-security.md)
- [AI Provider 与部署](docs/ai-provider.md)
- [实施路线图](docs/roadmap.md)
- [AI 协作指南](AGENTS.md)

## 核心原则

> AI 负责理解、检索和提出建议；确定性程序负责验证和执行；用户保留最终控制权。

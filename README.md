# ATab

ATab 是一个本地优先的 AI 浏览器工作台，用于统一管理标签页、标签组、书签、会话、浏览历史和网页知识。

当前仓库正在建立浏览器数据底座、安全 AI 操作协议、可替换模型服务、增量云同步、独立云收藏库、本地统一搜索、网页资源索引与用户确认式 AI 摘要，后续将继续接入语义检索。

## 产品目标

- 用新标签页承载搜索、快捷网站和工作空间入口。
- 用全屏工作台管理多个窗口、标签组、浏览历史和浏览会话。
- 管理 Chrome/Edge 原生书签，并提供相互独立的云收藏库。
- 在一个本地入口搜索标签页、书签、云收藏、网页资料、会话和已授权历史。
- 通过统一 `resource` 模型对网页去重，避免标签页、书签和历史重复索引。
- 让 AI 生成可审计的结构化操作计划，由扩展验证并执行。
- 默认本地保存，正文采集、历史同步和 AI 读取均需单独授权。

## 当前已实现

- Vue 3 + TypeScript + Manifest V3 扩展骨架。
- 新标签页、标签页工作台和设置页。
- 标签页读取、切换、关闭、固定、静音和创建标签组。
- 标签页搜索、按域名聚合和批量选择。
- Chrome/Edge 原生书签树、搜索、创建、编辑、移动和安全删除。
- 独立云收藏库：文件夹路径、标签、备注、归档、搜索与筛选。
- 从原生书签复制导入云收藏，带预览、选择和规范化 URL 去重。
- 按需授权的浏览历史工作台：时间筛选、搜索、日期分组、单 URL 删除和保存到云收藏。
- 用户主动触发的网页正文采集：按网站申请权限、正文清洗、SHA-256 哈希和本地快照更新。
- 独立网页资料库：搜索、打开、重新采集、大小统计和安全删除。
- 用户逐条确认的 AI 网页摘要：显示目标服务和上传字符数，严格协议校验，摘要仅本地保存。
- 正文更新后的摘要过期检测，以及摘要独立删除和重新生成。
- 跨数据源统一搜索：标签页、原生书签、云收藏、网页资料、会话和已授权浏览历史。
- `Ctrl/Command + K` 搜索入口、来源筛选、键盘选择和确定性本地相关度排序。
- 浏览会话保存、恢复、自动快照以及 JSON 导入导出。
- 本地 Mock AI Provider 与独立 Fastify AI API。
- 兼容严格 JSON Schema 输出的远程模型 Provider。
- 扩展与 API 共用操作协议、摘要协议、运行时校验和操作白名单。
- AI 计划风险预览、用户确认和执行前目标 URL 重校验。
- 按具体 AI 服务来源申请可撤销的主机权限。
- Supabase 邮箱密码登录、Token 刷新和退出。
- 本地同步 Outbox、乐观版本号、幂等 changeId 和冲突队列。
- PostgreSQL/Supabase 设备表、同步实体、顺序日志、RLS 与 RPC。
- 手动会话和云收藏的跨设备推送、增量拉取和每 15 分钟后台同步。
- URL 规范化和追踪参数清理。
- Dexie/IndexedDB 本地数据库、正文快照表和摘要表。
- Chrome 109 核心路径兼容，不依赖 Side Panel API。
- CI：类型检查、测试和构建。

## 技术栈

- Vue 3、TypeScript、Pinia
- Vite、CRXJS、Manifest V3
- Dexie / IndexedDB
- Fastify
- PostgreSQL / Supabase Auth / RLS
- Vitest
- 后续：pgvector、Supabase Realtime/Storage

## 本地开发

安装依赖：

```bash
pnpm install
```

启动扩展开发环境：

```bash
pnpm dev:extension
```

启动本地 Mock AI API 和同步网关：

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
- [增量云同步](docs/cloud-sync.md)
- [云收藏与原生书签导入](docs/cloud-bookmarks.md)
- [浏览历史工作台](docs/history-workspace.md)
- [跨数据源统一搜索](docs/unified-search.md)
- [本地网页资源索引](docs/resource-index.md)
- [用户主动触发的 AI 网页摘要](docs/resource-ai-summary.md)
- [实施路线图](docs/roadmap.md)
- [AI 协作指南](AGENTS.md)

## 核心原则

> AI 负责理解、检索和提出建议；确定性程序负责验证和执行；用户保留最终控制权。

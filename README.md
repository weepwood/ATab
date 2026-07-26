# ATab

ATab 是一个本地优先的 AI 浏览器工作台，用于统一管理标签页、标签组、书签、会话和网页知识。

当前仓库处于第一阶段：先完成浏览器数据底座和安全的 AI 操作协议，再逐步接入云同步、语义检索和账号设备体系。

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
- Chrome/Edge 原生书签树读取、搜索、创建、编辑、移动和删除。
- 原生书签是唯一事实来源，不在 IndexedDB 复制影子书签库。
- 书签总根节点保持只读，默认进入第一个可写系统文件夹。
- 手动保存当前或全部普通窗口，并始终在新窗口恢复。
- 每 30 分钟生成自动会话快照，仅保留最近 10 份。
- 会话支持重命名、删除、JSON 导入导出和部分失败统计。
- 会话文件最多 2 MB、20 个窗口和 500 个可恢复标签。
- 可替换 AI Provider：本地 Mock 或本机 Fastify API 转发至 OpenAI 兼容模型。
- 模型只返回严格结构化计划；服务端重新校验目标范围、操作冲突、风险和确认要求。
- 扩展执行前复核计划 5 分钟有效期、目标 URL 和窗口快照。
- 远程模型只接收 HTTP/HTTPS 标签元数据，不接收网页正文、内部页面或本地文件路径。
- AI 创建分组和静音需要用户确认；关闭标签当前只展示删除预览，不执行。
- AI API 第一阶段只允许本机回环监听；付费 Provider 必须配置精确扩展 Origin。
- URL 规范化和追踪参数清理。
- Dexie/IndexedDB 本地数据存储。
- Chrome 109 降级兼容思路：不依赖 Side Panel API。
- CI：类型检查、测试和构建。

## 技术栈

- Vue 3、TypeScript、Pinia
- Vite、CRXJS、Manifest V3
- Dexie / IndexedDB
- Fastify 与严格共享协议包
- Vitest
- 后续：PostgreSQL、Supabase Auth、设备认证与跨设备同步

## 本地开发

```bash
pnpm install
pnpm dev
```

启动本机 AI API：

```bash
pnpm dev:api
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
- [AI Provider 部署与安全边界](docs/ai-provider-deployment.md)
- [实施路线图](docs/roadmap.md)
- [AI 协作指南](AGENTS.md)

## 核心原则

> AI 负责理解、检索和提出建议；确定性程序负责验证和执行；用户保留最终控制权。

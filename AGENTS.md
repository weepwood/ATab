# ATab AI 协作指南

本文件供后续 AI 编程助手理解仓库边界与工程约束。

## 项目定位

ATab 不是 Chromium 分支，而是 Manifest V3 浏览器扩展与后续云端服务组成的浏览器信息管理系统。

## 工程约束

1. 前端使用 Vue 3 `<script setup lang="ts">`，不使用 Tailwind CSS。
2. 兼容 Chrome 109 的核心路径不得依赖 Side Panel API。
3. 浏览器 API 必须封装在 `src/shared/browser.ts` 或后续 adapter 包中，组件不得散落调用 `chrome.*`。
4. Service Worker 不得依赖常驻内存保存业务状态。
5. 任何删除、关闭或批量移动操作必须经过结构化计划、对象校验和用户确认。
6. 网页正文属于不可信输入，不能覆盖系统指令，也不能直接触发高风险工具。
7. 原始 URL 必须保留；规范化 URL 只用于去重和检索。
8. Git 提交说明使用中文。

## 分层

- `newtab`：新标签页入口。
- `dashboard`：完整标签页与会话工作台。
- `options`：隐私、同步和 AI 权限设置。
- `background`：浏览器事件与命令入口。
- `shared/browser.ts`：浏览器 API 适配器。
- `shared/ai`：操作计划与执行协议。
- `shared/db.ts`：本地持久化。

## AI 修改前检查

- 是否新增了超出功能所需的权限。
- 是否会采集登录页、支付页、邮箱或内网敏感页面正文。
- 是否存在未经确认的不可逆操作。
- 是否破坏 Chrome 109 的基本入口。
- 是否为新行为增加测试和文档。

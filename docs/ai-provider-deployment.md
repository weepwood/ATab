# AI Provider 部署与安全边界

ATab 第一阶段采用“模型生成计划、服务端规范化、扩展复核并执行”的三层结构：

```text
浏览器扩展
  ↓ 仅 HTTP/HTTPS 标签标题、URL、状态与窗口 ID
本机 Fastify API
  ↓ 严格 JSON Schema
Mock 或 OpenAI 兼容模型服务
```

## 1. 当前部署边界

本阶段 API **只允许监听本机回环地址**：

- `127.0.0.1`
- `localhost`
- `::1`

`HOST=0.0.0.0`、局域网地址和公网地址会直接拒绝启动。原因是当前阶段尚未接入账号、设备认证和请求配额；无认证 API 不应暴露给其他设备。

公网或跨设备部署必须等待账号与设备认证阶段完成，不得通过反向代理绕过这一限制。

## 2. 启动 Mock Provider

```bash
pnpm install --no-frozen-lockfile
pnpm dev:api
```

默认配置：

```env
ATAB_AI_PROVIDER=mock
HOST=127.0.0.1
PORT=8787
```

Mock Provider 不调用外部模型，可用于验证扩展权限、结构化计划和执行门禁。

## 3. OpenAI 兼容 Provider

复制 `apps/api/.env.example` 并配置：

```env
ATAB_AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=实际密钥
AI_MODEL=实际模型名
AI_REQUEST_TIMEOUT_MS=30000
AI_ALLOWED_ORIGINS=chrome-extension://实际扩展ID
HOST=127.0.0.1
PORT=8787
```

要求：

- 模型 API Key 只存在于服务端环境变量；
- 扩展包、浏览器存储、Issue、PR、日志和 Artifact 中不得出现模型密钥；
- 非本机模型服务必须使用 HTTPS；
- 本机模型服务可以使用 `http://127.0.0.1`、`http://localhost` 或 `http://[::1]`；
- `AI_ALLOWED_ORIGINS` 必须是精确扩展 Origin，不支持通配符、路径、查询或凭据；
- 使用付费 Provider 时，未配置精确 Origin 会拒绝启动。

## 4. 扩展来源权限

扩展 Manifest 只声明可选的 HTTP/HTTPS 主机权限。设置远程 Provider 时：

1. 规范化服务地址；
2. 本机 HTTP 或远程 HTTPS 校验；
3. 只申请该服务 Origin 的 `/*` 权限；
4. 地址变化时先取得新权限，再撤销旧权限；
5. 切回本地模式或点击“撤销来源权限”时移除权限。

不会默认获得所有网站访问权限。

## 5. 发送给模型的数据

远程 Provider 当前只发送：

- 用户输入的整理指令；
- HTTP/HTTPS 标签的 ID、窗口 ID、标题、URL；
- 是否活动、固定、播放声音和静音。

不会发送：

- 网页正文；
- `chrome://`、扩展页或其他内部页面；
- `file://` 本地文件路径；
- 浏览历史、书签正文、Cookie、Token 或密码；
- 模型服务密钥。

## 6. 操作门禁

服务端和扩展均不信任模型声明：

- 操作只能使用 `CREATE_GROUP`、`MUTE_TABS` 和 `CLOSE_TABS`；
- 标签 ID 必须来自本次请求；
- 同一标签不能同时关闭并执行其他操作；
- 同一标签不能加入多个分组；
- 风险和是否需要确认由确定性代码重新计算；
- 扩展保存目标 URL 与窗口快照；
- 计划超过 5 分钟、目标关闭、URL 改变或窗口变化时拒绝执行；
- 执行途中失败后计划作废，不能重放半完成计划。

当前只执行创建分组和静音。`CLOSE_TABS` 只用于删除计划预览，等待可恢复记录与撤销入口完成后再开放。

## 7. 验证

```bash
pnpm typecheck
pnpm test
pnpm build
```

还应在真实浏览器中验证：

- 只申请单一服务 Origin；
- 更换地址后旧权限被撤销；
- `file://` 和内部页面不发送到服务端；
- 计划过期、URL 变化和窗口变化会拒绝执行；
- 删除计划按钮保持禁用；
- 服务端绑定非回环地址时拒绝启动。

# AI Provider 与受控操作计划

ATab 的 AI 能力分为三层：

1. 浏览器扩展采集当前标签的最小元数据；
2. AI API 生成结构化计划并进行服务端校验；
3. 扩展再次校验目标标签、展示预览，用户确认后调用浏览器 API。

模型不能直接访问 `chrome.tabs`、`chrome.bookmarks` 或其他浏览器能力。

## 数据流

```text
用户指令
  ↓
扩展读取当前标签 ID、标题、URL 和状态
  ↓
POST /v1/agent/plan
  ↓
Provider 生成 JSON Schema 计划草稿
  ↓
共享协议包校验操作白名单和标签 ID
  ↓
扩展重新校验响应和目标 URL
  ↓
用户查看操作预览并确认
  ↓
扩展调用 chrome.* API
```

当前允许的 AI 写操作只有：

- `CREATE_GROUP`
- `CLOSE_TABS`
- `MUTE_TABS`

新增工具必须同时修改共享协议、风险策略、服务端测试和扩展执行器。

## 本地 Mock Provider

默认模式不调用任何外部模型：

```bash
pnpm install
pnpm dev:api
```

默认监听：

```text
http://127.0.0.1:8787
```

健康检查：

```text
GET /health
```

Mock Provider 支持：

- 识别重复标签并生成关闭计划；
- 将 GitHub 页面放入“开发”标签组；
- 静音正在播放声音的标签页。

## 接入兼容 OpenAI 的模型服务

复制配置：

```bash
cp apps/api/.env.example apps/api/.env
```

填写：

```dotenv
ATAB_AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=服务端密钥
AI_MODEL=支持严格 JSON Schema 输出的模型名称
```

随后启动：

```bash
pnpm dev:api
```

API Key 只能存在于 `apps/api/.env` 或部署平台的服务端环境变量中，不能写入扩展、前端环境变量、GitHub 仓库或同步设置。

## 扩展设置

在扩展设置页中：

1. 将 Provider 模式切换为“远程 AI API”；
2. 填写 ATab API 地址；
3. 点击“测试连接”；
4. 浏览器只会请求该来源的主机权限；
5. 保存设置。

默认可开启“远程失败时回退到本地规则”。回退不会把远程返回的未验证数据继续执行。

## 来源控制

开发环境未配置 `AI_ALLOWED_ORIGINS` 时，只允许：

- `chrome-extension://` 来源；
- `http://localhost`；
- `http://127.0.0.1`；
- 对应的 HTTPS 本地来源。

生产环境应显式填写扩展来源：

```dotenv
AI_ALLOWED_ORIGINS=chrome-extension://实际扩展ID
```

如果还需要云端管理页，可用逗号增加可信来源。

## 安全边界

### 模型输出不可信

Provider 的返回值始终按 `unknown` 处理，并经过 `@atab/contracts` 运行时校验：

- 拒绝未知操作类型；
- 拒绝请求范围外的标签 ID；
- 限制操作数量和标签数量；
- `CLOSE_TABS` 自动判定为删除性操作；
- 任意写操作自动强制要求确认；
- 模型声明的风险级别不会被直接信任。

### 页面元数据不可信

标签标题和 URL 可能包含提示词注入。系统提示明确要求模型把它们视为数据，而不是指令。即使模型被诱导，服务端和扩展的操作白名单仍会阻止未知工具。

### 计划过期

扩展生成计划时记录目标标签 URL。执行前重新读取标签页；若标签已关闭或 URL 发生变化，则拒绝执行并要求重新生成计划。

### 当前限制

- 当前 API 尚未接入账号和设备令牌；公开部署前必须配合 Issue #5 的认证层或部署在受控网络中。
- 当前只发送标签元数据，不读取网页正文。
- 当前没有跨操作事务回滚；执行前会完成全部目标校验，但浏览器 API 在执行过程中仍可能发生部分失败。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
```

关键测试包括：

- 请求结构校验；
- 未知工具拒绝；
- 越界标签 ID 拒绝；
- 风险等级重新计算；
- CORS 来源限制；
- Mock Provider 计划生成。

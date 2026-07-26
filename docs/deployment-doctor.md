# 部署就绪诊断与真实服务验收

ATab 提供两层诊断：

- API `/ready`：由服务端根据当前配置生成，不访问外部模型或 Supabase；
- `scripts/doctor.mjs`：从部署端之外检查 `/health`、`/ready`，并可显式使用固定合成数据验证三类 AI 路由。

默认诊断不会调用付费模型，也不会读取浏览器标签页、书签、历史、网页正文或同步数据。

## 服务端就绪检查

```text
GET /ready
```

状态：

- `ready`：全部核心与可选能力均已配置；
- `degraded`：服务可用，但同步或嵌入等可选能力未配置；
- `not-ready`：存在阻塞部署的问题。

HTTP 状态：

- `ready` / `degraded`：200；
- `not-ready`：503。

响应只包含布尔值、安全枚举和固定检查代码，不包含：

- API Key 或 Supabase key；
- Provider、模型的完整 URL；
- 用户 ID 或邮箱；
- Token；
- 浏览器或网页数据。

当前检查：

- Provider 模式与传输安全；
- 聊天模型；
- 嵌入模型；
- Supabase 用户认证；
- 同步配置；
- CORS Origin allowlist；
- 回环或网络监听范围；
- 用户级速率限制。

## 启动安全门禁

真实服务在 `app.listen` 前执行相同检查。以下配置会直接拒绝启动：

- 禁用认证却监听 `0.0.0.0`、局域网或公网地址；
- 网络监听但没有精确 `AI_ALLOWED_ORIGINS`；
- `openai-compatible` 使用公网明文 HTTP；
- 模型 URL 包含用户名或密码；
- Supabase 认证模式缺少 URL 或 anon key；
- 缺少远程聊天模型；
- 速率限制不是正整数。

未配置同步或嵌入模型只会标记为降级；但对应功能不可用。

## 被动诊断

启动本地 API：

```bash
pnpm dev:api
```

另一个终端运行：

```bash
pnpm doctor
```

指定 endpoint：

```bash
ATAB_API_ENDPOINT=https://atab-api.example.com pnpm doctor
```

或：

```bash
pnpm doctor -- --endpoint https://atab-api.example.com
```

公网 endpoint 必须使用 HTTPS。本机 `localhost`、`127.0.0.1` 和 `::1` 可以使用 HTTP。endpoint 不允许包含用户名、密码、查询参数或 Hash。

被动模式只调用：

- `GET /health`；
- `GET /ready`。

它不会调用 AI 计划、摘要或嵌入接口。

## 主动合成验收

只有显式添加 `--active` 才会调用模型：

```bash
pnpm doctor:active
```

Supabase 认证部署从环境变量读取短期用户 Token：

```bash
ATAB_ACCESS_TOKEN='短期用户 access token' \
ATAB_API_ENDPOINT=https://atab-api.example.com \
pnpm doctor:active
```

也可以从标准输入读取，避免 Token 出现在命令历史：

```bash
printf '%s' "$ATAB_ACCESS_TOKEN" | \
  pnpm doctor -- --active --token-stdin --endpoint https://atab-api.example.com
```

不支持 `--token` 或 `--token=...` 命令行参数。

主动模式顺序验证：

1. 合成标签页的结构化计划；
2. 合成网页文本的摘要；
3. 合成查询的嵌入向量。

固定测试 URL：

```text
https://example.invalid/atab-diagnostics
```

诊断内容不来自用户浏览器，也不写入 IndexedDB、同步 Outbox 或数据库。

## JSON 输出

```bash
pnpm doctor -- --json
```

输出只包含：

- 总体状态；
- endpoint 协议和回环/网络范围；
- 被动或主动模式；
- 检查 ID；
- `pass` / `warn` / `fail`；
- 固定错误码；
- HTTP 状态；
- 耗时；
- 退出码。

不会输出完整 endpoint、Authorization、响应正文、模型内容、用户 ID 或邮箱。

## 退出码

| 退出码 | 含义 |
| --- | --- |
| 0 | 全部通过 |
| 2 | 可用但存在降级或警告 |
| 3 | endpoint、认证、版本或服务配置错误 |
| 4 | DNS、连接、TLS、超时或响应读取失败 |
| 5 | 主动合成 AI 验收失败 |

在 CI 中可以按需求接受降级：

```bash
set +e
pnpm doctor -- --json > doctor.json
code=$?
set -e

if [ "$code" -ne 0 ] && [ "$code" -ne 2 ]; then
  cat doctor.json
  exit "$code"
fi
```

## 请求超时

默认每个请求 10 秒：

```bash
pnpm doctor -- --timeout 30000
```

或：

```bash
ATAB_DOCTOR_TIMEOUT_MS=30000 pnpm doctor
```

允许范围为 1 到 120000 毫秒。响应正文上限为 1 MiB。

## 常见结果

### `sync-not-configured`

本地 AI 和浏览器工作台仍可使用，但云同步不可用。属于 warning。

### `embedding-model-missing`

聊天计划与摘要可以工作，但语义索引不可用。属于 warning；主动嵌入验收会失败。

### `authentication-required-for-network`

服务监听网络地址但认证被禁用。属于阻塞错误，服务应改为回环监听或启用 Supabase 认证。

### `cors-origin-allowlist-required`

网络部署未配置精确扩展 Origin。设置 `AI_ALLOWED_ORIGINS`，不要使用通配符。

### `remote-provider-requires-https`

远程模型地址使用明文 HTTP。只有回环模型服务允许 HTTP。

### `active-token-missing`

Supabase 认证部署执行主动验收时没有用户 Token。使用环境变量或标准输入提供短期 Token。

## 安全说明

- Doctor 不验证或打印 JWT 载荷；身份由服务端 Supabase Auth 验证；
- Doctor 不接受模型 API Key；模型密钥继续只存在 API 服务端；
- Doctor 不打印服务返回的错误 message，避免回显用户输入或内部细节；
- 主动模式可能产生模型费用，必须由操作者显式启用；
- `/ready` 是配置就绪检查，不等于外部模型和 Supabase 当前可达；外部可达性由主动 Doctor 验收补充；
- 诊断通过不代替浏览器权限、多设备同步、Chrome 109 和生产告警人工验收。

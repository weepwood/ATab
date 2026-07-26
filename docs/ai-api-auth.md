# AI API 用户认证、限流与脱敏审计

ATab 的 AI API 包含标签页操作计划、网页摘要和语义嵌入。这些接口可能触发模型费用，并接收用户主动提交的浏览器元数据或网页正文，因此 CORS 来源限制不能作为唯一安全边界。

本阶段增加可配置的 Supabase 用户认证、单进程用户级限流和不含用户原文的结构化审计。

## 认证模式

```dotenv
AI_AUTH_MODE=disabled
```

支持：

- `disabled`：不要求用户 Token，只适合受信任的本地开发环境；
- `supabase`：要求有效 Supabase 用户 Bearer Token，生产部署推荐。

当使用 `supabase` 时还必须配置：

```dotenv
SUPABASE_URL=https://project.supabase.co
SUPABASE_ANON_KEY=公开的客户端 anon key
```

服务端不会仅解析 JWT 字符串并信任其中的用户 ID，而是调用：

```text
GET {SUPABASE_URL}/auth/v1/user
Authorization: Bearer <access-token>
apikey: <anon-key>
```

只有 Supabase Auth 返回有效用户对象后，AI Provider 才会被调用。

## 扩展端令牌

ATab 扩展复用现有 Supabase 登录会话：

1. 检查本地是否存在登录会话；
2. access token 临近过期时使用 refresh token 换新；
3. 对计划、摘要和嵌入请求增加 `Authorization: Bearer ...`；
4. 没有登录会话时不伪造身份，也不把其他密钥当作用户 Token；
5. 认证模式服务端会返回明确的 `401 AUTH_REQUIRED`。

密码仍只用于登录请求，不写入本地数据库。模型 API Key 仍只存在服务端。

## 错误边界

认证相关错误：

- `401 AUTH_REQUIRED`：未提供 Bearer Token，或 Supabase 会话无效；
- `503 AUTH_NOT_CONFIGURED`：服务端启用了 Supabase 认证，但缺少 Supabase 配置；
- `502 AUTH_INVALID_RESPONSE`：Supabase Auth 响应无效；
- `502 AUTH_VERIFICATION_FAILED`：用户验证过程发生其他错误。

认证失败发生在业务请求校验和 Provider 调用之前，因此无效用户不会消耗模型调用。

## 用户级限流

```dotenv
AI_RATE_LIMIT_PER_MINUTE=60
```

三类 AI 路由共用同一用户级额度：

```text
POST /v1/agent/plan
POST /v1/ai/resources/summarize
POST /v1/ai/embeddings
```

响应包含：

```text
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
```

超过限额返回：

```text
HTTP 429
Retry-After: <seconds>
```

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "AI 请求过于频繁，请稍后重试",
    "retryAfterSeconds": 30
  }
}
```

当前实现是单 Node.js 进程内存窗口。它适合本地服务和单实例部署，但不能替代多实例生产环境中的 Redis、API Gateway 或数据库配额系统。进程重启后计数会重置。

## 脱敏审计

每次 AI 请求只记录：

```text
requestId
userId
route
provider
model?
inputCount
characterCount
status
durationMs
errorCode?
createdAt
```

不会记录：

- 用户指令原文；
- 标签页标题；
- URL；
- 网页正文；
- 搜索查询词；
- 摘要结果；
- 嵌入向量；
- access token 或 refresh token；
- Supabase anon key；
- 模型 API Key。

默认审计事件写入 Fastify 结构化日志，字段名为 `aiAudit`。测试可注入 `MemoryAiAuditSink` 验证事件内容。

状态包括：

- `success`；
- `error`；
- `unauthorized`；
- `rate-limited`。

审计写入失败不会改变原 AI 请求结果，但会单独记录服务端错误日志。

## 请求顺序

```text
收到 AI 请求
  ↓
验证 Supabase 用户身份
  ↓
按 userId 检查速率限制
  ↓
校验业务请求协议
  ↓
调用 Provider
  ↓
二次校验 Provider 输出
  ↓
写入脱敏审计事件
  ↓
返回响应
```

匿名请求、限流请求和业务校验失败也会产生不含原文的审计事件。

## 本地开发

本地 Mock API 可以使用：

```dotenv
ATAB_AI_PROVIDER=mock
AI_AUTH_MODE=disabled
AI_RATE_LIMIT_PER_MINUTE=60
```

`disabled` 不应直接用于公网部署。即使配置了严格 CORS，非浏览器客户端仍可能绕过 CORS 直接请求 API。

## 生产建议

正式部署至少还应增加：

1. Redis 或 API Gateway 分布式速率限制；
2. 每用户日/月模型费用配额；
3. Provider 超时和并发隔离；
4. 审计日志持久化、保留期和访问权限；
5. 异常调用告警；
6. API 网关 TLS、请求体上限和 WAF；
7. 用户删除账号后的审计匿名化策略；
8. 服务端密钥轮换。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
```

CI 覆盖匿名拒绝、Provider 不被调用、有效身份、限流、响应头、脱敏审计和 Supabase 用户响应解析。真实 Supabase 项目、Token 过期刷新、网络故障和多实例限流仍需集成测试。

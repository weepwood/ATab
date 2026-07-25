# 增量云同步

ATab 云同步采用“本地优先 + Outbox + 服务端版本号 + 顺序日志”的模型。

当前同步范围：

- 手动保存的浏览会话；
- 为后续云收藏和跨设备设置预留协议。

当前不上传：

- Chrome/Edge 原生书签；
- 自动会话快照；
- 浏览历史；
- 网页正文；
- 模型 API Key；
- 用户密码。

## 架构

```text
本地会话修改
  ↓ 同一 IndexedDB 事务
sessions + syncOutbox
  ↓
ATab API /v1/sync/push
  ↓ 用户 Bearer Token
Supabase RPC apply_sync_changes
  ↓
sync_entities + sync_change_log
  ↓ sequence 游标
ATab API /v1/sync/pull
  ↓
本地应用远端变更或进入冲突队列
```

## 数据库迁移

迁移文件：

```text
database/migrations/0001_sync_foundation.sql
```

它会创建：

- `sync_devices`：用户设备、最近活动和撤销状态；
- `sync_entities`：当前实体快照和版本号；
- `sync_change_log`：按全局 sequence 排序的增量日志；
- `register_sync_device`：注册或更新当前用户设备；
- `revoke_sync_device`：撤销当前用户的一台设备；
- `apply_sync_changes`：幂等推送与乐观版本检查；
- `pull_sync_changes`：按 sequence 拉取增量变更。

表启用 RLS，普通客户端只有读取自己记录的权限；写操作通过受限 RPC 完成。API 使用 Supabase anon key，并把用户自己的 Bearer Token 原样转发给 Supabase，不使用 service-role 绕过 RLS。

## 服务端配置

在 `apps/api/.env` 中设置：

```dotenv
SUPABASE_URL=https://project.supabase.co
SUPABASE_ANON_KEY=公开的客户端 anon key
```

启动：

```bash
pnpm dev:api
```

状态接口：

```text
GET /v1/sync/status
```

## 扩展配置

在扩展设置页填写：

- ATab 同步 API 地址；
- Supabase 项目地址；
- Supabase anon key；
- 当前设备名称。

点击“授权并保存同步配置”后，扩展只申请这两个来源的主机权限。

随后使用 Supabase 邮箱和密码登录。密码只用于当次认证请求，不写入 `chrome.storage.local`。扩展保存：

- access token；
- refresh token；
- access token 到期时间；
- 用户 ID 和可选邮箱。

access token 临近到期时使用 refresh token 换取新会话，并立即保存新的 refresh token。

## Outbox

手动会话的创建、重命名、导入和删除会与本地会话写入放在同一 Dexie 事务中。

`syncOutbox` 记录：

- 唯一 `changeId`；
- 实体类型和实体 ID；
- `baseVersion`；
- `upsert` 或 `delete`；
- JSON 载荷；
- 尝试次数和最近错误；
- `pending` 或 `conflict` 状态。

同一实体在尚未推送前多次修改会合并为一条 Outbox 记录，避免产生无意义的中间版本。

## 幂等与冲突

### 幂等

服务端对 `(user_id, change_id)` 建立唯一约束。客户端重复提交同一个 changeId 时返回 `duplicate`，不会重复应用。

### 乐观版本

每个变更包含 `baseVersion`：

- 当前服务端版本等于 baseVersion：应用并生成新版本；
- 不相等：返回 `conflict` 和当前服务端快照；
- 新实体的 baseVersion 为 `0`。

### 冲突选择

本地已实现两种确定性策略：

- 保留本地：以服务端当前版本作为新的 baseVersion，生成新的 changeId 后重试；
- 接受服务端：将服务端快照写入本地，并删除冲突 Outbox。

冲突不会自动采用“最后写入者获胜”，避免静默覆盖另一台设备的数据。工作台“同步中心”会列出冲突，并允许逐项选择保留本地或接受服务端版本。

## 拉取游标

客户端保存最后成功处理的 `sequence`：

- 每页最多 200 条；
- 单次后台同步最多拉取 10 页；
- 每页本地事务成功后才推进游标；
- 网络中断时，下次从最后成功游标继续。

## 后台同步

扩展每 15 分钟尝试同步一次：

- 未启用同步时跳过；
- 未登录时跳过；
- 后台失败不会影响标签页和自动快照任务；
- 错误写入本地同步状态，并保留 Outbox。

## 当前边界

- 尚未提供注册新账号、忘记密码和 OAuth 登录界面；账号需先在 Supabase 中存在。
- 原生书签不直接双向同步；后续只同步独立的云收藏实体。
- 未实现 tombstone 清理和变更日志保留策略。
- 未完成真实 Supabase 环境的迁移集成测试；当前 CI 覆盖 TypeScript 协议、API 路由和客户端构建。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
```

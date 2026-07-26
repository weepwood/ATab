# 数据模型

## 1. 统一资源模型

同一个网页可能同时出现在标签页、书签、历史、会话和稍后阅读中。ATab 通过统一 `resource` 去重：

```text
resource
├─ id
├─ original_url
├─ canonical_url
├─ canonical_url_hash
├─ title
├─ domain
├─ favicon_url
├─ content_type
├─ language
├─ content_hash
├─ summary
├─ first_seen_at
├─ last_seen_at
└─ indexed_at
```

关联实体只引用资源：

```text
tab_snapshot ─────┐
bookmark_item ────┤
history_visit ────┼── resource
session_item ─────┤
reading_item ─────┘
```

## 2. 本地 IndexedDB

当前原型包含：

- `resources`
- `sessions`
- `settings`
- `actionPlans`

后续增加同步队列、软删除墓碑和内容分块表。

## 3. 云端表规划

```text
users
devices
workspaces
resources
resource_contents
bookmark_items
bookmark_folders
history_visits
sessions
session_items
notes
todos
tags
resource_tags
resource_embeddings
agent_runs
agent_steps
action_plans
action_results
audit_logs
undo_records
sync_changes
```

## 4. URL 规范化

- 始终保留原始 URL。
- 仅删除明确的追踪参数。
- `id`、`page`、`issue`、`v` 等业务参数不得通用删除。
- 允许增加域名级规则。
- 规范化 URL 只用于去重，不用于覆盖用户保存的地址。

# 用户授权的本地语义索引与混合搜索

ATab 的语义搜索是可选能力。实时关键词搜索始终在扩展本地执行；语义索引和查询只有在用户主动操作后，才会把有限文本发送到已配置的 ATab 嵌入 API。

资源向量、相似度计算和混合结果都保存在或运行于当前浏览器，不进入云同步 Outbox。

## 设计原则

```text
本地关键词搜索：默认开启，不发送查询
语义搜索开关：默认关闭，启用本身不发送数据
资源语义索引：逐条点击、逐条确认
语义查询：每次点击“语义查找”才发送当前查询
向量保存：IndexedDB 本地保存
相似度计算：浏览器本地余弦相似度
同步：默认不上传正文、查询词或向量
```

语义服务失败不会清空或阻塞关键词搜索结果。

## 服务端配置

OpenAI-compatible 模式新增独立嵌入模型：

```dotenv
ATAB_AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=服务端密钥
AI_MODEL=聊天模型
AI_EMBEDDING_MODEL=嵌入模型
```

聊天模型和嵌入模型必须分别配置。ATab 不会在缺少 `AI_EMBEDDING_MODEL` 时回退使用聊天模型。

Mock 模式使用：

```text
atab-mock-embedding-v1
```

它通过确定性文本哈希生成 64 维、L2 归一化向量，只用于本地开发与测试。

## 共享协议

`packages/contracts/src/embedding.ts` 定义：

- `EmbeddingRequest`；
- `EmbeddingInput`；
- `EmbeddingVector`；
- `EmbeddingApiResponse`；
- 请求和响应运行时校验。

限制：

- 单批最多 16 项；
- 单项文本最多 12,000 字符；
- 单次总文本最多 100,000 字符；
- 向量维度必须在 8 到 4,096 之间；
- 所有向量必须具有相同维度；
- 响应 ID 必须和请求 ID 完全对应；
- 向量元素必须是有限数值；
- 未声明字段会被拒绝。

## API

```text
POST /v1/ai/embeddings
```

资源索引请求：

```json
{
  "purpose": "resource-index",
  "inputs": [
    {
      "id": "resource-id",
      "text": "标题、URL、描述和受限正文"
    }
  ]
}
```

查询请求：

```json
{
  "purpose": "search-query",
  "inputs": [
    {
      "id": "query",
      "text": "当前用户查询"
    }
  ]
}
```

错误边界：

- `400 INVALID_EMBEDDING_REQUEST`：请求不符合协议；
- `502 EMBEDDING_GENERATION_FAILED`：Provider 失败或输出不符合协议。

API 会再次校验数量、ID、维度和数值，不直接信任上游嵌入接口。

## 资源向量

Dexie v7 新增：

```text
resourceEmbeddings
├── resourceId
├── vector[]
├── dimensions
├── provider
├── model
├── contentHash
├── createdAt
└── updatedAt
```

每个资源当前只保存一个整体向量。生成文本包含：

- 页面标题；
- 原始 URL；
- 可选描述；
- 可选语言；
- 受限正文。

总长度最多 12,000 字符。上传前确认框会显示目标 endpoint 和实际字符数。

## 过期与模型空间

资源向量与正文哈希绑定：

```text
embedding.contentHash === resource.contentHash → 当前可用
embedding.contentHash !== resource.contentHash → 过期
```

重新采集正文不会自动重建向量，而是显示过期状态。

查询时只比较：

- 正文哈希仍有效；
- Provider 相同；
- 嵌入模型相同；
- 向量维度相同；

的资源向量，避免在不同向量空间中计算无意义相似度。

## 本地混合排序

执行顺序：

```text
输入查询
  ↓
立即执行本地关键词搜索
  ↓ 用户主动点击
发送当前查询生成查询向量
  ↓
浏览器本地计算余弦相似度
  ↓
过滤过期、异模型和低相似度结果
  ↓
按资源 ID 与关键词结果去重
  ↓
合并命中字段并重新排序
```

语义结果只覆盖“网页资料”来源。标签页、书签、会话和历史仍由本地关键词检索提供。

同一资源同时被关键词和语义命中时：

- 结果只保留一条；
- 合并关键词与语义命中字段；
- 使用较高分数并增加混合命中奖励；
- 显示语义相似度。

## 隐私边界

- 语义搜索默认关闭；
- 启用开关本身不发送内容；
- 每条资源必须主动建立索引；
- 每次查询必须主动点击语义查找；
- 本地关键词搜索词不会发送；
- 资源向量不进入同步 Outbox；
- 查询向量不持久化；
- 相似度和结果融合在浏览器本地完成；
- 网页正文仍视为不可信数据；
- 语义服务不能调用浏览器工具。

公网 API 部署仍需身份认证、速率限制、配额和审计。CORS 来源限制不能替代认证。

## 当前边界

- 每个资源只有一个整体向量，长文尚未分块；
- 没有本地嵌入模型；
- 没有跨设备向量同步；
- 没有批量重建和模型迁移工具；
- 不同嵌入模型之间不能直接复用旧向量；
- 当前混合排序仍是启发式权重，需要真实数据调参。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
```

CI 覆盖协议、Mock Provider、API、余弦相似度、文本限制、过期检测和结果融合。真实嵌入服务兼容性、成本、延迟和大型资源库性能仍需人工验收。

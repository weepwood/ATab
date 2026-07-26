import { MAX_EMBEDDING_TEXT_LENGTH } from '@atab/contracts/embedding'
import { requestEmbeddings } from './ai/embedding'
import { db } from './db'
import type {
  ResourceEmbeddingRecord,
  ResourceRecord,
} from './domain'
import type { ResourceLibraryItem } from './resourceIndex'
import type { UnifiedSearchResult } from './unifiedSearch'

const SEMANTIC_SEARCH_ENABLED_KEY = 'semantic-search-enabled'
const MIN_SEMANTIC_SIMILARITY = 0.05

export interface SemanticResourceMatch {
  resource: ResourceRecord
  similarity: number
}

export function buildResourceEmbeddingText(item: ResourceLibraryItem): string {
  const prefix = [
    `标题：${item.resource.title}`,
    `网址：${item.resource.originalUrl}`,
    item.resource.description ? `描述：${item.resource.description}` : '',
    item.resource.language ? `语言：${item.resource.language}` : '',
    '正文：',
  ].filter(Boolean).join('\n')
  const remaining = Math.max(0, MAX_EMBEDDING_TEXT_LENGTH - prefix.length - 1)
  return `${prefix}\n${item.content.text.slice(0, remaining)}`
    .slice(0, MAX_EMBEDDING_TEXT_LENGTH)
    .trim()
}

export async function createAndStoreResourceEmbedding(
  item: ResourceLibraryItem,
): Promise<ResourceEmbeddingRecord> {
  const text = buildResourceEmbeddingText(item)
  await db.resources.update(item.resource.id, { embeddingStatus: 'pending' })

  try {
    const response = await requestEmbeddings('resource-index', [{
      id: item.resource.id,
      text,
    }])
    const vector = response.embeddings[0]
    if (!vector || vector.id !== item.resource.id) {
      throw new Error('嵌入服务没有返回当前资源向量')
    }
    const currentContent = await db.resourceContents.get(item.resource.id)
    if (!currentContent || currentContent.contentHash !== item.content.contentHash) {
      throw new Error('网页正文已在向量生成期间发生变化，请基于最新内容重新建立索引')
    }

    const existing = await db.resourceEmbeddings.get(item.resource.id)
    const now = new Date().toISOString()
    const record: ResourceEmbeddingRecord = {
      resourceId: item.resource.id,
      vector: vector.vector,
      dimensions: response.dimensions,
      provider: response.provider,
      model: response.model,
      contentHash: currentContent.contentHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await db.transaction('rw', db.resources, db.resourceEmbeddings, async () => {
      await db.resourceEmbeddings.put(record)
      await db.resources.update(item.resource.id, { embeddingStatus: 'ready' })
    })
    return record
  } catch (cause) {
    const currentContent = await db.resourceContents.get(item.resource.id)
    if (currentContent?.contentHash === item.content.contentHash) {
      await db.resources.update(item.resource.id, { embeddingStatus: 'error' })
    }
    throw cause
  }
}

export async function deleteResourceEmbedding(resourceId: string): Promise<void> {
  await db.transaction('rw', db.resources, db.resourceEmbeddings, async () => {
    await db.resourceEmbeddings.delete(resourceId)
    await db.resources.update(resourceId, { embeddingStatus: 'not-requested' })
  })
}

export function isResourceEmbeddingStale(item: ResourceLibraryItem): boolean {
  return Boolean(item.embedding && item.embedding.contentHash !== item.content.contentHash)
}

export async function searchSemanticResources(query: string): Promise<SemanticResourceMatch[]> {
  const normalized = query.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (normalized.length < 2) throw new Error('语义查询至少需要 2 个字符')
  const response = await requestEmbeddings('search-query', [{
    id: 'query',
    text: normalized.slice(0, MAX_EMBEDDING_TEXT_LENGTH),
  }])
  const queryVector = response.embeddings[0]?.vector
  if (!queryVector) throw new Error('嵌入服务没有返回查询向量')

  const [resources, embeddings] = await Promise.all([
    db.resources.toArray(),
    db.resourceEmbeddings.toArray(),
  ])
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]))

  return embeddings.flatMap((embedding) => {
    const resource = resourceById.get(embedding.resourceId)
    if (!resource) return []
    if (embedding.contentHash !== resource.contentHash) return []
    if (embedding.provider !== response.provider || embedding.model !== response.model) return []
    if (embedding.dimensions !== queryVector.length) return []
    const similarity = cosineSimilarity(queryVector, embedding.vector)
    if (!Number.isFinite(similarity) || similarity < MIN_SEMANTIC_SIMILARITY) return []
    return [{ resource, similarity }]
  }).sort((a, b) => b.similarity - a.similarity).slice(0, 40)
}

export function mergeSemanticSearchResults(
  keywordResults: UnifiedSearchResult[],
  semanticResults: UnifiedSearchResult[],
  limit = 120,
): UnifiedSearchResult[] {
  const merged = new Map(keywordResults.map((result) => [result.id, result]))

  for (const semantic of semanticResults) {
    const existing = merged.get(semantic.id)
    if (!existing) {
      merged.set(semantic.id, semantic)
      continue
    }
    const matchedFields = [...new Set([
      ...existing.matchedFields,
      ...semantic.matchedFields,
    ])]
    merged.set(semantic.id, {
      ...existing,
      subtitle: semantic.subtitle,
      score: Math.max(existing.score, semantic.score) + 20,
      matchedFields,
    })
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, Math.max(1, Math.min(limit, 500)))
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return Number.NaN
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    dot += leftValue * rightValue
    leftNorm += leftValue * leftValue
    rightNorm += rightValue * rightValue
  }
  if (leftNorm === 0 || rightNorm === 0) return Number.NaN
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

export async function getSemanticSearchEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(SEMANTIC_SEARCH_ENABLED_KEY)
  return stored[SEMANTIC_SEARCH_ENABLED_KEY] === true
}

export async function setSemanticSearchEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [SEMANTIC_SEARCH_ENABLED_KEY]: enabled })
}

import { describe, expect, it } from 'vitest'
import type {
  ResourceContentRecord,
  ResourceEmbeddingRecord,
  ResourceRecord,
} from '../src/shared/domain'
import type { ResourceLibraryItem } from '../src/shared/resourceIndex'
import {
  buildResourceEmbeddingText,
  cosineSimilarity,
  isResourceEmbeddingStale,
} from '../src/shared/semanticSearch'

describe('本地语义索引与余弦检索', () => {
  it('构建受限长度的资源嵌入文本并包含元数据', () => {
    const item = makeItem('resource-1', '复杂系统', '反馈回路与涌现。'.repeat(2_000))
    const text = buildResourceEmbeddingText(item)
    expect(text.length).toBeLessThanOrEqual(12_000)
    expect(text).toContain('标题：复杂系统')
    expect(text).toContain('网址：https://example.com/article')
    expect(text).toContain('正文：')
  })

  it('计算相同、正交和相反向量的余弦相似度', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1)
  })

  it('维度不一致或零向量时返回 NaN', () => {
    expect(Number.isNaN(cosineSimilarity([1], [1, 0]))).toBe(true)
    expect(Number.isNaN(cosineSimilarity([0, 0], [1, 0]))).toBe(true)
  })

  it('按正文哈希判断资源向量是否过期', () => {
    const current = makeItem('resource-1', '示例', '正文')
    current.embedding = makeEmbedding('resource-1', 'hash')
    expect(isResourceEmbeddingStale(current)).toBe(false)

    const stale = makeItem('resource-2', '示例', '新正文')
    stale.content.contentHash = 'new-hash'
    stale.embedding = makeEmbedding('resource-2', 'old-hash')
    expect(isResourceEmbeddingStale(stale)).toBe(true)
  })
})

function makeItem(id: string, title: string, text: string): ResourceLibraryItem {
  const resource: ResourceRecord = {
    id,
    originalUrl: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    title,
    domain: 'example.com',
    description: '公开技术资料',
    language: 'zh-CN',
    contentHash: 'hash',
    firstSeenAt: '2026-07-25T00:00:00.000Z',
    lastSeenAt: '2026-07-26T00:00:00.000Z',
  }
  const content: ResourceContentRecord = {
    resourceId: id,
    text,
    excerpt: text.slice(0, 120),
    contentHash: 'hash',
    characterCount: text.length,
    wordCount: text.length,
    capturedAt: '2026-07-26T00:00:00.000Z',
  }
  return { resource, content }
}

function makeEmbedding(
  resourceId: string,
  contentHash: string,
): ResourceEmbeddingRecord {
  return {
    resourceId,
    vector: Array(8).fill(0.1),
    dimensions: 8,
    provider: 'mock',
    model: 'atab-mock-embedding-v1',
    contentHash,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
  }
}

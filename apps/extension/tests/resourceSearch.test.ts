import { describe, expect, it } from 'vitest'
import type { ResourceContentRecord, ResourceRecord } from '../src/shared/domain'
import {
  createResourceSearchDocuments,
  searchUnifiedDocuments,
} from '../src/shared/unifiedSearch'

const resource: ResourceRecord = {
  id: 'resource-1',
  originalUrl: 'https://example.com/article',
  canonicalUrl: 'https://example.com/article',
  title: '系统思维文章',
  domain: 'example.com',
  description: '关于复杂系统的公开资料',
  capturedAt: '2026-07-26T00:00:00.000Z',
  firstSeenAt: '2026-07-25T00:00:00.000Z',
  lastSeenAt: '2026-07-26T00:00:00.000Z',
}

describe('网页资料统一搜索适配器', () => {
  it('已保存正文可以参与统一搜索', () => {
    const content = makeContent('研究涌现、反馈回路和复杂适应系统。')
    const results = searchUnifiedDocuments(
      '反馈回路',
      createResourceSearchDocuments([resource], [content]),
    )
    expect(results[0]?.source).toBe('resource')
    expect(results[0]?.matchedFields).toContain('body')
  })

  it('缺少正文记录时不生成孤立搜索结果', () => {
    expect(createResourceSearchDocuments([resource], [])).toEqual([])
  })

  it('即时搜索只读取正文前五万字符', () => {
    const content = makeContent(`${'a'.repeat(50_000)}仅在末尾出现`)
    const results = searchUnifiedDocuments(
      '仅在末尾出现',
      createResourceSearchDocuments([resource], [content]),
    )
    expect(results).toEqual([])
  })
})

function makeContent(text: string): ResourceContentRecord {
  return {
    resourceId: resource.id,
    text,
    excerpt: text.slice(0, 120),
    contentHash: 'hash',
    characterCount: text.length,
    wordCount: text.length,
    capturedAt: '2026-07-26T00:00:00.000Z',
  }
}

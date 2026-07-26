import { describe, expect, it } from 'vitest'
import type {
  ResourceContentRecord,
  ResourceRecord,
  ResourceSummaryRecord,
  TabView,
} from '../src/shared/domain'
import {
  createResourceExcerpt,
  estimateWordCount,
  filterResourceLibraryItems,
  findOpenTabForResource,
  isResourceSummaryStale,
  type ResourceLibraryItem,
} from '../src/shared/resourceIndex'

describe('本地网页资源索引', () => {
  it('生成受限长度的单行摘要', () => {
    expect(createResourceExcerpt('第一段\n\n第二段   内容', 8)).toBe('第一段 第二段…')
    expect(createResourceExcerpt('短内容', 10)).toBe('短内容')
  })

  it('粗略统计中英文词元', () => {
    expect(estimateWordCount('Vue 3 管理浏览器标签')).toBe(9)
    expect(estimateWordCount('hello-world test')).toBe(2)
  })

  it('支持多关键词在元数据、正文和本地摘要中联合命中', () => {
    const item = makeItem('resource-1', '复杂系统', '研究涌现与反馈回路')
    item.summary = makeSummary('resource-1', 'hash', '摘要讨论路径依赖。')
    expect(filterResourceLibraryItems([item], '复杂 反馈')).toHaveLength(1)
    expect(filterResourceLibraryItems([item], '路径依赖')).toHaveLength(1)
    expect(filterResourceLibraryItems([item], '复杂 不存在')).toHaveLength(0)
  })

  it('按正文哈希判断摘要是否过期', () => {
    const current = makeItem('resource-1', '示例', '正文')
    current.summary = makeSummary('resource-1', 'hash', '摘要')
    expect(isResourceSummaryStale(current)).toBe(false)

    const stale = makeItem('resource-2', '示例', '新正文')
    stale.content.contentHash = 'new-hash'
    stale.summary = makeSummary('resource-2', 'old-hash', '旧摘要')
    expect(isResourceSummaryStale(stale)).toBe(true)
  })

  it('按规范化 URL 找到已打开的对应标签页', () => {
    const resource = makeItem('resource-1', '示例', '正文').resource
    const tabs: TabView[] = [{
      id: 1,
      windowId: 1,
      groupId: -1,
      title: '示例',
      url: 'https://example.com/article?utm_source=test',
      active: false,
      pinned: false,
      audible: false,
      muted: false,
    }]
    expect(findOpenTabForResource(resource, tabs)?.id).toBe(1)
  })
})

function makeItem(id: string, title: string, text: string): ResourceLibraryItem {
  const resource: ResourceRecord = {
    id,
    originalUrl: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    title,
    domain: 'example.com',
    firstSeenAt: '2026-07-25T00:00:00.000Z',
    lastSeenAt: '2026-07-26T00:00:00.000Z',
  }
  const content: ResourceContentRecord = {
    resourceId: id,
    text,
    excerpt: text,
    contentHash: 'hash',
    characterCount: text.length,
    wordCount: estimateWordCount(text),
    capturedAt: '2026-07-26T00:00:00.000Z',
  }
  return { resource, content }
}

function makeSummary(
  resourceId: string,
  contentHash: string,
  summary: string,
): ResourceSummaryRecord {
  return {
    resourceId,
    summary,
    keyPoints: ['关键点'],
    tags: ['测试'],
    provider: 'mock',
    model: 'atab-mock-v1',
    contentHash,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
  }
}

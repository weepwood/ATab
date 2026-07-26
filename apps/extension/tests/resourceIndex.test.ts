import { describe, expect, it } from 'vitest'
import type {
  ResourceContentRecord,
  ResourceRecord,
  TabView,
} from '../src/shared/domain'
import {
  createResourceExcerpt,
  estimateWordCount,
  filterResourceLibraryItems,
  findOpenTabForResource,
  type ResourceLibraryItem,
} from '../src/shared/resourceIndex'

describe('本地网页资源索引', () => {
  it('生成受限长度的单行摘要', () => {
    expect(createResourceExcerpt('第一段\n\n第二段   内容', 10)).toBe('第一段 第二段…')
    expect(createResourceExcerpt('短内容', 10)).toBe('短内容')
  })

  it('粗略统计中英文词元', () => {
    expect(estimateWordCount('Vue 3 管理浏览器标签')).toBe(9)
    expect(estimateWordCount('hello-world test')).toBe(2)
  })

  it('支持多关键词在元数据和正文中联合命中', () => {
    const items = [makeItem('resource-1', '复杂系统', '研究涌现与反馈回路')]
    expect(filterResourceLibraryItems(items, '复杂 反馈')).toHaveLength(1)
    expect(filterResourceLibraryItems(items, '复杂 不存在')).toHaveLength(0)
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

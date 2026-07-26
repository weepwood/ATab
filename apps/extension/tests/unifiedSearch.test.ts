import { describe, expect, it } from 'vitest'
import type {
  BookmarkNodeView,
  CloudBookmarkRecord,
  SessionRecord,
  TabView,
} from '../src/shared/domain'
import {
  createBookmarkSearchDocuments,
  createCloudBookmarkSearchDocuments,
  createSessionSearchDocuments,
  createTabSearchDocuments,
  searchUnifiedDocuments,
  type UnifiedSearchDocument,
} from '../src/shared/unifiedSearch'

const now = Date.UTC(2026, 6, 26, 0, 0, 0)

describe('统一搜索', () => {
  it('标题精确命中优先于 URL 和说明命中', () => {
    const documents: UnifiedSearchDocument[] = [
      makeDocument('title', 'Vue', 'https://example.com/other'),
      makeDocument('url', '前端文档', 'https://vue.example.com/'),
      {
        ...makeDocument('subtitle', '框架资料', 'https://example.com/'),
        subtitle: 'Vue 生态',
      },
    ]

    expect(searchUnifiedDocuments('vue', documents, { now }).map((item) => item.targetId))
      .toEqual(['title', 'url', 'subtitle'])
  })

  it('多个关键词必须全部命中', () => {
    const documents: UnifiedSearchDocument[] = [
      {
        ...makeDocument('match', 'Vue 文档', 'https://vuejs.org/'),
        keywords: ['前端', '框架'],
      },
      {
        ...makeDocument('partial', 'Vue 文档', 'https://vuejs.org/'),
        keywords: ['框架'],
      },
    ]

    expect(searchUnifiedDocuments('vue 前端', documents, { now }).map((item) => item.targetId))
      .toEqual(['match'])
  })

  it('当前活动标签获得有限加权', () => {
    const tabs: TabView[] = [
      makeTab(1, false),
      makeTab(2, true),
    ]
    expect(searchUnifiedDocuments('example', createTabSearchDocuments(tabs), { now })[0]?.targetId)
      .toBe('2')
  })

  it('可以按来源过滤结果', () => {
    const documents: UnifiedSearchDocument[] = [
      { ...makeDocument('tab', 'Vue', 'https://vuejs.org/'), source: 'tab' },
      { ...makeDocument('bookmark', 'Vue', 'https://vuejs.org/'), source: 'bookmark' },
    ]
    expect(searchUnifiedDocuments('vue', documents, { sources: ['bookmark'], now }))
      .toHaveLength(1)
    expect(searchUnifiedDocuments('vue', documents, { sources: ['bookmark'], now })[0]?.source)
      .toBe('bookmark')
  })

  it('原生书签适配器忽略文件夹并保留网页项', () => {
    const tree: BookmarkNodeView[] = [{
      id: '0',
      title: '',
      children: [{
        id: 'folder',
        parentId: '0',
        title: '开发',
        children: [{
          id: 'vue',
          parentId: 'folder',
          title: 'Vue',
          url: 'https://vuejs.org/',
          children: [],
        }],
      }],
    }]
    expect(createBookmarkSearchDocuments(tree).map((item) => item.targetId)).toEqual(['vue'])
  })

  it('云收藏标签和备注可以参与检索', () => {
    const record: CloudBookmarkRecord = {
      id: 'cloud',
      title: '一篇文章',
      url: 'https://example.com/article',
      canonicalUrl: 'https://example.com/article',
      folder: '学习',
      tags: ['复杂系统'],
      note: '研究涌现现象',
      archived: false,
      source: 'manual',
      createdAt: '2026-07-25T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    }
    const results = searchUnifiedDocuments(
      '涌现',
      createCloudBookmarkSearchDocuments([record]),
      { now },
    )
    expect(results[0]?.source).toBe('cloud-bookmark')
    expect(results[0]?.matchedFields).toContain('keywords')
  })

  it('会话中的标签页标题和网址可以参与检索', () => {
    const session: SessionRecord = {
      id: 'session',
      name: '开发窗口',
      kind: 'manual',
      createdAt: '2026-07-25T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
      tabCount: 1,
      windows: [{
        key: '1',
        focused: true,
        state: 'normal',
        groups: [],
        tabs: [{
          title: 'Rust 学习',
          url: 'https://www.rust-lang.org/',
          pinned: false,
          index: 0,
        }],
      }],
    }
    expect(searchUnifiedDocuments('rust', createSessionSearchDocuments([session]), { now })[0]?.targetId)
      .toBe('session')
  })
})

function makeDocument(
  targetId: string,
  title: string,
  url: string,
): UnifiedSearchDocument {
  return {
    id: `tab:${targetId}`,
    source: 'tab',
    targetId,
    action: 'open-url',
    title,
    subtitle: '测试文档',
    url,
    keywords: [],
  }
}

function makeTab(id: number, active: boolean): TabView {
  return {
    id,
    windowId: 1,
    groupId: -1,
    title: 'Example',
    url: `https://example.com/${id}`,
    active,
    pinned: false,
    audible: false,
    muted: false,
  }
}

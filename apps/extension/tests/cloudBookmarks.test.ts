import { describe, expect, it } from 'vitest'
import type { BookmarkNodeView } from '../src/shared/domain'
import {
  collectCloudBookmarkImportCandidates,
  createCloudBookmarkRecord,
  filterCloudBookmarks,
  parseCloudBookmarkPayload,
} from '../src/shared/cloudBookmarks'

const bookmarkTree: BookmarkNodeView[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: '书签栏',
        children: [
          {
            id: '2',
            parentId: '1',
            title: '开发',
            children: [
              {
                id: '3',
                parentId: '2',
                title: 'Vue',
                url: 'https://vuejs.org/?utm_source=test',
                children: [],
              },
              {
                id: '4',
                parentId: '2',
                title: 'Vue duplicate',
                url: 'https://vuejs.org/',
                children: [],
              },
              {
                id: '5',
                parentId: '2',
                title: '内部页面',
                url: 'chrome://settings/',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
]

describe('云收藏工具', () => {
  it('生成规范化记录并清理标签与文件夹', () => {
    const record = createCloudBookmarkRecord({
      title: '  Example  ',
      url: 'example.com/?utm_source=test',
      folder: ' 工作 /  前端 ',
      tags: ['Vue, AI', 'vue'],
      note: '  稍后阅读  ',
    }, '2026-07-26T00:00:00.000Z')

    expect(record.title).toBe('Example')
    expect(record.url).toBe('https://example.com/?utm_source=test')
    expect(record.canonicalUrl).toBe('https://example.com/')
    expect(record.folder).toBe('工作 / 前端')
    expect(record.tags).toEqual(['vue', 'ai'])
    expect(record.note).toBe('稍后阅读')
  })

  it('导入预览会识别已有项、树内重复并跳过内部协议', () => {
    const candidates = collectCloudBookmarkImportCandidates(bookmarkTree, [])
    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toMatchObject({
      sourceBookmarkId: '3',
      folder: '书签栏 / 开发',
      duplicate: false,
    })
    expect(candidates[1]?.duplicate).toBe(true)
  })

  it('已有规范化网址会在预览中标记为重复', () => {
    const candidates = collectCloudBookmarkImportCandidates(
      bookmarkTree,
      ['https://vuejs.org/'],
    )
    expect(candidates.every((item) => item.duplicate)).toBe(true)
  })

  it('解析远端载荷时使用服务端实体 ID 并重新规范化 URL', () => {
    const record = parseCloudBookmarkPayload('remote-id', {
      title: 'Vue',
      url: 'https://vuejs.org/?utm_campaign=x',
      folder: '技术 / 前端',
      tags: ['Vue', 'Docs'],
      note: '',
      archived: false,
      source: 'browser-bookmark',
      sourceBookmarkId: '3',
      createdAt: '2026-07-25T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    })
    expect(record.id).toBe('remote-id')
    expect(record.canonicalUrl).toBe('https://vuejs.org/')
    expect(record.tags).toEqual(['vue', 'docs'])
  })

  it('支持文件夹、归档和语义字段组合筛选', () => {
    const active = createCloudBookmarkRecord({
      title: 'Vue 文档',
      url: 'https://vuejs.org/',
      folder: '技术',
      tags: ['frontend'],
    })
    const archived = createCloudBookmarkRecord({
      title: '旧文章',
      url: 'https://example.com/old',
      folder: '阅读',
      archived: true,
    })

    expect(filterCloudBookmarks([active, archived], { query: 'frontend' })).toEqual([active])
    expect(filterCloudBookmarks([active, archived], { folder: '阅读' })).toEqual([])
    expect(filterCloudBookmarks([active, archived], { folder: '阅读', includeArchived: true })).toEqual([archived])
  })
})

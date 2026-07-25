import { describe, expect, it } from 'vitest'
import {
  flattenBookmarkTree,
  getBookmarkMoveTargets,
  normalizeBookmarkUrl,
} from '../src/shared/bookmarks'
import type { BookmarkNodeView } from '../src/shared/domain'

const tree: BookmarkNodeView[] = [
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
                url: 'https://vuejs.org/',
                children: [],
              },
            ],
          },
          {
            id: '4',
            parentId: '1',
            title: '阅读',
            children: [],
          },
        ],
      },
    ],
  },
]

describe('书签树工具', () => {
  it('按层级展开书签树', () => {
    expect(flattenBookmarkTree(tree).map(({ id, depth }) => [id, depth])).toEqual([
      ['0', 0],
      ['1', 1],
      ['2', 2],
      ['3', 3],
      ['4', 2],
    ])
  })

  it('移动文件夹时排除自身和后代目录', () => {
    expect(getBookmarkMoveTargets(tree, '1').map((node) => node.id)).toEqual(['0'])
    expect(getBookmarkMoveTargets(tree, '2').map((node) => node.id)).toEqual(['0', '1', '4'])
  })

  it('补全网址协议并拒绝危险协议', () => {
    expect(normalizeBookmarkUrl('example.com')).toBe('https://example.com/')
    expect(() => normalizeBookmarkUrl('javascript:alert(1)')).toThrow('仅支持 HTTP 或 HTTPS网址')
  })
})

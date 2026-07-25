import { describe, expect, it } from 'vitest'
import {
  createSessionRecord,
  isRestorableUrl,
  parseSessionImport,
  sessionExportFileName,
} from '../src/shared/sessions'
import type { SessionWindowSnapshot } from '../src/shared/domain'

const windows: SessionWindowSnapshot[] = [
  {
    key: '1',
    focused: true,
    state: 'normal',
    groups: [],
    tabs: [
      { title: '内部页面', url: 'chrome://settings/', pinned: false, index: 0 },
      { title: 'Vue', url: 'https://vuejs.org/', pinned: true, index: 2 },
      { title: 'Example', url: 'https://example.com/', pinned: false, index: 1 },
    ],
  },
]

describe('浏览会话工具', () => {
  it('只保留可恢复协议并按原顺序排序', () => {
    const session = createSessionRecord('测试会话', 'manual', windows, new Date('2026-07-25T00:00:00Z'))
    expect(session.tabCount).toBe(2)
    expect(session.windows[0]?.tabs.map((tab) => tab.title)).toEqual(['Example', 'Vue'])
  })

  it('识别可恢复网址', () => {
    expect(isRestorableUrl('https://example.com')).toBe(true)
    expect(isRestorableUrl('file:///tmp/demo.html')).toBe(true)
    expect(isRestorableUrl('chrome://extensions')).toBe(false)
    expect(isRestorableUrl('not a url')).toBe(false)
  })

  it('导入时生成新的本地会话标识', () => {
    const imported = parseSessionImport({
      name: '导入会话',
      windows,
    })
    expect(imported.name).toBe('导入会话')
    expect(imported.kind).toBe('manual')
    expect(imported.id).toBeTruthy()
    expect(imported.tabCount).toBe(2)
  })

  it('生成安全的导出文件名', () => {
    const session = createSessionRecord('项目/A:B', 'manual', windows)
    expect(sessionExportFileName(session)).toBe('项目-A-B.atab-session.json')
  })
})

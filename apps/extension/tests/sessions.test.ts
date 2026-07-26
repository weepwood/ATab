import { describe, expect, it } from 'vitest'
import {
  assertSessionImportTextSize,
  createSessionRecord,
  isRestorableUrl,
  parseSessionImport,
  sessionExportFileName,
  SESSION_MAX_TOTAL_TABS,
  SESSION_MAX_WINDOWS,
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

function importWindow(index: number, tabCount: number): SessionWindowSnapshot {
  return {
    key: `window-${index}`,
    focused: index === 0,
    state: 'normal',
    groups: [],
    tabs: Array.from({ length: tabCount }, (_, tabIndex) => ({
      title: `标签 ${tabIndex}`,
      url: `https://example.com/${index}/${tabIndex}`,
      pinned: false,
      index: tabIndex,
    })),
  }
}

describe('浏览会话工具', () => {
  it('只保留可恢复协议并按原顺序排序', () => {
    const session = createSessionRecord('测试会话', 'manual', windows, new Date('2026-07-25T00:00:00Z'))
    expect(session.tabCount).toBe(2)
    expect(session.windows[0]?.tabs.map((tab) => tab.title)).toEqual(['Example', 'Vue'])
  })

  it('识别可恢复网址并拒绝内部或无效网址', () => {
    expect(isRestorableUrl('https://example.com')).toBe(true)
    expect(isRestorableUrl('file:///tmp/demo.html')).toBe(true)
    expect(isRestorableUrl('chrome://extensions')).toBe(false)
    expect(isRestorableUrl('javascript:alert(1)')).toBe(false)
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

  it('拒绝超过 2 MB 的会话文本', () => {
    expect(() => assertSessionImportTextSize('x'.repeat(2 * 1024 * 1024 + 1))).toThrow('2 MB')
  })

  it('拒绝过多窗口', () => {
    const tooManyWindows = Array.from(
      { length: SESSION_MAX_WINDOWS + 1 },
      (_, index) => importWindow(index, 1),
    )
    expect(() => parseSessionImport({ name: '过多窗口', windows: tooManyWindows })).toThrow('20 个窗口')
  })

  it('拒绝总标签数超过上限', () => {
    const tooManyTabs = [importWindow(0, 200), importWindow(1, 200), importWindow(2, 101)]
    expect(tooManyTabs.reduce((count, window) => count + window.tabs.length, 0)).toBe(SESSION_MAX_TOTAL_TABS + 1)
    expect(() => parseSessionImport({ name: '过多标签', windows: tooManyTabs })).toThrow('500 个可恢复标签')
  })

  it('生成安全的导出文件名', () => {
    const session = createSessionRecord('项目/A:B', 'manual', windows)
    expect(sessionExportFileName(session)).toBe('项目-A-B.atab-session.json')
  })
})

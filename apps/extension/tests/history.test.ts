import { describe, expect, it } from 'vitest'
import {
  groupHistoryEntries,
  historyStartTime,
  toHistoryEntry,
} from '../src/shared/history'
import type { HistoryEntry } from '../src/shared/domain'

describe('浏览历史工具', () => {
  it('根据天数计算稳定的开始时间', () => {
    const now = Date.UTC(2026, 6, 26, 12, 0, 0)
    expect(historyStartTime(7, now)).toBe(now - 7 * 24 * 60 * 60 * 1_000)
  })

  it('只转换 HTTP/HTTPS 历史记录', () => {
    expect(toHistoryEntry({
      id: '1',
      title: 'Example',
      url: 'https://example.com/',
      lastVisitTime: 1_000,
      visitCount: 3,
      typedCount: 1,
    })).toEqual({
      id: '1',
      title: 'Example',
      url: 'https://example.com/',
      lastVisitTime: 1_000,
      visitCount: 3,
      typedCount: 1,
    })

    expect(toHistoryEntry({
      id: '2',
      title: '设置',
      url: 'chrome://settings/',
      lastVisitTime: 1_000,
      visitCount: 1,
      typedCount: 0,
    })).toBeNull()
  })

  it('缺少标题时使用域名作为标题', () => {
    expect(toHistoryEntry({
      id: '3',
      title: '',
      url: 'https://docs.example.com/path',
      lastVisitTime: 2_000,
      visitCount: 0,
      typedCount: 0,
    })?.title).toBe('docs.example.com')
  })

  it('按本地日期分组并保持组内倒序', () => {
    const dayOneMorning = new Date(2026, 6, 25, 8, 0, 0).getTime()
    const dayOneEvening = new Date(2026, 6, 25, 20, 0, 0).getTime()
    const dayTwo = new Date(2026, 6, 26, 9, 0, 0).getTime()
    const entries: HistoryEntry[] = [
      makeEntry('morning', dayOneMorning),
      makeEntry('day-two', dayTwo),
      makeEntry('evening', dayOneEvening),
    ]

    const groups = groupHistoryEntries(entries)
    expect(groups).toHaveLength(2)
    expect(groups[0]?.key).toBe('2026-07-26')
    expect(groups[1]?.entries.map((entry) => entry.id)).toEqual(['evening', 'morning'])
  })
})

function makeEntry(id: string, lastVisitTime: number): HistoryEntry {
  return {
    id,
    title: id,
    url: `https://example.com/${id}`,
    lastVisitTime,
    visitCount: 1,
    typedCount: 0,
  }
}

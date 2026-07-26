import { describe, expect, it } from 'vitest'
import { buildLocalPlan } from '../src/shared/ai/localPlanner'
import type { TabView } from '../src/shared/domain'

function tab(overrides: Partial<TabView>): TabView {
  return {
    id: 1,
    windowId: 1,
    groupId: -1,
    title: 'Example',
    url: 'https://example.com/',
    active: false,
    pinned: false,
    audible: false,
    muted: false,
    ...overrides,
  }
}

describe('buildLocalPlan', () => {
  it('only reports duplicate tabs and never creates a close operation in the initial prototype', () => {
    const plan = buildLocalPlan('清理重复标签', [
      tab({ id: 1, active: true, url: 'https://example.com/page?utm_source=test' }),
      tab({ id: 2, url: 'https://example.com/page' }),
    ])

    expect(plan.summary).toContain('发现 1 个')
    expect(plan.risk).toBe('read-only')
    expect(plan.requiresConfirmation).toBe(false)
    expect(plan.operations).toEqual([])
  })

  it('keeps reversible grouping behind explicit confirmation', () => {
    const plan = buildLocalPlan('把 GitHub 页面整理到开发分组', [
      tab({ id: 7, url: 'https://github.com/weepwood/ATab' }),
    ])

    expect(plan.risk).toBe('reversible')
    expect(plan.requiresConfirmation).toBe(true)
    expect(plan.operations).toEqual([
      { type: 'CREATE_GROUP', tabIds: [7], name: '开发', color: 'blue' },
    ])
  })
})

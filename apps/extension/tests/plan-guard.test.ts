import { describe, expect, it } from 'vitest'
import {
  assertPlanExecutable,
  assertPlanFresh,
  findStalePlanTargetIds,
} from '../src/shared/ai/planGuard'
import type { AiActionPlan, TabView } from '../src/shared/domain'

const plan: AiActionPlan = {
  id: 'plan-1',
  summary: '测试',
  reason: '测试',
  risk: 'reversible',
  requiresConfirmation: true,
  createdAt: '2026-07-26T00:00:00.000Z',
  operations: [{ type: 'MUTE_TABS', tabIds: [1] }],
}

const tab: TabView = {
  id: 1,
  windowId: 10,
  groupId: -1,
  title: 'Example',
  url: 'https://example.com/',
  active: true,
  pinned: false,
  audible: true,
  muted: false,
}

describe('AI 计划门禁', () => {
  it('接受五分钟内的计划并拒绝过期或未来异常时间', () => {
    expect(() => assertPlanFresh(plan, Date.parse('2026-07-26T00:04:59.000Z'))).not.toThrow()
    expect(() => assertPlanFresh(plan, Date.parse('2026-07-26T00:05:01.000Z'))).toThrow('已过期')
    expect(() => assertPlanFresh(plan, Date.parse('2026-07-25T23:58:00.000Z'))).toThrow('已过期')
  })

  it('识别标签关闭、URL 改变和窗口变化', () => {
    const targets = { 1: { url: tab.url, windowId: tab.windowId } }
    expect(findStalePlanTargetIds(targets, [tab])).toEqual([])
    expect(findStalePlanTargetIds(targets, [])).toEqual([1])
    expect(findStalePlanTargetIds(targets, [{ ...tab, url: 'https://example.com/changed' }])).toEqual([1])
    expect(findStalePlanTargetIds(targets, [{ ...tab, windowId: 11 }])).toEqual([1])
  })

  it('允许可逆操作但阻止尚无恢复记录的删除操作', () => {
    expect(() => assertPlanExecutable(plan)).not.toThrow()
    expect(() => assertPlanExecutable({
      ...plan,
      risk: 'destructive',
      operations: [{ type: 'CLOSE_TABS', tabIds: [1] }],
    })).toThrow('可恢复记录')
  })
})

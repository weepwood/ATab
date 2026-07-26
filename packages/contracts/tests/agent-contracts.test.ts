import { describe, expect, it } from 'vitest'
import {
  normalizeAgentPlanDraft,
  validateAgentPlanRequest,
} from '../src/index'

const tabs = [
  {
    id: 1,
    windowId: 10,
    title: 'Example',
    url: 'https://example.com/',
    active: true,
    pinned: false,
    audible: false,
    muted: false,
  },
]

describe('AI 共享协议', () => {
  it('验证 HTTP/HTTPS 标签与窗口 ID', () => {
    expect(validateAgentPlanRequest({ command: '整理', tabs })).toEqual({
      command: '整理',
      tabs,
      locale: undefined,
    })
    expect(() => validateAgentPlanRequest({
      command: '整理',
      tabs: [{ ...tabs[0], url: 'file:///tmp/private.html' }],
    })).toThrow('仅支持 HTTP 或 HTTPS')
  })

  it('拒绝请求范围外的标签 ID', () => {
    expect(() => normalizeAgentPlanDraft({
      summary: '关闭',
      reason: '测试',
      risk: 'read-only',
      requiresConfirmation: false,
      operations: [{ type: 'CLOSE_TABS', tabIds: [2], name: null, color: null }],
    }, [1])).toThrow('请求范围外')
  })

  it('不信任模型声明并重新计算风险与确认', () => {
    const plan = normalizeAgentPlanDraft({
      summary: '关闭重复标签',
      reason: '测试',
      risk: 'read-only',
      requiresConfirmation: false,
      operations: [{ type: 'CLOSE_TABS', tabIds: [1], name: null, color: null }],
    }, [1], new Date('2026-07-26T00:00:00Z'))

    expect(plan.risk).toBe('destructive')
    expect(plan.requiresConfirmation).toBe(true)
  })

  it('拒绝关闭与其他操作作用于同一标签', () => {
    expect(() => normalizeAgentPlanDraft({
      summary: '冲突计划',
      reason: '测试',
      risk: 'destructive',
      requiresConfirmation: true,
      operations: [
        { type: 'MUTE_TABS', tabIds: [1], name: null, color: null },
        { type: 'CLOSE_TABS', tabIds: [1], name: null, color: null },
      ],
    }, [1])).toThrow('不能同时关闭')
  })

  it('拒绝同一标签加入多个分组', () => {
    expect(() => normalizeAgentPlanDraft({
      summary: '冲突分组',
      reason: '测试',
      risk: 'reversible',
      requiresConfirmation: true,
      operations: [
        { type: 'CREATE_GROUP', tabIds: [1], name: 'A', color: 'blue' },
        { type: 'CREATE_GROUP', tabIds: [1], name: 'B', color: 'green' },
      ],
    }, [1])).toThrow('重复用于 CREATE_GROUP')
  })
})

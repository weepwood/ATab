import { describe, expect, it } from 'vitest'
import {
  normalizeAgentPlanDraft,
  parseAgentActionPlanResponse,
  validateAgentPlanRequest,
} from '../src/index'

const tabs = [
  {
    id: 10,
    title: 'GitHub',
    url: 'https://github.com/weepwood/ATab',
    active: true,
    pinned: false,
    audible: false,
    muted: false,
  },
  {
    id: 11,
    title: 'Music',
    url: 'https://example.com/music',
    active: false,
    pinned: false,
    audible: true,
    muted: false,
  },
]

describe('AI 共享协议', () => {
  it('校验并规范化计划请求', () => {
    expect(validateAgentPlanRequest({
      command: '  整理 GitHub 标签  ',
      tabs,
      locale: 'zh-CN',
    })).toEqual({
      command: '整理 GitHub 标签',
      tabs,
      locale: 'zh-CN',
    })
  })

  it('强制根据操作重新计算风险与确认要求', () => {
    const plan = normalizeAgentPlanDraft({
      summary: '关闭标签页',
      reason: '测试安全归一化',
      risk: 'read-only',
      requiresConfirmation: false,
      operations: [{
        type: 'CLOSE_TABS',
        tabIds: [10, 10],
        name: null,
        color: null,
      }],
    }, [10, 11], new Date('2026-07-25T00:00:00Z'))

    expect(plan.risk).toBe('destructive')
    expect(plan.requiresConfirmation).toBe(true)
    expect(plan.operations).toEqual([{ type: 'CLOSE_TABS', tabIds: [10] }])
    expect(plan.createdAt).toBe('2026-07-25T00:00:00.000Z')
  })

  it('拒绝模型引用请求范围外的标签 ID', () => {
    expect(() => normalizeAgentPlanDraft({
      summary: '错误计划',
      reason: '引用不存在的标签',
      risk: 'reversible',
      requiresConfirmation: true,
      operations: [{
        type: 'MUTE_TABS',
        tabIds: [999],
        name: null,
        color: null,
      }],
    }, [10, 11])).toThrow('请求范围外')
  })

  it('拒绝非白名单操作', () => {
    expect(() => parseAgentActionPlanResponse({
      summary: '危险计划',
      reason: '尝试调用未知工具',
      risk: 'destructive',
      requiresConfirmation: true,
      operations: [{
        type: 'DELETE_BOOKMARKS',
        tabIds: [10],
        name: null,
        color: null,
      }],
    }, [10, 11])).toThrow('操作白名单')
  })
})

import { describe, expect, it } from 'vitest'
import {
  validateSyncPullResponse,
  validateSyncPushRequest,
  validateSyncPushResponse,
} from '../src/sync'

const deviceId = '11111111-1111-4111-8111-111111111111'
const changeId = '22222222-2222-4222-8222-222222222222'

const validChange = {
  changeId,
  entityType: 'session',
  entityId: 'session-1',
  baseVersion: 0,
  operation: 'upsert',
  payload: { name: '工作会话' },
  clientUpdatedAt: '2026-07-25T00:00:00Z',
}

describe('增量同步协议', () => {
  it('校验并规范化推送请求', () => {
    expect(validateSyncPushRequest({
      deviceId: deviceId.toUpperCase(),
      changes: [validChange],
    })).toEqual({
      deviceId,
      changes: [{
        ...validChange,
        clientUpdatedAt: '2026-07-25T00:00:00.000Z',
      }],
    })
  })

  it('拒绝同一请求中的重复 changeId', () => {
    expect(() => validateSyncPushRequest({
      deviceId,
      changes: [validChange, validChange],
    })).toThrow('重复 changeId')
  })

  it('删除操作必须使用空载荷', () => {
    expect(() => validateSyncPushRequest({
      deviceId,
      changes: [{
        ...validChange,
        operation: 'delete',
      }],
    })).toThrow('必须为 null')
  })

  it('校验冲突响应中的服务端快照', () => {
    const response = validateSyncPushResponse({
      results: [{
        changeId,
        status: 'conflict',
        version: 3,
        sequence: null,
        serverEntity: {
          entityType: 'session',
          entityId: 'session-1',
          version: 3,
          payload: { name: '服务端版本' },
          deleted: false,
          updatedAt: '2026-07-25T01:00:00Z',
          updatedByDevice: deviceId,
        },
      }],
    })
    expect(response.results[0]?.status).toBe('conflict')
    expect(response.results[0]?.serverEntity?.version).toBe(3)
  })

  it('校验按 sequence 拉取的远端变更', () => {
    const response = validateSyncPullResponse({
      changes: [{
        sequence: 8,
        entityType: 'session',
        entityId: 'session-1',
        version: 2,
        operation: 'upsert',
        payload: { name: '更新后' },
        deleted: false,
        updatedAt: '2026-07-25T02:00:00Z',
        updatedByDevice: deviceId,
      }],
      nextSequence: 8,
      hasMore: false,
    })
    expect(response.nextSequence).toBe(8)
    expect(response.changes[0]?.operation).toBe('upsert')
  })
})

import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import type { ApiConfig } from '../src/config'
import { MockAgentProvider } from '../src/providers/mock'
import type {
  DeviceRegistrationInput,
  SyncGateway,
  SyncPullInput,
} from '../src/sync/gateway'

const deviceId = '11111111-1111-4111-8111-111111111111'
const changeId = '22222222-2222-4222-8222-222222222222'

const config: ApiConfig = {
  provider: 'mock',
  baseUrl: 'https://api.openai.com/v1',
  requestTimeoutMs: 1_000,
  allowedOrigins: [],
  host: '127.0.0.1',
  port: 8_787,
}

class TestSyncGateway implements SyncGateway {
  readonly configured = true
  lastAuthorization = ''

  async registerDevice(authorization: string, input: DeviceRegistrationInput): Promise<unknown> {
    this.lastAuthorization = authorization
    return { id: input.deviceId, name: input.name, platform: input.platform }
  }

  async revokeDevice(authorization: string, id: string): Promise<unknown> {
    this.lastAuthorization = authorization
    return id === deviceId
  }

  async push(authorization: string, id: string, changes: unknown[]): Promise<unknown> {
    this.lastAuthorization = authorization
    return {
      results: [{
        changeId,
        status: 'applied',
        version: 1,
        sequence: 5,
        serverEntity: {
          entityType: 'session',
          entityId: 'session-1',
          version: 1,
          payload: { name: '工作会话' },
          deleted: false,
          updatedAt: '2026-07-25T00:00:00Z',
          updatedByDevice: id,
        },
      }],
      received: changes.length,
    }
  }

  async pull(authorization: string, input: SyncPullInput): Promise<unknown> {
    this.lastAuthorization = authorization
    return {
      changes: [{
        sequence: input.afterSequence + 1,
        entityType: 'session',
        entityId: 'session-1',
        version: 1,
        operation: 'upsert',
        payload: { name: '工作会话' },
        deleted: false,
        updatedAt: '2026-07-25T00:00:00Z',
        updatedByDevice: input.deviceId,
      }],
      nextSequence: input.afterSequence + 1,
      hasMore: false,
    }
  }
}

function createApp(gateway: SyncGateway) {
  return buildApp({
    config,
    provider: new MockAgentProvider(),
    syncGateway: gateway,
  })
}

describe('增量同步 API', () => {
  it('缺少 Bearer Token 时拒绝同步', async () => {
    const app = await createApp(new TestSyncGateway())
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      payload: { deviceId, changes: [] },
    })
    await app.close()

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ error: { code: 'AUTH_REQUIRED' } })
  })

  it('注册设备并转发用户 Token', async () => {
    const gateway = new TestSyncGateway()
    const app = await createApp(gateway)
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sync/devices/register',
      headers: { authorization: 'Bearer user-token' },
      payload: { deviceId, name: 'Chrome on Windows', platform: 'windows' },
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(gateway.lastAuthorization).toBe('Bearer user-token')
    expect(response.json()).toMatchObject({
      device: { id: deviceId, platform: 'windows' },
    })
  })

  it('推送变更并校验 RPC 响应', async () => {
    const app = await createApp(new TestSyncGateway())
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: { authorization: 'Bearer user-token' },
      payload: {
        deviceId,
        changes: [{
          changeId,
          entityType: 'session',
          entityId: 'session-1',
          baseVersion: 0,
          operation: 'upsert',
          payload: { name: '工作会话' },
          clientUpdatedAt: '2026-07-25T00:00:00Z',
        }],
      },
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      results: [{ status: 'applied', version: 1, sequence: 5 }],
    })
  })

  it('按 sequence 拉取增量变更', async () => {
    const app = await createApp(new TestSyncGateway())
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sync/pull',
      headers: { authorization: 'Bearer user-token' },
      payload: { deviceId, afterSequence: 7, limit: 200 },
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      nextSequence: 8,
      hasMore: false,
      changes: [{ sequence: 8, entityId: 'session-1' }],
    })
  })
})

import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  validateSyncPullRequest,
  validateSyncPullResponse,
  validateSyncPushRequest,
  validateSyncPushResponse,
} from '@atab/contracts/sync'
import {
  SyncGatewayError,
  type DeviceRegistrationInput,
  type SyncGateway,
} from './gateway'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function registerSyncRoutes(
  app: FastifyInstance,
  gateway: SyncGateway,
): Promise<void> {
  app.get('/v1/sync/status', async () => ({
    configured: gateway.configured,
  }))

  app.post('/v1/sync/devices/register', async (request, reply) => {
    try {
      ensureConfigured(gateway)
      const authorization = readAuthorization(request.headers.authorization)
      const input = readDeviceRegistration(request.body)
      const device = await gateway.registerDevice(authorization, input)
      return reply.send({ device })
    } catch (cause) {
      return sendSyncError(reply, cause)
    }
  })

  app.post('/v1/sync/devices/revoke', async (request, reply) => {
    try {
      ensureConfigured(gateway)
      const authorization = readAuthorization(request.headers.authorization)
      const body = asObject(request.body, '撤销请求')
      const deviceId = readUuid(body.deviceId, 'deviceId')
      const revoked = await gateway.revokeDevice(authorization, deviceId)
      return reply.send({ revoked })
    } catch (cause) {
      return sendSyncError(reply, cause)
    }
  })

  app.post('/v1/sync/push', async (request, reply) => {
    try {
      ensureConfigured(gateway)
      const authorization = readAuthorization(request.headers.authorization)
      const input = validateSyncPushRequest(request.body)
      const response = await gateway.push(authorization, input.deviceId, input.changes)
      return reply.send(validateSyncPushResponse(response))
    } catch (cause) {
      return sendSyncError(reply, cause)
    }
  })

  app.post('/v1/sync/pull', async (request, reply) => {
    try {
      ensureConfigured(gateway)
      const authorization = readAuthorization(request.headers.authorization)
      const body = asObject(request.body, '拉取请求')
      const deviceId = readUuid(body.deviceId, 'deviceId')
      const cursor = validateSyncPullRequest({
        afterSequence: body.afterSequence,
        limit: body.limit,
      })
      const response = await gateway.pull(authorization, {
        deviceId,
        ...cursor,
      })
      return reply.send(validateSyncPullResponse(response))
    } catch (cause) {
      return sendSyncError(reply, cause)
    }
  })
}

function ensureConfigured(gateway: SyncGateway): void {
  if (!gateway.configured) {
    throw new SyncGatewayError(503, 'SYNC_NOT_CONFIGURED', '同步服务尚未配置')
  }
}

function readAuthorization(value: string | undefined): string {
  if (!value || !/^Bearer\s+\S+$/i.test(value)) {
    throw new SyncGatewayError(401, 'AUTH_REQUIRED', '缺少有效的 Bearer Token')
  }
  return value
}

function readDeviceRegistration(value: unknown): DeviceRegistrationInput {
  const input = asObject(value, '设备注册请求')
  const name = readText(input.name, 'name', 120)
  const platform = input.platform === undefined
    ? 'unknown'
    : readText(input.platform, 'platform', 60)
  return {
    deviceId: readUuid(input.deviceId, 'deviceId'),
    name,
    platform,
  }
}

function readUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} 必须是 UUID`)
  }
  return value.toLowerCase()
}

function readText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`${label} 格式无效`)
  }
  return value.trim()
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label}必须是对象`)
  }
  return value as Record<string, unknown>
}

function sendSyncError(reply: FastifyReply, cause: unknown): FastifyReply {
  if (cause instanceof SyncGatewayError) {
    return reply.code(cause.statusCode).send({
      error: { code: cause.code, message: cause.message },
    })
  }
  const message = cause instanceof Error ? cause.message : '同步请求失败'
  return reply.code(400).send({
    error: { code: 'INVALID_SYNC_REQUEST', message },
  })
}

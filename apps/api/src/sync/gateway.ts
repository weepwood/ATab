import type { ApiConfig } from '../config'

export interface DeviceRegistrationInput {
  deviceId: string
  name: string
  platform: string
}

export interface SyncPullInput {
  deviceId: string
  afterSequence: number
  limit: number
}

export interface SyncGateway {
  readonly configured: boolean
  registerDevice(authorization: string, input: DeviceRegistrationInput): Promise<unknown>
  revokeDevice(authorization: string, deviceId: string): Promise<unknown>
  push(authorization: string, deviceId: string, changes: unknown[]): Promise<unknown>
  pull(authorization: string, input: SyncPullInput): Promise<unknown>
}

export class SupabaseSyncGateway implements SyncGateway {
  readonly configured: boolean

  constructor(private readonly config: ApiConfig) {
    this.configured = Boolean(config.supabaseUrl && config.supabaseAnonKey)
  }

  registerDevice(authorization: string, input: DeviceRegistrationInput): Promise<unknown> {
    return this.rpc('register_sync_device', authorization, {
      p_device_id: input.deviceId,
      p_name: input.name,
      p_platform: input.platform,
    })
  }

  revokeDevice(authorization: string, deviceId: string): Promise<unknown> {
    return this.rpc('revoke_sync_device', authorization, {
      p_device_id: deviceId,
    })
  }

  push(authorization: string, deviceId: string, changes: unknown[]): Promise<unknown> {
    return this.rpc('apply_sync_changes', authorization, {
      p_device_id: deviceId,
      p_changes: changes,
    })
  }

  pull(authorization: string, input: SyncPullInput): Promise<unknown> {
    return this.rpc('pull_sync_changes', authorization, {
      p_device_id: input.deviceId,
      p_after_sequence: input.afterSequence,
      p_limit: input.limit,
    })
  }

  private async rpc(
    functionName: string,
    authorization: string,
    parameters: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.config.supabaseUrl || !this.config.supabaseAnonKey) {
      throw new SyncGatewayError(503, 'SYNC_NOT_CONFIGURED', '同步服务尚未配置')
    }

    const response = await fetch(
      `${this.config.supabaseUrl}/rest/v1/rpc/${functionName}`,
      {
        method: 'POST',
        headers: {
          apikey: this.config.supabaseAnonKey,
          authorization,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(parameters),
      },
    )

    const payload = await readResponse(response)
    if (!response.ok) {
      const message = readPostgrestMessage(payload) || `Supabase RPC 返回 HTTP ${response.status}`
      const status = response.status === 401 || response.status === 403 ? response.status : 502
      throw new SyncGatewayError(status, 'SYNC_RPC_FAILED', message)
    }
    return payload
  }
}

export class SyncGatewayError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SyncGatewayError'
  }
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new SyncGatewayError(
      502,
      'SYNC_INVALID_RESPONSE',
      `Supabase 返回了无法解析的响应（HTTP ${response.status}）`,
    )
  }
}

function readPostgrestMessage(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const input = value as Record<string, unknown>
  return typeof input.message === 'string' ? input.message : undefined
}

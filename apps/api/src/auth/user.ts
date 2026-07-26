import type { ApiConfig } from '../config'

export interface AiRequestIdentity {
  userId: string
  email?: string
  mode: 'disabled' | 'supabase'
}

export interface AiAuthVerifier {
  authenticate(authorization?: string): Promise<AiRequestIdentity>
}

interface SupabaseUserResponse {
  id?: string
  email?: string
  msg?: string
  message?: string
  error_description?: string
}

export class ConfiguredAiAuthVerifier implements AiAuthVerifier {
  constructor(private readonly config: ApiConfig) {}

  async authenticate(authorization?: string): Promise<AiRequestIdentity> {
    if (this.config.authMode !== 'supabase') {
      return { userId: 'local-development', mode: 'disabled' }
    }
    if (!this.config.supabaseUrl || !this.config.supabaseAnonKey) {
      throw new AiAuthError(
        503,
        'AUTH_NOT_CONFIGURED',
        'AI_AUTH_MODE=supabase，但 Supabase 地址或 anon key 尚未配置',
      )
    }

    const supabaseUrl = this.config.supabaseUrl
    const supabaseAnonKey = this.config.supabaseAnonKey
    const bearer = readBearerAuthorization(authorization)
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        authorization: bearer,
        accept: 'application/json',
      },
    })
    const payload = await readSupabaseUser(response)
    if (!response.ok) {
      throw new AiAuthError(
        401,
        'AUTH_REQUIRED',
        payload.error_description
          || payload.msg
          || payload.message
          || 'Supabase 用户会话无效或已过期',
      )
    }
    if (!payload.id || typeof payload.id !== 'string') {
      throw new AiAuthError(502, 'AUTH_INVALID_RESPONSE', 'Supabase 用户响应缺少用户 ID')
    }

    const identity: AiRequestIdentity = {
      userId: payload.id,
      mode: 'supabase',
    }
    if (typeof payload.email === 'string') identity.email = payload.email
    return identity
  }
}

export class AiAuthError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AiAuthError'
  }
}

function readBearerAuthorization(value: string | undefined): string {
  if (!value || !/^Bearer\s+\S+$/i.test(value.trim())) {
    throw new AiAuthError(401, 'AUTH_REQUIRED', '请先登录 ATab 账号后再调用 AI 服务')
  }
  return value.trim()
}

async function readSupabaseUser(response: Response): Promise<SupabaseUserResponse> {
  const text = await response.text()
  if (!text) return {}
  try {
    const value = JSON.parse(text) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    return value as SupabaseUserResponse
  } catch {
    throw new AiAuthError(
      502,
      'AUTH_INVALID_RESPONSE',
      `Supabase Auth 返回了无法解析的响应（HTTP ${response.status}）`,
    )
  }
}

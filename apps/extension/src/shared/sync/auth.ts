import {
  clearSyncAuthSession,
  getSyncAuthSession,
  normalizeHttpEndpoint,
  saveSyncAuthSession,
  type SyncAuthSession,
  type SyncSettings,
} from './settings'

interface SupabaseAuthResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  user?: {
    id?: string
    email?: string
  }
  error?: string
  error_description?: string
  msg?: string
}

export async function signInWithPassword(
  settings: SyncSettings,
  email: string,
  password: string,
): Promise<SyncAuthSession> {
  if (!email.trim() || !password) throw new Error('请输入邮箱和密码')
  const response = await requestAuth(settings, 'password', {
    email: email.trim(),
    password,
  })
  const session = parseAuthSession(response)
  await saveSyncAuthSession(session)
  return session
}

export async function getValidSyncAccessToken(
  settings: SyncSettings,
): Promise<string> {
  const session = await getSyncAuthSession()
  if (!session) throw new Error('请先登录同步账号')
  if (session.expiresAt - Date.now() > 60_000) return session.accessToken

  const response = await requestAuth(settings, 'refresh_token', {
    refresh_token: session.refreshToken,
  })
  const refreshed = parseAuthSession(response, session)
  await saveSyncAuthSession(refreshed)
  return refreshed.accessToken
}

export async function signOutSyncAccount(settings: SyncSettings): Promise<void> {
  const session = await getSyncAuthSession()
  try {
    if (session) {
      const supabaseUrl = normalizeHttpEndpoint(settings.supabaseUrl, 'Supabase 地址')
      await fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: settings.supabaseAnonKey,
          authorization: `Bearer ${session.accessToken}`,
        },
        credentials: 'omit',
      })
    }
  } finally {
    await clearSyncAuthSession()
  }
}

async function requestAuth(
  settings: SyncSettings,
  grantType: 'password' | 'refresh_token',
  body: Record<string, string>,
): Promise<SupabaseAuthResponse> {
  const supabaseUrl = normalizeHttpEndpoint(settings.supabaseUrl, 'Supabase 地址')
  if (!settings.supabaseAnonKey.trim()) throw new Error('缺少 Supabase anon key')

  const response = await fetchWithTimeout(
    `${supabaseUrl}/auth/v1/token?grant_type=${grantType}`,
    {
      method: 'POST',
      headers: {
        apikey: settings.supabaseAnonKey,
        'content-type': 'application/json',
      },
      credentials: 'omit',
      body: JSON.stringify(body),
    },
    20_000,
  )
  const payload = await readAuthResponse(response)
  if (!response.ok) {
    throw new Error(
      payload.error_description
      || payload.msg
      || payload.error
      || `Supabase Auth 返回 HTTP ${response.status}`,
    )
  }
  return payload
}

function parseAuthSession(
  payload: SupabaseAuthResponse,
  previous?: SyncAuthSession,
): SyncAuthSession {
  if (!payload.access_token || !payload.refresh_token) {
    throw new Error('Supabase Auth 没有返回完整会话')
  }
  const userId = payload.user?.id || previous?.userId
  if (!userId) throw new Error('Supabase Auth 响应缺少用户 ID')

  const expiresAt = typeof payload.expires_at === 'number'
    ? payload.expires_at * 1_000
    : Date.now() + Math.max(payload.expires_in ?? 3_600, 60) * 1_000

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt,
    userId,
    email: payload.user?.email || previous?.email,
  }
}

async function readAuthResponse(response: Response): Promise<SupabaseAuthResponse> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as SupabaseAuthResponse
  } catch {
    throw new Error(`Supabase Auth 返回了无法解析的响应（HTTP ${response.status}）`)
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error(`认证请求超过 ${timeoutMs}ms`)
    }
    throw cause
  } finally {
    globalThis.clearTimeout(timer)
  }
}

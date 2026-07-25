export interface SyncSettings {
  enabled: boolean
  apiEndpoint: string
  supabaseUrl: string
  supabaseAnonKey: string
  deviceId: string
  deviceName: string
  platform: string
}

export interface SyncAuthSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  userId: string
  email?: string
}

const DEFAULT_API_ENDPOINT = 'http://127.0.0.1:8787'

export async function getSyncSettings(): Promise<SyncSettings> {
  const value = await chrome.storage.local.get(['syncSettings'])
  const input = isRecord(value.syncSettings) ? value.syncSettings : {}
  const settings: SyncSettings = {
    enabled: input.enabled === true,
    apiEndpoint: typeof input.apiEndpoint === 'string' && input.apiEndpoint.trim()
      ? input.apiEndpoint.trim()
      : DEFAULT_API_ENDPOINT,
    supabaseUrl: typeof input.supabaseUrl === 'string' ? input.supabaseUrl.trim() : '',
    supabaseAnonKey: typeof input.supabaseAnonKey === 'string' ? input.supabaseAnonKey.trim() : '',
    deviceId: typeof input.deviceId === 'string' && input.deviceId
      ? input.deviceId
      : crypto.randomUUID(),
    deviceName: typeof input.deviceName === 'string' && input.deviceName.trim()
      ? input.deviceName.trim()
      : defaultDeviceName(),
    platform: typeof input.platform === 'string' && input.platform.trim()
      ? input.platform.trim()
      : readPlatform(),
  }

  if (settings.deviceId !== input.deviceId) {
    await chrome.storage.local.set({ syncSettings: settings })
  }
  return settings
}

export async function saveSyncSettings(settings: SyncSettings): Promise<void> {
  const normalized: SyncSettings = {
    enabled: settings.enabled,
    apiEndpoint: normalizeHttpEndpoint(settings.apiEndpoint, '同步 API 地址'),
    supabaseUrl: normalizeHttpEndpoint(settings.supabaseUrl, 'Supabase 地址'),
    supabaseAnonKey: settings.supabaseAnonKey.trim(),
    deviceId: settings.deviceId,
    deviceName: settings.deviceName.trim(),
    platform: settings.platform.trim() || readPlatform(),
  }
  if (!normalized.supabaseAnonKey) throw new Error('请输入 Supabase anon key')
  if (!normalized.deviceName) throw new Error('设备名称不能为空')
  await chrome.storage.local.set({ syncSettings: normalized })
}

export async function requestSyncHostPermissions(settings: SyncSettings): Promise<boolean> {
  const origins = [
    permissionPattern(settings.apiEndpoint),
    permissionPattern(settings.supabaseUrl),
  ]
  return chrome.permissions.request({ origins: [...new Set(origins)] })
}

export async function getSyncAuthSession(): Promise<SyncAuthSession | null> {
  const value = await chrome.storage.local.get('syncAuth')
  if (!isRecord(value.syncAuth)) return null
  const input = value.syncAuth
  if (
    typeof input.accessToken !== 'string'
    || typeof input.refreshToken !== 'string'
    || typeof input.expiresAt !== 'number'
    || typeof input.userId !== 'string'
  ) return null

  return {
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt,
    userId: input.userId,
    email: typeof input.email === 'string' ? input.email : undefined,
  }
}

export async function saveSyncAuthSession(session: SyncAuthSession): Promise<void> {
  await chrome.storage.local.set({ syncAuth: session })
}

export async function clearSyncAuthSession(): Promise<void> {
  await chrome.storage.local.remove('syncAuth')
}

export function normalizeHttpEndpoint(value: string, label = '服务地址'): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label}仅支持 HTTP 或 HTTPS`)
  }
  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/$/, '')
}

function permissionPattern(endpoint: string): string {
  const url = new URL(normalizeHttpEndpoint(endpoint))
  return `${url.origin}/*`
}

function defaultDeviceName(): string {
  return `ATab · ${readPlatform()}`
}

function readPlatform(): string {
  const platform = navigator.userAgentData?.platform || navigator.platform || 'browser'
  return platform.toLowerCase().slice(0, 60)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

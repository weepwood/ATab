export type AiProviderMode = 'mock' | 'openai-compatible'

export interface ApiConfig {
  provider: AiProviderMode
  baseUrl: string
  apiKey?: string
  model?: string
  requestTimeoutMs: number
  allowedOrigins: string[]
  host: string
  port: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const provider = env.ATAB_AI_PROVIDER === 'openai-compatible'
    ? 'openai-compatible'
    : 'mock'
  const host = env.HOST?.trim() || '127.0.0.1'
  if (!isLoopbackHost(host)) {
    throw new Error('第一阶段 AI API 只允许监听 localhost、127.0.0.1 或 ::1；公网部署需要账号和设备认证')
  }

  const allowedOrigins = (env.AI_ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter((origin): origin is string => Boolean(origin))

  if (provider === 'openai-compatible' && allowedOrigins.length === 0) {
    throw new Error('openai-compatible 模式必须配置 AI_ALLOWED_ORIGINS 为精确扩展 Origin')
  }

  return {
    provider,
    baseUrl: normalizeUpstreamUrl(env.AI_BASE_URL || 'https://api.openai.com/v1'),
    apiKey: env.AI_API_KEY?.trim() || undefined,
    model: env.AI_MODEL?.trim() || undefined,
    requestTimeoutMs: readPositiveInteger(env.AI_REQUEST_TIMEOUT_MS, 30_000),
    allowedOrigins,
    host,
    port: readPort(env.PORT, 8_787),
  }
}

function normalizeUpstreamUrl(value: string): string {
  const url = new URL(value.trim())
  if (url.username || url.password) throw new Error('AI_BASE_URL 不得包含账号或密码')
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('AI_BASE_URL 仅支持 HTTP 或 HTTPS')
  }
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new Error('非本机模型服务必须使用 HTTPS')
  }
  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/$/, '')
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim().replace(/\/$/, '')
  if (!trimmed) return null
  const url = new URL(trimmed)
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash || url.username || url.password) {
    throw new Error('AI_ALLOWED_ORIGINS 必须是精确 Origin，不得包含路径、查询、Hash 或凭据')
  }
  if (!['http:', 'https:', 'chrome-extension:'].includes(url.protocol)) {
    throw new Error('AI_ALLOWED_ORIGINS 仅支持 HTTP、HTTPS 或 chrome-extension Origin')
  }
  return url.origin === 'null' && url.protocol === 'chrome-extension:'
    ? `${url.protocol}//${url.hostname}`
    : url.origin
}

function isLoopbackHost(value: string): boolean {
  const normalized = value.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readPort(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535 ? parsed : fallback
}

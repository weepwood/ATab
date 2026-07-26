export type AiProviderMode = 'mock' | 'openai-compatible'
export type AiAuthMode = 'disabled' | 'supabase'

export interface ApiConfig {
  provider: AiProviderMode
  authMode: AiAuthMode
  baseUrl: string
  apiKey?: string
  model?: string
  embeddingModel?: string
  requestTimeoutMs: number
  rateLimitPerMinute: number
  allowedOrigins: string[]
  supabaseUrl?: string
  supabaseAnonKey?: string
  host: string
  port: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const provider = env.ATAB_AI_PROVIDER === 'openai-compatible'
    ? 'openai-compatible'
    : 'mock'
  const authMode = env.AI_AUTH_MODE === 'supabase' ? 'supabase' : 'disabled'

  return {
    provider,
    authMode,
    baseUrl: (env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: env.AI_API_KEY?.trim() || undefined,
    model: env.AI_MODEL?.trim() || undefined,
    embeddingModel: env.AI_EMBEDDING_MODEL?.trim() || undefined,
    requestTimeoutMs: readPositiveInteger(env.AI_REQUEST_TIMEOUT_MS, 30_000),
    rateLimitPerMinute: readPositiveInteger(env.AI_RATE_LIMIT_PER_MINUTE, 60),
    allowedOrigins: (env.AI_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
    supabaseUrl: env.SUPABASE_URL?.trim().replace(/\/$/, '') || undefined,
    supabaseAnonKey: env.SUPABASE_ANON_KEY?.trim() || undefined,
    host: env.HOST?.trim() || '127.0.0.1',
    port: readPort(env.PORT, 8_787),
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readPort(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) return fallback
  return parsed
}

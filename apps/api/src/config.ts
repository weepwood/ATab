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

  return {
    provider,
    baseUrl: (env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: env.AI_API_KEY?.trim() || undefined,
    model: env.AI_MODEL?.trim() || undefined,
    requestTimeoutMs: readPositiveInteger(env.AI_REQUEST_TIMEOUT_MS, 30_000),
    allowedOrigins: (env.AI_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
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

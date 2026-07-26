import type { ApiConfig } from './config'

export type ReadinessLevel = 'pass' | 'warn' | 'fail'
export type ReadinessStatus = 'ready' | 'degraded' | 'not-ready'

export interface ReadinessCheck {
  level: ReadinessLevel
  code: string
  configured: boolean
}

export interface ReadinessReport {
  status: ReadinessStatus
  checks: {
    provider: ReadinessCheck & { mode: ApiConfig['provider'] }
    chatModel: ReadinessCheck
    embeddingModel: ReadinessCheck
    authentication: ReadinessCheck & { mode: 'disabled' | 'supabase' }
    sync: ReadinessCheck
    cors: ReadinessCheck & { restricted: boolean }
    transport: ReadinessCheck & { exposure: 'loopback' | 'network' }
    rateLimit: ReadinessCheck
  }
}

export function createReadinessReport(config: ApiConfig): ReadinessReport {
  const authMode = config.authMode === 'supabase' ? 'supabase' : 'disabled'
  const loopback = isLoopbackHost(config.host)
  const remoteProvider = config.provider === 'openai-compatible'
  const providerUrlSafe = !remoteProvider || isSecureOrLoopbackHttpUrl(config.baseUrl)
  const authConfigured = authMode === 'disabled'
    || Boolean(config.supabaseUrl && config.supabaseAnonKey)
  const corsRestricted = config.allowedOrigins.length > 0
  const networkExposureSafe = loopback || authMode === 'supabase'
  const corsSafe = loopback || corsRestricted
  const rateLimitConfigured = Number.isInteger(config.rateLimitPerMinute)
    && (config.rateLimitPerMinute ?? 0) > 0
  const syncConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey)

  const checks: ReadinessReport['checks'] = {
    provider: {
      level: providerUrlSafe ? 'pass' : 'fail',
      code: providerUrlSafe ? 'provider-configured' : 'provider-transport-insecure',
      configured: providerUrlSafe,
      mode: config.provider,
    },
    chatModel: {
      level: remoteProvider && !config.model ? 'fail' : 'pass',
      code: remoteProvider && !config.model ? 'chat-model-missing' : 'chat-model-configured',
      configured: !remoteProvider || Boolean(config.model),
    },
    embeddingModel: {
      level: remoteProvider && !config.embeddingModel ? 'warn' : 'pass',
      code: remoteProvider && !config.embeddingModel
        ? 'embedding-model-missing'
        : 'embedding-model-configured',
      configured: !remoteProvider || Boolean(config.embeddingModel),
    },
    authentication: {
      level: authConfigured && networkExposureSafe ? 'pass' : 'fail',
      code: !authConfigured
        ? 'authentication-config-missing'
        : networkExposureSafe
          ? 'authentication-safe'
          : 'authentication-required-for-network',
      configured: authConfigured && networkExposureSafe,
      mode: authMode,
    },
    sync: {
      level: syncConfigured ? 'pass' : 'warn',
      code: syncConfigured ? 'sync-configured' : 'sync-not-configured',
      configured: syncConfigured,
    },
    cors: {
      level: corsSafe ? 'pass' : 'fail',
      code: corsSafe ? 'cors-safe' : 'cors-origin-allowlist-required',
      configured: corsSafe,
      restricted: corsRestricted,
    },
    transport: {
      level: providerUrlSafe ? 'pass' : 'fail',
      code: providerUrlSafe ? 'transport-safe' : 'remote-provider-requires-https',
      configured: providerUrlSafe,
      exposure: loopback ? 'loopback' : 'network',
    },
    rateLimit: {
      level: rateLimitConfigured ? 'pass' : 'fail',
      code: rateLimitConfigured ? 'rate-limit-configured' : 'rate-limit-invalid',
      configured: rateLimitConfigured,
    },
  }

  const levels = Object.values(checks).map((check) => check.level)
  const status: ReadinessStatus = levels.includes('fail')
    ? 'not-ready'
    : levels.includes('warn')
      ? 'degraded'
      : 'ready'

  return { status, checks }
}

export function assertSafeStartupConfig(config: ApiConfig): void {
  const report = createReadinessReport(config)
  const blocking = Object.entries(report.checks)
    .filter(([, check]) => check.level === 'fail')
    .map(([name, check]) => `${name}:${check.code}`)
  if (blocking.length > 0) {
    throw new Error(`ATab API 配置不安全或不完整：${blocking.join(', ')}`)
  }
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
}

export function isSecureOrLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.username || url.password) return false
    if (url.protocol === 'https:') return true
    if (url.protocol !== 'http:') return false
    return isLoopbackHost(url.hostname)
  } catch {
    return false
  }
}

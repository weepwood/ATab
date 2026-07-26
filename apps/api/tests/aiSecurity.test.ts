import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app'
import {
  MemoryAiAuditSink,
  type AiAuditEvent,
} from '../src/auth/audit'
import { InMemoryAiRateLimiter } from '../src/auth/rateLimiter'
import {
  AiAuthError,
  ConfiguredAiAuthVerifier,
  type AiAuthVerifier,
} from '../src/auth/user'
import type { ApiConfig } from '../src/config'
import { MockAgentProvider } from '../src/providers/mock'

const baseConfig: ApiConfig = {
  provider: 'mock',
  authMode: 'supabase',
  baseUrl: 'https://api.openai.com/v1',
  requestTimeoutMs: 1_000,
  rateLimitPerMinute: 60,
  allowedOrigins: [],
  supabaseUrl: 'https://project.supabase.co',
  supabaseAnonKey: 'anon-key',
  host: '127.0.0.1',
  port: 8_787,
}

const planPayload = {
  command: '整理 GitHub 标签页',
  tabs: [{
    id: 10,
    title: 'GitHub 私密项目标题',
    url: 'https://github.com/weepwood/private-project?token=secret',
    active: true,
    pinned: false,
    audible: false,
    muted: false,
  }],
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AI API 用户认证、限流与审计', () => {
  it('认证失败时返回 401 且不会调用 Provider', async () => {
    const provider = new MockAgentProvider()
    const generatePlan = vi.spyOn(provider, 'generatePlan')
    const audit = new MemoryAiAuditSink()
    const authVerifier: AiAuthVerifier = {
      async authenticate() {
        throw new AiAuthError(401, 'AUTH_REQUIRED', '请先登录')
      },
    }
    const app = await buildApp({
      config: baseConfig,
      provider,
      authVerifier,
      auditSink: audit,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/plan',
      payload: planPayload,
    })
    await app.close()

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      error: { code: 'AUTH_REQUIRED' },
    })
    expect(generatePlan).not.toHaveBeenCalled()
    expect(audit.events).toHaveLength(1)
    expect(audit.events[0]).toMatchObject({
      userId: 'anonymous',
      route: 'agent-plan',
      status: 'unauthorized',
      inputCount: 0,
      characterCount: 0,
      errorCode: 'AUTH_REQUIRED',
    })
  })

  it('同一用户超过限额时返回 429 并保留限流审计', async () => {
    const audit = new MemoryAiAuditSink()
    const authVerifier: AiAuthVerifier = {
      async authenticate() {
        return { userId: 'user-1', email: 'user@example.com', mode: 'supabase' }
      },
    }
    const app = await buildApp({
      config: baseConfig,
      provider: new MockAgentProvider(),
      authVerifier,
      rateLimiter: new InMemoryAiRateLimiter(1, 60_000),
      auditSink: audit,
    })

    const first = await app.inject({
      method: 'POST',
      url: '/v1/agent/plan',
      headers: { authorization: 'Bearer valid-token' },
      payload: planPayload,
    })
    const second = await app.inject({
      method: 'POST',
      url: '/v1/agent/plan',
      headers: { authorization: 'Bearer valid-token' },
      payload: planPayload,
    })
    await app.close()

    expect(first.statusCode).toBe(200)
    expect(first.headers['x-ratelimit-limit']).toBe('1')
    expect(first.headers['x-ratelimit-remaining']).toBe('0')
    expect(second.statusCode).toBe(429)
    expect(second.headers['retry-after']).toBeDefined()
    expect(second.json()).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    })
    expect(audit.events.map((event) => event.status)).toEqual(['success', 'rate-limited'])
  })

  it('审计事件不包含正文、查询原文、URL、Token 或密钥字段', async () => {
    const audit = new MemoryAiAuditSink()
    const authVerifier: AiAuthVerifier = {
      async authenticate() {
        return { userId: 'user-1', mode: 'supabase' }
      },
    }
    const app = await buildApp({
      config: baseConfig,
      provider: new MockAgentProvider(),
      authVerifier,
      auditSink: audit,
    })

    await app.inject({
      method: 'POST',
      url: '/v1/agent/plan',
      headers: { authorization: 'Bearer highly-sensitive-token' },
      payload: planPayload,
    })
    await app.close()

    const serialized = JSON.stringify(audit.events)
    expect(serialized).not.toContain(planPayload.command)
    expect(serialized).not.toContain(planPayload.tabs[0].title)
    expect(serialized).not.toContain(planPayload.tabs[0].url)
    expect(serialized).not.toContain('highly-sensitive-token')
    expect(Object.keys(audit.events[0] as AiAuditEvent).sort()).toEqual([
      'characterCount',
      'createdAt',
      'durationMs',
      'inputCount',
      'model',
      'provider',
      'requestId',
      'route',
      'status',
      'userId',
    ])
  })

  it('Supabase 验证器要求 Bearer Token 并验证用户响应', async () => {
    const verifier = new ConfiguredAiAuthVerifier(baseConfig)
    await expect(verifier.authenticate()).rejects.toMatchObject({
      statusCode: 401,
      code: 'AUTH_REQUIRED',
    })

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        apikey: 'anon-key',
        authorization: 'Bearer valid-token',
      })
      return new Response(JSON.stringify({
        id: 'user-123',
        email: 'user@example.com',
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(verifier.authenticate('Bearer valid-token')).resolves.toEqual({
      userId: 'user-123',
      email: 'user@example.com',
      mode: 'supabase',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('supabase 认证模式缺少服务配置时返回 503', async () => {
    const verifier = new ConfiguredAiAuthVerifier({
      ...baseConfig,
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
    })
    await expect(verifier.authenticate('Bearer token')).rejects.toMatchObject({
      statusCode: 503,
      code: 'AUTH_NOT_CONFIGURED',
    })
  })
})

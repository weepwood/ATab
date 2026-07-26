import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import type { ApiConfig } from '../src/config'
import {
  assertSafeStartupConfig,
  createReadinessReport,
  isLoopbackHost,
  isSecureOrLoopbackHttpUrl,
} from '../src/readiness'
import { registerReadinessRoute } from '../src/readinessRoute'

const localMockConfig: ApiConfig = {
  provider: 'mock',
  authMode: 'disabled',
  baseUrl: 'https://api.openai.com/v1',
  requestTimeoutMs: 30_000,
  rateLimitPerMinute: 60,
  allowedOrigins: [],
  host: '127.0.0.1',
  port: 8_787,
}

describe('部署就绪检查', () => {
  it('本地 Mock 服务可以启动，并把未配置同步标记为降级而非阻塞', () => {
    const report = createReadinessReport(localMockConfig)
    expect(report.status).toBe('degraded')
    expect(report.checks.authentication.level).toBe('pass')
    expect(report.checks.transport.level).toBe('pass')
    expect(report.checks.sync).toMatchObject({
      level: 'warn',
      code: 'sync-not-configured',
    })
    expect(() => assertSafeStartupConfig(localMockConfig)).not.toThrow()
  })

  it('拒绝无认证服务监听非回环地址', () => {
    const config: ApiConfig = {
      ...localMockConfig,
      host: '0.0.0.0',
    }
    const report = createReadinessReport(config)
    expect(report.status).toBe('not-ready')
    expect(report.checks.authentication.code).toBe('authentication-required-for-network')
    expect(report.checks.cors.code).toBe('cors-origin-allowlist-required')
    expect(() => assertSafeStartupConfig(config)).toThrow(/authentication-required-for-network/)
  })

  it('公网部署使用 Supabase 认证和精确 Origin 时可以就绪', () => {
    const config: ApiConfig = {
      provider: 'openai-compatible',
      authMode: 'supabase',
      baseUrl: 'https://models.example.invalid/v1',
      apiKey: 'server-only-key',
      model: 'chat-model',
      embeddingModel: 'embedding-model',
      requestTimeoutMs: 30_000,
      rateLimitPerMinute: 60,
      allowedOrigins: ['chrome-extension://abcdefghijklmnopabcdefghijklmnop'],
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'anon-key',
      host: '0.0.0.0',
      port: 8_787,
    }
    const report = createReadinessReport(config)
    expect(report.status).toBe('ready')
    expect(report.checks.cors.restricted).toBe(true)
    expect(report.checks.transport.exposure).toBe('network')
    expect(() => assertSafeStartupConfig(config)).not.toThrow()
  })

  it('拒绝公网明文模型服务和带凭据的模型 URL', () => {
    expect(isSecureOrLoopbackHttpUrl('http://models.example.invalid/v1')).toBe(false)
    expect(isSecureOrLoopbackHttpUrl('https://user:secret@models.example.invalid/v1')).toBe(false)
    expect(isSecureOrLoopbackHttpUrl('http://127.0.0.1:11434/v1')).toBe(true)
    expect(isSecureOrLoopbackHttpUrl('https://models.example.invalid/v1')).toBe(true)
  })

  it('只把真正的回环监听地址视为本地', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('[::1]')).toBe(true)
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
    expect(isLoopbackHost('192.168.1.10')).toBe(false)
  })

  it('/ready 对降级返回 200，对阻塞配置返回 503', async () => {
    const degradedApp = Fastify()
    registerReadinessRoute(degradedApp, localMockConfig)
    const degraded = await degradedApp.inject({ method: 'GET', url: '/ready' })
    await degradedApp.close()
    expect(degraded.statusCode).toBe(200)
    expect(degraded.json()).toMatchObject({ status: 'degraded' })

    const unsafeApp = Fastify()
    registerReadinessRoute(unsafeApp, { ...localMockConfig, host: '0.0.0.0' })
    const unsafe = await unsafeApp.inject({ method: 'GET', url: '/ready' })
    await unsafeApp.close()
    expect(unsafe.statusCode).toBe(503)
    expect(unsafe.json()).toMatchObject({ status: 'not-ready' })
  })

  it('就绪响应不包含 URL、密钥或用户身份字段', () => {
    const report = createReadinessReport({
      ...localMockConfig,
      authMode: 'supabase',
      supabaseUrl: 'https://secret-project.supabase.co',
      supabaseAnonKey: 'secret-anon-key',
      apiKey: 'secret-model-key',
      model: 'private-model-name',
      embeddingModel: 'private-embedding-name',
    })
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('secret-project')
    expect(serialized).not.toContain('secret-anon-key')
    expect(serialized).not.toContain('secret-model-key')
    expect(serialized).not.toContain('private-model-name')
    expect(serialized).not.toContain('private-embedding-name')
    expect(serialized).not.toContain('email')
    expect(serialized).not.toContain('userId')
  })
})

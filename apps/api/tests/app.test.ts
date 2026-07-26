import { afterEach, describe, expect, it } from 'vitest'
import { buildApp, isOriginAllowed } from '../src/app'
import { loadConfig, type ApiConfig } from '../src/config'
import type { AgentProvider } from '../src/providers/types'

const baseConfig: ApiConfig = {
  provider: 'mock',
  baseUrl: 'https://api.openai.com/v1',
  requestTimeoutMs: 30_000,
  allowedOrigins: [],
  host: '127.0.0.1',
  port: 8787,
}

const provider: AgentProvider = {
  name: 'test',
  async generatePlan() {
    return {
      summary: '静音',
      reason: '测试',
      risk: 'read-only',
      requiresConfirmation: false,
      operations: [{ type: 'MUTE_TABS', tabIds: [1], name: null, color: null }],
    }
  },
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('AI API', () => {
  it('验证请求并重新计算计划风险', async () => {
    const app = await buildApp({ config: baseConfig, provider })
    apps.push(app)
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/plan',
      payload: {
        command: '静音',
        tabs: [{
          id: 1,
          windowId: 10,
          title: 'Example',
          url: 'https://example.com/',
          active: true,
          pinned: false,
          audible: true,
          muted: false,
        }],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().plan.risk).toBe('reversible')
    expect(response.json().plan.requiresConfirmation).toBe(true)
  })

  it('拒绝非 HTTP/HTTPS 标签上下文', async () => {
    const app = await buildApp({ config: baseConfig, provider })
    apps.push(app)
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/plan',
      payload: {
        command: '整理',
        tabs: [{
          id: 1,
          windowId: 10,
          title: 'Local',
          url: 'file:///tmp/private.html',
          active: true,
          pinned: false,
          audible: false,
          muted: false,
        }],
      },
    })
    expect(response.statusCode).toBe(400)
  })

  it('付费 Provider 只允许精确配置的来源', () => {
    const config = {
      ...baseConfig,
      provider: 'openai-compatible' as const,
      allowedOrigins: ['chrome-extension://abcdefghijklmnopabcdefghijklmnop'],
    }
    expect(isOriginAllowed('chrome-extension://abcdefghijklmnopabcdefghijklmnop', config)).toBe(true)
    expect(isOriginAllowed('chrome-extension://other', config)).toBe(false)
  })
})

describe('AI API 配置', () => {
  it('拒绝监听非回环地址', () => {
    expect(() => loadConfig({ HOST: '0.0.0.0' })).toThrow('只允许监听')
  })

  it('付费 Provider 必须配置精确 Origin', () => {
    expect(() => loadConfig({
      ATAB_AI_PROVIDER: 'openai-compatible',
      AI_API_KEY: 'test',
      AI_MODEL: 'test',
    })).toThrow('AI_ALLOWED_ORIGINS')
  })

  it('拒绝公网明文模型服务', () => {
    expect(() => loadConfig({ AI_BASE_URL: 'http://example.com/v1' })).toThrow('必须使用 HTTPS')
  })

  it('接受回环 HTTP 模型服务和精确扩展 Origin', () => {
    const config = loadConfig({
      ATAB_AI_PROVIDER: 'openai-compatible',
      AI_BASE_URL: 'http://127.0.0.1:11434/v1',
      AI_API_KEY: 'test',
      AI_MODEL: 'test',
      AI_ALLOWED_ORIGINS: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    })
    expect(config.baseUrl).toBe('http://127.0.0.1:11434/v1')
    expect(config.allowedOrigins).toEqual(['chrome-extension://abcdefghijklmnopabcdefghijklmnop'])
  })
})

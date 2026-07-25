import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import type { ApiConfig } from '../src/config'
import { MockAgentProvider } from '../src/providers/mock'
import type { AgentProvider } from '../src/providers'

const config: ApiConfig = {
  provider: 'mock',
  baseUrl: 'https://api.openai.com/v1',
  requestTimeoutMs: 1_000,
  allowedOrigins: [],
  host: '127.0.0.1',
  port: 8_787,
}

const tabs = [{
  id: 10,
  title: 'GitHub',
  url: 'https://github.com/weepwood/ATab',
  active: true,
  pinned: false,
  audible: false,
  muted: false,
}]

describe('AI 计划 API', () => {
  it('通过 Mock Provider 返回经过校验的计划', async () => {
    const app = await buildApp({ config, provider: new MockAgentProvider() })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/plan',
      payload: { command: '整理 GitHub 标签页', tabs },
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      provider: 'mock',
      plan: {
        risk: 'reversible',
        requiresConfirmation: true,
        operations: [{
          type: 'CREATE_GROUP',
          tabIds: [10],
          name: '开发',
          color: 'blue',
        }],
      },
    })
  })

  it('拒绝无效请求', async () => {
    const app = await buildApp({ config, provider: new MockAgentProvider() })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/plan',
      payload: { command: '', tabs: [] },
    })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_REQUEST' },
    })
  })

  it('拒绝 Provider 引用请求范围外的标签', async () => {
    const maliciousProvider: AgentProvider = {
      name: 'malicious-test',
      async generatePlan() {
        return {
          summary: '越界操作',
          reason: '测试服务端二次校验',
          risk: 'reversible',
          requiresConfirmation: true,
          operations: [{
            type: 'MUTE_TABS',
            tabIds: [999],
            name: null,
            color: null,
          }],
        }
      },
    }

    const app = await buildApp({ config, provider: maliciousProvider })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/plan',
      payload: { command: '静音', tabs },
    })
    await app.close()

    expect(response.statusCode).toBe(502)
    expect(response.json()).toMatchObject({
      error: { code: 'PLAN_GENERATION_FAILED' },
    })
  })

  it('默认拒绝普通公网网页来源', async () => {
    const app = await buildApp({ config, provider: new MockAgentProvider() })
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/agent/plan',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
      },
    })
    await app.close()

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })
})

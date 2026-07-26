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

const summaryRequest = {
  resourceId: 'resource-1',
  title: '复杂系统文章',
  url: 'https://example.com/article',
  language: 'zh-CN',
  contentHash: 'a'.repeat(64),
  content: '复杂系统由多个相互作用的组成部分构成。反馈回路会改变系统行为。涌现现象无法简单还原为单个部分。'.repeat(8),
  locale: 'zh-CN',
}

describe('AI API', () => {
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

  it('拒绝无效计划请求', async () => {
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
      embeddingModel: 'test-embedding',
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
      async summarizeResource() {
        return {
          summary: '测试摘要',
          keyPoints: [],
          tags: [],
        }
      },
      async embedTexts(request) {
        return {
          embeddings: request.inputs.map((input) => ({
            id: input.id,
            vector: Array(8).fill(0.1),
          })),
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

  it('通过 Mock Provider 生成结构化网页摘要', async () => {
    const app = await buildApp({ config, provider: new MockAgentProvider() })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/resources/summarize',
      payload: summaryRequest,
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      provider: 'mock',
      model: 'atab-mock-v1',
      summary: {
        keyPoints: expect.any(Array),
        tags: expect.arrayContaining(['本地 Mock 摘要']),
      },
    })
  })

  it('拒绝无效网页摘要请求', async () => {
    const app = await buildApp({ config, provider: new MockAgentProvider() })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/resources/summarize',
      payload: { ...summaryRequest, contentHash: 'invalid' },
    })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_SUMMARY_REQUEST' },
    })
  })

  it('拒绝不符合协议的模型摘要输出', async () => {
    const invalidProvider: AgentProvider = {
      name: 'invalid-summary-test',
      embeddingModel: 'test-embedding',
      async generatePlan() {
        return {
          summary: '空计划',
          reason: '测试',
          risk: 'read-only',
          requiresConfirmation: false,
          operations: [],
        }
      },
      async summarizeResource() {
        return {
          summary: '',
          keyPoints: ['有效要点'],
          tags: [],
          injectedField: '不允许的字段',
        }
      },
      async embedTexts(request) {
        return {
          embeddings: request.inputs.map((input) => ({
            id: input.id,
            vector: Array(8).fill(0.1),
          })),
        }
      },
    }

    const app = await buildApp({ config, provider: invalidProvider })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/resources/summarize',
      payload: summaryRequest,
    })
    await app.close()

    expect(response.statusCode).toBe(502)
    expect(response.json()).toMatchObject({
      error: { code: 'SUMMARY_GENERATION_FAILED' },
    })
  })

  it('通过 Mock Provider 生成固定维度语义向量', async () => {
    const app = await buildApp({ config, provider: new MockAgentProvider() })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/embeddings',
      payload: {
        purpose: 'resource-index',
        inputs: [
          { id: 'resource-1', text: '复杂系统与反馈回路' },
          { id: 'resource-2', text: '浏览器标签页管理' },
        ],
      },
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      provider: 'mock',
      model: 'atab-mock-embedding-v1',
      dimensions: 64,
      embeddings: [
        { id: 'resource-1' },
        { id: 'resource-2' },
      ],
    })
  })

  it('拒绝无效嵌入请求和越界 Provider 输出', async () => {
    const app = await buildApp({ config, provider: new MockAgentProvider() })
    const invalidRequest = await app.inject({
      method: 'POST',
      url: '/v1/ai/embeddings',
      payload: { purpose: 'search-query', inputs: [] },
    })
    await app.close()
    expect(invalidRequest.statusCode).toBe(400)
    expect(invalidRequest.json()).toMatchObject({
      error: { code: 'INVALID_EMBEDDING_REQUEST' },
    })

    const invalidEmbeddingProvider: AgentProvider = {
      name: 'invalid-embedding-test',
      embeddingModel: 'test-embedding',
      async generatePlan() {
        return {
          summary: '空计划',
          reason: '测试',
          risk: 'read-only',
          requiresConfirmation: false,
          operations: [],
        }
      },
      async summarizeResource() {
        return { summary: '测试', keyPoints: [], tags: [] }
      },
      async embedTexts() {
        return {
          embeddings: [{ id: 'outside', vector: Array(8).fill(0.1) }],
        }
      },
    }
    const invalidApp = await buildApp({ config, provider: invalidEmbeddingProvider })
    const invalidOutput = await invalidApp.inject({
      method: 'POST',
      url: '/v1/ai/embeddings',
      payload: {
        purpose: 'search-query',
        inputs: [{ id: 'query', text: '复杂系统' }],
      },
    })
    await invalidApp.close()
    expect(invalidOutput.statusCode).toBe(502)
    expect(invalidOutput.json()).toMatchObject({
      error: { code: 'EMBEDDING_GENERATION_FAILED' },
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

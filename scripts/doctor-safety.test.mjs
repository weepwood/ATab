import assert from 'node:assert/strict'
import test from 'node:test'
import { DOCTOR_EXIT, runDoctor } from './doctor.mjs'

test('服务未就绪时主动 Doctor 不调用任何 AI 路由', async () => {
  const paths = []
  const report = await runDoctor({
    endpoint: 'http://127.0.0.1:8787',
    timeoutMs: 1_000,
    active: true,
  }, {
    fetchImpl: async (url) => {
      const path = new URL(url).pathname
      paths.push(path)
      if (path === '/health') {
        return jsonResponse({ status: 'ok', provider: 'mock', authMode: 'disabled' })
      }
      if (path === '/ready') {
        return jsonResponse({ status: 'not-ready', checks: {} }, 503)
      }
      throw new Error(`不应调用主动路由：${path}`)
    },
  })

  assert.deepEqual(paths, ['/health', '/ready'])
  assert.equal(report.exitCode, DOCTOR_EXIT.configuration)
  assert.equal(report.checks.at(-1).code, 'service-not-ready')
})

test('主动 Doctor 按计划、摘要、嵌入顺序执行且不存在并发', async () => {
  const activePaths = []
  let activeInFlight = 0
  let maximumActiveInFlight = 0

  const report = await runDoctor({
    endpoint: 'http://127.0.0.1:8787',
    timeoutMs: 1_000,
    active: true,
  }, {
    fetchImpl: async (url, init) => {
      const path = new URL(url).pathname
      if (path === '/health') {
        return jsonResponse({ status: 'ok', provider: 'mock', authMode: 'disabled' })
      }
      if (path === '/ready') return jsonResponse({ status: 'ready', checks: {} })

      activePaths.push(path)
      activeInFlight += 1
      maximumActiveInFlight = Math.max(maximumActiveInFlight, activeInFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      activeInFlight -= 1

      if (path === '/v1/agent/plan') {
        const body = JSON.parse(init.body)
        assert.equal(body.tabs[0].audible, true)
        return jsonResponse({
          provider: 'mock',
          plan: {
            summary: '静音合成标签页',
            operations: [{ type: 'MUTE_TABS', tabIds: [900001] }],
          },
        })
      }
      if (path === '/v1/ai/resources/summarize') {
        return jsonResponse({
          provider: 'mock',
          model: 'mock-model',
          summary: { summary: '合成摘要', keyPoints: [], tags: [] },
        })
      }
      if (path === '/v1/ai/embeddings') {
        return jsonResponse({
          provider: 'mock',
          model: 'mock-embedding',
          dimensions: 8,
          embeddings: [{
            id: 'doctor-synthetic-query',
            vector: [1, 0, 0, 0, 0, 0, 0, 0],
          }],
        })
      }
      return jsonResponse({ error: { code: 'NOT_FOUND' } }, 404)
    },
  })

  assert.equal(report.exitCode, DOCTOR_EXIT.pass)
  assert.equal(maximumActiveInFlight, 1)
  assert.deepEqual(activePaths, [
    '/v1/agent/plan',
    '/v1/ai/resources/summarize',
    '/v1/ai/embeddings',
  ])
})

test('主动检查失败后不继续调用后续付费接口', async () => {
  const paths = []
  const report = await runDoctor({
    endpoint: 'http://127.0.0.1:8787',
    timeoutMs: 1_000,
    active: true,
  }, {
    fetchImpl: async (url) => {
      const path = new URL(url).pathname
      paths.push(path)
      if (path === '/health') {
        return jsonResponse({ status: 'ok', provider: 'mock', authMode: 'disabled' })
      }
      if (path === '/ready') return jsonResponse({ status: 'ready', checks: {} })
      return jsonResponse({ error: { code: 'PLAN_GENERATION_FAILED' } }, 502)
    },
  })

  assert.deepEqual(paths, ['/health', '/ready', '/v1/agent/plan'])
  assert.equal(report.exitCode, DOCTOR_EXIT.active)
  assert.equal(report.checks.at(-1).code, 'PLAN_GENERATION_FAILED')
})

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

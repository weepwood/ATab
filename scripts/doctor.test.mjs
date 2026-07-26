import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DOCTOR_EXIT,
  formatDoctorReport,
  normalizeDoctorEndpoint,
  parseDoctorArgs,
  runDoctor,
} from './doctor.mjs'

test('拒绝命令行明文 Token 和公网 HTTP endpoint', () => {
  assert.throws(
    () => parseDoctorArgs(['--token', 'secret-token'], {}),
    /token-command-line-forbidden/,
  )
  assert.throws(
    () => normalizeDoctorEndpoint('http://api.example.invalid'),
    /endpoint-public-http-forbidden/,
  )
  assert.throws(
    () => normalizeDoctorEndpoint('https://user:password@api.example.invalid'),
    /endpoint-credentials-forbidden/,
  )
  assert.equal(
    normalizeDoctorEndpoint('http://127.0.0.1:8787').toString(),
    'http://127.0.0.1:8787/',
  )
})

test('被动诊断把未配置同步报告为警告且不调用 AI 路由', async () => {
  const paths = []
  const report = await runDoctor({
    endpoint: 'http://127.0.0.1:8787',
    timeoutMs: 1_000,
    active: false,
  }, {
    fetchImpl: async (url) => {
      paths.push(new URL(url).pathname)
      if (new URL(url).pathname === '/health') {
        return jsonResponse({
          status: 'ok',
          provider: 'mock',
          model: 'atab-mock-v1',
          embeddingModel: 'atab-mock-embedding-v1',
          authMode: 'disabled',
          syncConfigured: false,
        })
      }
      return jsonResponse({
        status: 'degraded',
        checks: { sync: { level: 'warn', code: 'sync-not-configured', configured: false } },
      })
    },
  })

  assert.equal(report.status, 'warning')
  assert.equal(report.exitCode, DOCTOR_EXIT.warning)
  assert.deepEqual(paths, ['/health', '/ready'])
  assert.equal(report.checks.some((item) => item.id.startsWith('active-')), false)
})

test('主动诊断只使用合成数据并对 Token 与响应内容脱敏', async () => {
  const secretToken = 'doctor-secret-token-value'
  const requests = []
  const report = await runDoctor({
    endpoint: 'https://api.example.invalid/atab',
    timeoutMs: 1_000,
    active: true,
    token: secretToken,
  }, {
    fetchImpl: async (url, init) => {
      const parsed = new URL(url)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      requests.push({
        path: parsed.pathname,
        authorization: init?.headers?.authorization,
        body,
      })

      if (parsed.pathname === '/atab/health') {
        return jsonResponse({
          status: 'ok',
          provider: 'mock',
          authMode: 'supabase',
          syncConfigured: true,
        })
      }
      if (parsed.pathname === '/atab/ready') {
        return jsonResponse({ status: 'ready', checks: {} })
      }
      if (parsed.pathname === '/atab/v1/agent/plan') {
        return jsonResponse({
          provider: 'mock',
          plan: {
            summary: 'synthetic plan',
            reason: 'synthetic validation',
            operations: [{ type: 'MUTE_TABS', tabIds: [900001] }],
          },
        })
      }
      if (parsed.pathname === '/atab/v1/ai/resources/summarize') {
        return jsonResponse({
          provider: 'mock',
          model: 'mock-model',
          summary: {
            summary: 'synthetic summary',
            keyPoints: ['synthetic point'],
            tags: ['synthetic'],
          },
        })
      }
      if (parsed.pathname === '/atab/v1/ai/embeddings') {
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
      return jsonResponse({ error: { code: 'NOT_FOUND', message: 'unexpected' } }, 404)
    },
  })

  assert.equal(report.status, 'pass')
  assert.equal(report.exitCode, DOCTOR_EXIT.pass)
  assert.equal(requests.length, 5)
  for (const request of requests.slice(2)) {
    assert.equal(request.authorization, `Bearer ${secretToken}`)
    const serializedBody = JSON.stringify(request.body)
    assert.match(serializedBody, /synthetic|合成/)
    assert.doesNotMatch(serializedBody, /github\.com|localhost|127\.0\.0\.1/)
  }
  assert.equal(requests[2].body.tabs[0].url, 'https://example.invalid/atab-diagnostics')
  assert.equal(requests[3].body.url, 'https://example.invalid/atab-diagnostics')

  const serializedReport = JSON.stringify(report)
  const humanReport = formatDoctorReport(report)
  assert.doesNotMatch(serializedReport, new RegExp(secretToken))
  assert.doesNotMatch(humanReport, new RegExp(secretToken))
  assert.doesNotMatch(serializedReport, /api\.example\.invalid/)
  assert.doesNotMatch(serializedReport, /synthetic summary/)
})

test('Supabase 主动模式缺少 Token 时返回配置错误且不调用 AI', async () => {
  const paths = []
  const report = await runDoctor({
    endpoint: 'https://api.example.invalid',
    timeoutMs: 1_000,
    active: true,
  }, {
    fetchImpl: async (url) => {
      const path = new URL(url).pathname
      paths.push(path)
      if (path === '/health') {
        return jsonResponse({ status: 'ok', provider: 'mock', authMode: 'supabase' })
      }
      return jsonResponse({ status: 'ready', checks: {} })
    },
  })

  assert.equal(report.status, 'error')
  assert.equal(report.exitCode, DOCTOR_EXIT.configuration)
  assert.deepEqual(paths, ['/health', '/ready'])
  assert.equal(report.checks.at(-1).code, 'active-token-missing')
})

test('网络失败和未就绪服务使用不同退出码', async () => {
  const network = await runDoctor({
    endpoint: 'http://127.0.0.1:8787',
    timeoutMs: 1_000,
    active: false,
  }, {
    fetchImpl: async () => {
      throw new Error('secret network detail')
    },
  })
  assert.equal(network.exitCode, DOCTOR_EXIT.network)
  assert.doesNotMatch(JSON.stringify(network), /secret network detail/)

  const notReady = await runDoctor({
    endpoint: 'http://127.0.0.1:8787',
    timeoutMs: 1_000,
    active: false,
  }, {
    fetchImpl: async (url) => {
      if (new URL(url).pathname === '/health') {
        return jsonResponse({ status: 'ok', provider: 'mock', authMode: 'disabled' })
      }
      return jsonResponse({ status: 'not-ready', checks: {} }, 503)
    },
  })
  assert.equal(notReady.exitCode, DOCTOR_EXIT.configuration)
  assert.equal(notReady.checks.at(-1).code, 'service-not-ready')
})

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

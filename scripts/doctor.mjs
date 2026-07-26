#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export const DOCTOR_EXIT = Object.freeze({
  pass: 0,
  warning: 2,
  configuration: 3,
  network: 4,
  active: 5,
})

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8787'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 1_048_576
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{1,80}$/

export function parseDoctorArgs(argv, env = process.env) {
  const options = {
    endpoint: env.ATAB_API_ENDPOINT || DEFAULT_ENDPOINT,
    timeoutMs: readPositiveInteger(env.ATAB_DOCTOR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    active: false,
    json: false,
    tokenStdin: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--active') options.active = true
    else if (argument === '--json') options.json = true
    else if (argument === '--token-stdin') options.tokenStdin = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--endpoint') options.endpoint = readNext(argv, ++index, '--endpoint')
    else if (argument === '--timeout') {
      options.timeoutMs = readPositiveInteger(
        readNext(argv, ++index, '--timeout'),
        Number.NaN,
      )
      if (!Number.isFinite(options.timeoutMs)) throw new DoctorConfigError('timeout-invalid')
    } else if (argument === '--token' || argument.startsWith('--token=')) {
      throw new DoctorConfigError('token-command-line-forbidden')
    } else {
      throw new DoctorConfigError('argument-unknown')
    }
  }

  return options
}

export function normalizeDoctorEndpoint(value) {
  let url
  try {
    url = new URL(String(value).trim())
  } catch {
    throw new DoctorConfigError('endpoint-invalid')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DoctorConfigError('endpoint-protocol-invalid')
  }
  if (url.username || url.password) throw new DoctorConfigError('endpoint-credentials-forbidden')
  if (url.search || url.hash) throw new DoctorConfigError('endpoint-query-forbidden')
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new DoctorConfigError('endpoint-public-http-forbidden')
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`
  return url
}

export async function runDoctor(input, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new DoctorNetworkError('fetch-unavailable')

  const endpoint = normalizeDoctorEndpoint(input.endpoint)
  const token = normalizeToken(input.token)
  const report = {
    status: 'pass',
    active: input.active === true,
    endpoint: {
      scheme: endpoint.protocol.slice(0, -1),
      scope: isLoopbackHost(endpoint.hostname) ? 'loopback' : 'network',
    },
    checks: [],
  }

  const health = await executeRequestCheck({
    id: 'health',
    endpoint,
    path: 'health',
    timeoutMs: input.timeoutMs,
    fetchImpl,
    validate: validateHealthResponse,
  })
  report.checks.push(health.check)
  if (!health.ok) return finalizeReport(report)

  const ready = await executeRequestCheck({
    id: 'readiness',
    endpoint,
    path: 'ready',
    timeoutMs: input.timeoutMs,
    fetchImpl,
    acceptedStatuses: [200, 503],
    validate: validateReadinessResponse,
  })
  report.checks.push(ready.check)

  const authMode = health.value.authMode
  if (input.active !== true) {
    if (authMode === 'supabase' && !token) {
      report.checks.push(check('active-auth', 'warn', 'token-required-for-active-mode'))
    }
    return finalizeReport(report)
  }

  if (authMode === 'supabase' && !token) {
    report.checks.push(check('active-auth', 'fail', 'active-token-missing', 'configuration'))
    return finalizeReport(report)
  }

  const authorization = token ? `Bearer ${token}` : undefined
  const activeChecks = [
    createPlanCheck(endpoint, input.timeoutMs, fetchImpl, authorization),
    createSummaryCheck(endpoint, input.timeoutMs, fetchImpl, authorization),
    createEmbeddingCheck(endpoint, input.timeoutMs, fetchImpl, authorization),
  ]
  for (const task of activeChecks) {
    const result = await task
    report.checks.push(result.check)
  }
  return finalizeReport(report)
}

export function formatDoctorReport(report) {
  const lines = [
    `ATab deployment doctor: ${report.status}`,
    `Endpoint: ${report.endpoint.scheme} / ${report.endpoint.scope}`,
    `Mode: ${report.active ? 'active synthetic verification' : 'passive read-only'}`,
  ]
  for (const item of report.checks) {
    const marker = item.status === 'pass' ? 'PASS' : item.status === 'warn' ? 'WARN' : 'FAIL'
    const suffix = item.httpStatus ? ` (HTTP ${item.httpStatus})` : ''
    lines.push(`[${marker}] ${item.id}: ${item.code}${suffix}`)
  }
  lines.push(`Exit code: ${report.exitCode}`)
  return lines.join('\n')
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let options
  try {
    options = parseDoctorArgs(argv, env)
    if (options.help) {
      process.stdout.write(`${doctorHelp()}\n`)
      return DOCTOR_EXIT.pass
    }
    const stdinToken = options.tokenStdin ? await readTokenFromStdin() : undefined
    if (stdinToken && env.ATAB_ACCESS_TOKEN) {
      throw new DoctorConfigError('token-source-ambiguous')
    }
    const report = await runDoctor({
      endpoint: options.endpoint,
      timeoutMs: options.timeoutMs,
      active: options.active,
      token: stdinToken || env.ATAB_ACCESS_TOKEN,
    })
    process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : formatDoctorReport(report)}\n`)
    return report.exitCode
  } catch (cause) {
    const failure = createTopLevelFailure(cause, options)
    process.stdout.write(`${options?.json ? JSON.stringify(failure, null, 2) : formatDoctorReport(failure)}\n`)
    return failure.exitCode
  }
}

async function createPlanCheck(endpoint, timeoutMs, fetchImpl, authorization) {
  const payload = {
    command: '将合成诊断标签页静音',
    locale: 'zh-CN',
    tabs: [{
      id: 900001,
      title: 'ATab synthetic diagnostic tab',
      url: 'https://example.invalid/atab-diagnostics',
      active: true,
      pinned: false,
      audible: false,
      muted: false,
    }],
  }
  return executeRequestCheck({
    id: 'active-agent-plan',
    endpoint,
    path: 'v1/agent/plan',
    timeoutMs,
    fetchImpl,
    authorization,
    method: 'POST',
    payload,
    failureKind: 'active',
    validate(value) {
      const root = asObject(value)
      const plan = asObject(root.plan)
      if (typeof root.provider !== 'string') return false
      if (typeof plan.summary !== 'string' || !Array.isArray(plan.operations)) return false
      return plan.operations.every((operation) => {
        const item = asObject(operation)
        return Array.isArray(item.tabIds)
          && item.tabIds.every((id) => id === 900001)
      })
    },
  })
}

async function createSummaryCheck(endpoint, timeoutMs, fetchImpl, authorization) {
  const content = [
    '这是 ATab 部署诊断生成的固定合成文本，不来自任何真实网页、浏览记录或用户数据。',
    '它只用于验证摘要接口能够返回结构化 summary、keyPoints 和 tags 字段。',
    '诊断程序不会要求模型执行工具，也不会把响应内容写入浏览器或同步数据库。',
  ].join('')
  const payload = {
    resourceId: 'doctor-synthetic-resource',
    title: 'ATab synthetic diagnostic resource',
    url: 'https://example.invalid/atab-diagnostics',
    language: 'zh-CN',
    contentHash: createHash('sha256').update(content).digest('hex'),
    content,
    locale: 'zh-CN',
  }
  return executeRequestCheck({
    id: 'active-resource-summary',
    endpoint,
    path: 'v1/ai/resources/summarize',
    timeoutMs,
    fetchImpl,
    authorization,
    method: 'POST',
    payload,
    failureKind: 'active',
    validate(value) {
      const root = asObject(value)
      const summary = asObject(root.summary)
      return typeof root.provider === 'string'
        && typeof summary.summary === 'string'
        && summary.summary.length > 0
        && Array.isArray(summary.keyPoints)
        && Array.isArray(summary.tags)
    },
  })
}

async function createEmbeddingCheck(endpoint, timeoutMs, fetchImpl, authorization) {
  const payload = {
    purpose: 'search-query',
    inputs: [{
      id: 'doctor-synthetic-query',
      text: 'ATab synthetic deployment diagnostic embedding',
    }],
  }
  return executeRequestCheck({
    id: 'active-embeddings',
    endpoint,
    path: 'v1/ai/embeddings',
    timeoutMs,
    fetchImpl,
    authorization,
    method: 'POST',
    payload,
    failureKind: 'active',
    validate(value) {
      const root = asObject(value)
      if (
        typeof root.provider !== 'string'
        || typeof root.model !== 'string'
        || !Number.isInteger(root.dimensions)
        || !Array.isArray(root.embeddings)
        || root.embeddings.length !== 1
      ) return false
      const embedding = asObject(root.embeddings[0])
      return embedding.id === 'doctor-synthetic-query'
        && Array.isArray(embedding.vector)
        && embedding.vector.length === root.dimensions
        && embedding.vector.length >= 8
        && embedding.vector.length <= 4096
        && embedding.vector.every((number) => typeof number === 'number' && Number.isFinite(number))
    },
  })
}

async function executeRequestCheck(options) {
  const startedAt = Date.now()
  let response
  try {
    response = await fetchWithTimeout(
      new URL(options.path, options.endpoint),
      {
        method: options.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(options.payload ? { 'content-type': 'application/json' } : {}),
          ...(options.authorization ? { authorization: options.authorization } : {}),
        },
        ...(options.payload ? { body: JSON.stringify(options.payload) } : {}),
      },
      options.timeoutMs,
      options.fetchImpl,
    )
  } catch (cause) {
    const code = cause instanceof DoctorTimeoutError ? 'request-timeout' : 'request-network-failed'
    return {
      ok: false,
      check: check(options.id, 'fail', code, 'network', undefined, Date.now() - startedAt),
    }
  }

  const accepted = options.acceptedStatuses ?? [200]
  let payload
  try {
    payload = await readLimitedJson(response)
  } catch (cause) {
    const code = cause instanceof DoctorResponseError ? cause.code : 'response-invalid'
    return {
      ok: false,
      check: check(
        options.id,
        'fail',
        code,
        options.failureKind ?? 'configuration',
        response.status,
        Date.now() - startedAt,
      ),
    }
  }

  if (!accepted.includes(response.status)) {
    return {
      ok: false,
      check: check(
        options.id,
        'fail',
        readSafeServerErrorCode(payload) || `http-${response.status}`,
        options.failureKind ?? classifyHttpFailure(response.status),
        response.status,
        Date.now() - startedAt,
      ),
    }
  }

  const validation = options.validate(payload)
  if (validation === false) {
    return {
      ok: false,
      value: payload,
      check: check(
        options.id,
        'fail',
        'response-schema-invalid',
        options.failureKind ?? 'configuration',
        response.status,
        Date.now() - startedAt,
      ),
    }
  }
  if (typeof validation === 'object' && validation !== null) {
    return {
      ok: validation.status !== 'fail',
      value: validation.value,
      check: check(
        options.id,
        validation.status,
        validation.code,
        validation.failureKind,
        response.status,
        Date.now() - startedAt,
      ),
    }
  }

  return {
    ok: true,
    value: payload,
    check: check(options.id, 'pass', 'ok', undefined, response.status, Date.now() - startedAt),
  }
}

function validateHealthResponse(value) {
  const root = asObject(value)
  if (
    root.status !== 'ok'
    || typeof root.provider !== 'string'
    || (root.authMode !== 'disabled' && root.authMode !== 'supabase')
  ) return false
  return { status: 'pass', code: 'healthy', value: { authMode: root.authMode } }
}

function validateReadinessResponse(value) {
  const root = asObject(value)
  if (
    !['ready', 'degraded', 'not-ready'].includes(root.status)
    || typeof root.checks !== 'object'
    || root.checks === null
    || Array.isArray(root.checks)
  ) return false
  if (root.status === 'not-ready') {
    return { status: 'fail', code: 'service-not-ready', failureKind: 'configuration', value: root }
  }
  if (root.status === 'degraded') {
    return { status: 'warn', code: 'service-degraded', value: root }
  }
  return { status: 'pass', code: 'service-ready', value: root }
}

function finalizeReport(report) {
  const checks = report.checks
  const networkFailure = checks.some((item) => item.failureKind === 'network')
  const configurationFailure = checks.some((item) => item.failureKind === 'configuration')
  const activeFailure = checks.some((item) => item.failureKind === 'active')
  const failed = checks.some((item) => item.status === 'fail')
  const warning = checks.some((item) => item.status === 'warn')

  report.status = failed ? 'error' : warning ? 'warning' : 'pass'
  report.exitCode = networkFailure
    ? DOCTOR_EXIT.network
    : configurationFailure
      ? DOCTOR_EXIT.configuration
      : activeFailure
        ? DOCTOR_EXIT.active
        : warning
          ? DOCTOR_EXIT.warning
          : DOCTOR_EXIT.pass
  return report
}

function createTopLevelFailure(cause, options) {
  const configuration = cause instanceof DoctorConfigError
  const code = configuration ? cause.code : 'doctor-unexpected-failure'
  return {
    status: 'error',
    active: options?.active === true,
    endpoint: { scheme: 'unknown', scope: 'unknown' },
    checks: [check('doctor', 'fail', code, configuration ? 'configuration' : 'network')],
    exitCode: configuration ? DOCTOR_EXIT.configuration : DOCTOR_EXIT.network,
  }
}

function check(id, status, code, failureKind, httpStatus, durationMs = 0) {
  return {
    id,
    status,
    code,
    ...(failureKind ? { failureKind } : {}),
    ...(httpStatus ? { httpStatus } : {}),
    durationMs: Math.max(0, Math.round(durationMs)),
  }
}

async function fetchWithTimeout(url, init, timeoutMs, fetchImpl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new DoctorTimeoutError()
    }
    throw cause
  } finally {
    clearTimeout(timer)
  }
}

async function readLimitedJson(response) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new DoctorResponseError('response-too-large')
  }
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new DoctorResponseError('response-too-large')
  }
  if (!text) throw new DoctorResponseError('response-empty')
  try {
    return JSON.parse(text)
  } catch {
    throw new DoctorResponseError('response-json-invalid')
  }
}

function readSafeServerErrorCode(value) {
  try {
    const root = asObject(value)
    const error = asObject(root.error)
    return typeof error.code === 'string' && SAFE_ERROR_CODE.test(error.code)
      ? error.code
      : undefined
  } catch {
    return undefined
  }
}

function classifyHttpFailure(status) {
  if (status === 401 || status === 403 || status === 404 || status === 503) return 'configuration'
  return 'active'
}

function asObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value
}

function normalizeToken(value) {
  if (value === undefined || value === null) return undefined
  const token = String(value).trim()
  if (!token) return undefined
  if (/\s/.test(token)) throw new DoctorConfigError('token-format-invalid')
  return token
}

async function readTokenFromStdin() {
  if (process.stdin.isTTY) throw new DoctorConfigError('token-stdin-empty')
  const value = (await readFile(0, 'utf8')).trim()
  if (!value) throw new DoctorConfigError('token-stdin-empty')
  return value
}

function readNext(argv, index, name) {
  const value = argv[index]
  if (!value || value.startsWith('--')) throw new DoctorConfigError(`${name.slice(2)}-missing`)
  return value
}

function readPositiveInteger(value, fallback) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 120_000 ? parsed : fallback
}

function isLoopbackHost(host) {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function doctorHelp() {
  return `ATab deployment doctor

Usage:
  node scripts/doctor.mjs [options]

Options:
  --endpoint <url>   API endpoint，默认读取 ATAB_API_ENDPOINT
  --timeout <ms>     单次请求超时，默认 10000
  --active           使用固定合成数据测试计划、摘要和嵌入接口
  --json             输出 JSON
  --token-stdin      从标准输入读取 Bearer Token
  --help             显示帮助

Environment:
  ATAB_API_ENDPOINT
  ATAB_DOCTOR_TIMEOUT_MS
  ATAB_ACCESS_TOKEN

Security:
  不支持 --token 参数；公网 endpoint 必须使用 HTTPS。`
}

class DoctorConfigError extends Error {
  constructor(code) {
    super(code)
    this.name = 'DoctorConfigError'
    this.code = code
  }
}

class DoctorNetworkError extends Error {}
class DoctorTimeoutError extends Error {}
class DoctorResponseError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.exitCode = await main()
}

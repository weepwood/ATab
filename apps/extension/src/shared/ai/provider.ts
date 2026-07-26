import {
  parseAgentActionPlanResponse,
  validateAgentPlanRequest,
  type AgentPlanRequest,
} from '@atab/contracts'
import type { AiActionPlan, TabView } from '../domain'
import { buildLocalPlan } from './localPlanner'

export type AiProviderMode = 'local' | 'remote'

export interface AiProviderSettings {
  mode: AiProviderMode
  endpoint: string
  fallbackToLocal: boolean
}

export interface AiHealthResult {
  status: string
  provider: string
}

const DEFAULT_SETTINGS: AiProviderSettings = {
  mode: 'local',
  endpoint: 'http://127.0.0.1:8787',
  fallbackToLocal: true,
}
const REQUEST_TIMEOUT_MS = 30_000
const MAX_API_RESPONSE_BYTES = 1_048_576

export async function getAiProviderSettings(): Promise<AiProviderSettings> {
  const value = await chrome.storage.local.get('aiProvider')
  return normalizeSettings(value.aiProvider)
}

export async function saveAiProviderSettings(settings: AiProviderSettings): Promise<void> {
  const normalized = normalizeSettings(settings)
  if (normalized.mode === 'remote') normalizeEndpoint(normalized.endpoint)
  await chrome.storage.local.set({ aiProvider: normalized })
}

export async function createAiPlan(command: string, tabs: TabView[]): Promise<AiActionPlan> {
  const settings = await getAiProviderSettings()
  if (settings.mode === 'local') return buildLocalPlan(command, tabs)

  try {
    return await requestRemotePlan(settings.endpoint, command, tabs)
  } catch (cause) {
    if (!settings.fallbackToLocal) throw cause
    const fallback = buildLocalPlan(command, tabs)
    return {
      ...fallback,
      reason: `远程 AI 不可用，已回退到本地规则：${errorMessage(cause)}。${fallback.reason}`,
    }
  }
}

export async function requestAiEndpointPermission(endpoint: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [endpointPermissionPattern(endpoint)] })
}

export async function hasAiEndpointPermission(endpoint: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [endpointPermissionPattern(endpoint)] })
}

export async function testAiEndpoint(endpoint: string): Promise<AiHealthResult> {
  const normalized = normalizeEndpoint(endpoint)
  const response = await fetchWithTimeout(`${normalized}/health`, { method: 'GET' }, 8_000)
  const payload = await readJson(response)
  if (!response.ok) throw new Error(readRemoteError(payload, response.status))
  const record = asObject(payload, '健康检查响应')
  return {
    status: typeof record.status === 'string' ? record.status : 'unknown',
    provider: typeof record.provider === 'string' ? record.provider : 'unknown',
  }
}

async function requestRemotePlan(
  endpoint: string,
  command: string,
  tabs: TabView[],
): Promise<AiActionPlan> {
  const normalized = normalizeEndpoint(endpoint)
  const remoteTabs = tabs.filter((tab) => isRemoteSafeUrl(tab.url))
  const request = validateAgentPlanRequest({
    command,
    locale: 'zh-CN',
    tabs: remoteTabs.map((tab) => ({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title,
      url: tab.url,
      active: tab.active,
      pinned: tab.pinned,
      audible: tab.audible,
      muted: tab.muted,
    })),
  }) satisfies AgentPlanRequest

  const response = await fetchWithTimeout(`${normalized}/v1/agent/plan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify(request),
  }, REQUEST_TIMEOUT_MS)
  const payload = await readJson(response)
  if (!response.ok) throw new Error(readRemoteError(payload, response.status))
  const record = asObject(payload, 'AI API 响应')
  return parseAgentActionPlanResponse(record.plan, remoteTabs.map((tab) => tab.id))
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error(`请求超过 ${timeoutMs}ms`)
    }
    throw cause
  } finally {
    window.clearTimeout(timer)
  }
}

async function readJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_API_RESPONSE_BYTES) throw new Error('AI 服务响应过大')
  const text = await response.text()
  if (new Blob([text]).size > MAX_API_RESPONSE_BYTES) throw new Error('AI 服务响应过大')
  if (!text) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`服务返回了无法解析的响应（HTTP ${response.status}）`)
  }
}

function readRemoteError(value: unknown, status: number): string {
  try {
    const root = asObject(value, '错误响应')
    const error = asObject(root.error, 'error')
    if (typeof error.message === 'string') return error.message.slice(0, 500)
  } catch {
    // 使用通用错误。
  }
  return `AI 服务返回 HTTP ${status}`
}

function normalizeSettings(value: unknown): AiProviderSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_SETTINGS }
  }
  const input = value as Record<string, unknown>
  return {
    mode: input.mode === 'remote' ? 'remote' : 'local',
    endpoint: typeof input.endpoint === 'string'
      ? input.endpoint.trim() || DEFAULT_SETTINGS.endpoint
      : DEFAULT_SETTINGS.endpoint,
    fallbackToLocal: input.fallbackToLocal !== false,
  }
}

export function normalizeEndpoint(value: string): string {
  const url = new URL(value.trim())
  if (url.username || url.password) throw new Error('AI 服务地址不得包含账号或密码')
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('AI 服务地址仅支持 HTTP 或 HTTPS')
  }
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new Error('非本机 AI 服务必须使用 HTTPS')
  }
  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/$/, '')
}

function endpointPermissionPattern(endpoint: string): string {
  const url = new URL(normalizeEndpoint(endpoint))
  return `${url.origin}/*`
}

function isLoopbackHost(value: string): boolean {
  const normalized = value.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function isRemoteSafeUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label}格式无效`)
  }
  return value as Record<string, unknown>
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '未知错误'
}

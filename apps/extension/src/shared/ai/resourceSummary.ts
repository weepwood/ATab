import {
  MAX_RESOURCE_SUMMARY_CONTENT,
  parseResourceSummaryApiResponse,
  type ResourceSummaryApiResponse,
  type ResourceSummaryRequest,
} from '@atab/contracts'
import type {
  ResourceContentRecord,
  ResourceRecord,
} from '../domain'
import {
  getAiProviderSettings,
  hasAiEndpointPermission,
} from './provider'

const SUMMARY_REQUEST_TIMEOUT_MS = 60_000

export interface ResourceSummaryUploadPreview {
  endpoint: string
  characterCount: number
  truncated: boolean
}

export async function getResourceSummaryUploadPreview(
  content: ResourceContentRecord,
): Promise<ResourceSummaryUploadPreview> {
  const settings = await getAiProviderSettings()
  if (settings.mode !== 'remote') {
    throw new Error('生成 AI 摘要需要在设置中启用远程 AI Provider')
  }
  const endpoint = normalizeEndpoint(settings.endpoint)
  const permitted = await hasAiEndpointPermission(endpoint)
  if (!permitted) {
    throw new Error('尚未授权访问当前 AI 服务地址，请先在设置页授权并保存')
  }
  return {
    endpoint,
    characterCount: Math.min(content.text.length, MAX_RESOURCE_SUMMARY_CONTENT),
    truncated: content.text.length > MAX_RESOURCE_SUMMARY_CONTENT,
  }
}

export async function requestResourceSummary(
  resource: ResourceRecord,
  content: ResourceContentRecord,
): Promise<ResourceSummaryApiResponse> {
  const preview = await getResourceSummaryUploadPreview(content)
  const request: ResourceSummaryRequest = {
    resourceId: resource.id,
    title: resource.title,
    url: resource.originalUrl,
    language: resource.language,
    contentHash: content.contentHash,
    content: content.text.slice(0, MAX_RESOURCE_SUMMARY_CONTENT),
    locale: 'zh-CN',
  }

  const response = await fetchWithTimeout(
    `${preview.endpoint}/v1/ai/resources/summarize`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(request),
    },
    SUMMARY_REQUEST_TIMEOUT_MS,
  )
  const payload = await readJson(response)
  if (!response.ok) throw new Error(readRemoteError(payload, response.status))
  return parseResourceSummaryApiResponse(payload)
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
      throw new Error(`网页摘要请求超过 ${timeoutMs}ms`)
    }
    throw cause
  } finally {
    window.clearTimeout(timer)
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`AI 服务返回了无法解析的摘要响应（HTTP ${response.status}）`)
  }
}

function readRemoteError(value: unknown, status: number): string {
  try {
    const root = asObject(value)
    const error = asObject(root.error)
    if (typeof error.message === 'string') return error.message
  } catch {
    // 使用通用错误信息。
  }
  return `AI 服务返回 HTTP ${status}`
}

function normalizeEndpoint(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('AI 服务地址仅支持 HTTP 或 HTTPS')
  }
  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/$/, '')
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('响应格式无效')
  }
  return value as Record<string, unknown>
}

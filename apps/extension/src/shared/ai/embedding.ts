import {
  parseEmbeddingApiResponse,
  type EmbeddingApiResponse,
  type EmbeddingInput,
  type EmbeddingPurpose,
  type EmbeddingRequest,
} from '@atab/contracts/embedding'
import { getAiAuthorizationHeaders } from './auth'
import {
  getAiProviderSettings,
  hasAiEndpointPermission,
} from './provider'

const EMBEDDING_REQUEST_TIMEOUT_MS = 45_000

export interface EmbeddingEndpointPreview {
  endpoint: string
}

export async function getEmbeddingEndpointPreview(): Promise<EmbeddingEndpointPreview> {
  const settings = await getAiProviderSettings()
  if (settings.mode !== 'remote') {
    throw new Error('语义索引需要在设置中启用远程 AI Provider')
  }
  const endpoint = normalizeEndpoint(settings.endpoint)
  const permitted = await hasAiEndpointPermission(endpoint)
  if (!permitted) {
    throw new Error('尚未授权访问当前 AI 服务地址，请先在设置页授权并保存')
  }
  return { endpoint }
}

export async function requestEmbeddings(
  purpose: EmbeddingPurpose,
  inputs: EmbeddingInput[],
): Promise<EmbeddingApiResponse> {
  const preview = await getEmbeddingEndpointPreview()
  const authorizationHeaders = await getAiAuthorizationHeaders()
  const request: EmbeddingRequest = { purpose, inputs }
  const response = await fetchWithTimeout(
    `${preview.endpoint}/v1/ai/embeddings`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authorizationHeaders,
      },
      credentials: 'omit',
      body: JSON.stringify(request),
    },
    EMBEDDING_REQUEST_TIMEOUT_MS,
  )
  const payload = await readJson(response)
  if (!response.ok) throw new Error(readRemoteError(payload, response.status))
  return parseEmbeddingApiResponse(payload, inputs.map((input) => input.id))
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error(`语义嵌入请求超过 ${timeoutMs}ms`)
    }
    throw cause
  } finally {
    globalThis.clearTimeout(timer)
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`AI 服务返回了无法解析的嵌入响应（HTTP ${response.status}）`)
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

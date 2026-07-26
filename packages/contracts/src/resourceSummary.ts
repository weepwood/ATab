export const MAX_RESOURCE_SUMMARY_CONTENT = 120_000
export const MAX_RESOURCE_SUMMARY_POINTS = 8
export const MAX_RESOURCE_SUMMARY_TAGS = 12

export interface ResourceSummaryRequest {
  resourceId: string
  title: string
  url: string
  language?: string
  contentHash: string
  content: string
  locale?: string
}

export interface ResourceSummaryDraft {
  summary: string
  keyPoints: string[]
  tags: string[]
}

export interface ResourceSummaryApiResponse {
  summary: ResourceSummaryDraft
  provider: string
  model?: string
}

export const RESOURCE_SUMMARY_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'keyPoints', 'tags'],
  properties: {
    summary: {
      type: 'string',
      minLength: 1,
      maxLength: 4_000,
    },
    keyPoints: {
      type: 'array',
      maxItems: MAX_RESOURCE_SUMMARY_POINTS,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 300,
      },
    },
    tags: {
      type: 'array',
      maxItems: MAX_RESOURCE_SUMMARY_TAGS,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 80,
      },
    },
  },
} as const

export function validateResourceSummaryRequest(value: unknown): ResourceSummaryRequest {
  const input = asObject(value, '摘要请求')
  const resourceId = readString(input.resourceId, 'resourceId', 128)
  const title = readString(input.title, 'title', 1_000)
  const url = readHttpUrl(input.url, 'url')
  const contentHash = readContentHash(input.contentHash)
  const content = readString(input.content, 'content', MAX_RESOURCE_SUMMARY_CONTENT)
  if (content.trim().length < 80) throw new Error('content 至少需要 80 个字符')

  const language = input.language === undefined
    ? undefined
    : readString(input.language, 'language', 64)
  const locale = input.locale === undefined
    ? undefined
    : readString(input.locale, 'locale', 32)

  return {
    resourceId: resourceId.trim(),
    title: title.trim(),
    url,
    language: language?.trim(),
    contentHash,
    content: content.trim(),
    locale: locale?.trim(),
  }
}

export function normalizeResourceSummaryDraft(value: unknown): ResourceSummaryDraft {
  const input = asObject(value, '摘要结果')
  const summary = readString(input.summary, 'summary', 4_000).trim()
  const keyPoints = readUniqueStringArray(
    input.keyPoints,
    'keyPoints',
    MAX_RESOURCE_SUMMARY_POINTS,
    300,
  )
  const tags = readUniqueStringArray(
    input.tags,
    'tags',
    MAX_RESOURCE_SUMMARY_TAGS,
    80,
  )

  return { summary, keyPoints, tags }
}

export function parseResourceSummaryApiResponse(value: unknown): ResourceSummaryApiResponse {
  const input = asObject(value, '摘要 API 响应')
  const provider = readString(input.provider, 'provider', 120).trim()
  const model = input.model === undefined || input.model === null
    ? undefined
    : readString(input.model, 'model', 200).trim()

  return {
    summary: normalizeResourceSummaryDraft(input.summary),
    provider,
    model,
  }
}

function readUniqueStringArray(
  value: unknown,
  label: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组`)
  if (value.length > maxItems) throw new Error(`${label} 不能超过 ${maxItems} 项`)

  const seen = new Set<string>()
  const result: string[] = []
  for (const [index, item] of value.entries()) {
    const text = readString(item, `${label}[${index}]`, maxLength).trim()
    const key = text.normalize('NFKC').toLocaleLowerCase('zh-CN')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
  }
  return result
}

function readContentHash(value: unknown): string {
  const hash = readString(value, 'contentHash', 64).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('contentHash 必须是 64 位 SHA-256 十六进制字符串')
  return hash
}

function readHttpUrl(value: unknown, label: string): string {
  const text = readString(value, label, 8_000).trim()
  const url = new URL(text)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} 仅支持 HTTP 或 HTTPS`)
  }
  return url.toString()
}

function readString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`)
  if (!value.trim()) throw new Error(`${label} 不能为空`)
  if (value.length > maxLength) throw new Error(`${label} 过长`)
  return value
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`)
  }
  return value as Record<string, unknown>
}

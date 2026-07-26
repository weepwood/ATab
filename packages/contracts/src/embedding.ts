export const MAX_EMBEDDING_INPUTS = 16
export const MAX_EMBEDDING_TEXT_LENGTH = 12_000
export const MAX_EMBEDDING_TOTAL_TEXT_LENGTH = 100_000
export const MIN_EMBEDDING_DIMENSIONS = 8
export const MAX_EMBEDDING_DIMENSIONS = 4_096

export type EmbeddingPurpose = 'resource-index' | 'search-query'

export interface EmbeddingInput {
  id: string
  text: string
}

export interface EmbeddingRequest {
  purpose: EmbeddingPurpose
  inputs: EmbeddingInput[]
}

export interface EmbeddingVector {
  id: string
  vector: number[]
}

export interface EmbeddingDraft {
  embeddings: EmbeddingVector[]
}

export interface EmbeddingApiResponse extends EmbeddingDraft {
  provider: string
  model: string
  dimensions: number
}

export function validateEmbeddingRequest(value: unknown): EmbeddingRequest {
  const input = asObject(value, '嵌入请求')
  assertAllowedKeys(input, ['purpose', 'inputs'], '嵌入请求')
  const purpose = readPurpose(input.purpose)
  if (!Array.isArray(input.inputs)) throw new Error('inputs 必须是数组')
  if (input.inputs.length < 1) throw new Error('inputs 不能为空')
  if (input.inputs.length > MAX_EMBEDDING_INPUTS) {
    throw new Error(`inputs 不能超过 ${MAX_EMBEDDING_INPUTS} 项`)
  }

  const seenIds = new Set<string>()
  let totalLength = 0
  const inputs = input.inputs.map((item, index) => {
    const record = asObject(item, `inputs[${index}]`)
    assertAllowedKeys(record, ['id', 'text'], `inputs[${index}]`)
    const id = readString(record.id, `inputs[${index}].id`, 128).trim()
    if (seenIds.has(id)) throw new Error(`inputs 中存在重复 ID：${id}`)
    seenIds.add(id)
    const text = readString(
      record.text,
      `inputs[${index}].text`,
      MAX_EMBEDDING_TEXT_LENGTH,
    ).trim()
    if (text.length < 2) throw new Error(`inputs[${index}].text 过短`)
    totalLength += text.length
    return { id, text }
  })

  if (totalLength > MAX_EMBEDDING_TOTAL_TEXT_LENGTH) {
    throw new Error(`inputs 总文本不能超过 ${MAX_EMBEDDING_TOTAL_TEXT_LENGTH} 字符`)
  }

  return { purpose, inputs }
}

export function normalizeEmbeddingDraft(
  value: unknown,
  expectedIds: Iterable<string>,
): EmbeddingDraft & { dimensions: number } {
  const input = asObject(value, '嵌入结果')
  assertAllowedKeys(input, ['embeddings'], '嵌入结果')
  if (!Array.isArray(input.embeddings)) throw new Error('embeddings 必须是数组')

  const expected = [...expectedIds]
  if (input.embeddings.length !== expected.length) {
    throw new Error('embeddings 数量与请求不一致')
  }
  const expectedSet = new Set(expected)
  const seenIds = new Set<string>()
  let dimensions: number | undefined

  const embeddings = input.embeddings.map((item, index) => {
    const record = asObject(item, `embeddings[${index}]`)
    assertAllowedKeys(record, ['id', 'vector'], `embeddings[${index}]`)
    const id = readString(record.id, `embeddings[${index}].id`, 128).trim()
    if (!expectedSet.has(id)) throw new Error(`嵌入结果包含请求范围外的 ID：${id}`)
    if (seenIds.has(id)) throw new Error(`嵌入结果包含重复 ID：${id}`)
    seenIds.add(id)
    const vector = readVector(record.vector, `embeddings[${index}].vector`)
    dimensions ??= vector.length
    if (vector.length !== dimensions) throw new Error('所有向量维度必须一致')
    return { id, vector }
  })

  for (const id of expected) {
    if (!seenIds.has(id)) throw new Error(`嵌入结果缺少 ID：${id}`)
  }

  return { embeddings, dimensions: dimensions ?? 0 }
}

export function parseEmbeddingApiResponse(
  value: unknown,
  expectedIds: Iterable<string>,
): EmbeddingApiResponse {
  const input = asObject(value, '嵌入 API 响应')
  assertAllowedKeys(input, ['embeddings', 'provider', 'model', 'dimensions'], '嵌入 API 响应')
  const normalized = normalizeEmbeddingDraft(
    { embeddings: input.embeddings },
    expectedIds,
  )
  const provider = readString(input.provider, 'provider', 120).trim()
  const model = readString(input.model, 'model', 200).trim()
  const dimensions = readInteger(input.dimensions, 'dimensions')
  if (dimensions !== normalized.dimensions) {
    throw new Error('dimensions 与实际向量长度不一致')
  }
  return {
    embeddings: normalized.embeddings,
    provider,
    model,
    dimensions,
  }
}

function readVector(value: unknown, label: string): number[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组`)
  if (value.length < MIN_EMBEDDING_DIMENSIONS || value.length > MAX_EMBEDDING_DIMENSIONS) {
    throw new Error(`${label} 维度必须在 ${MIN_EMBEDDING_DIMENSIONS} 到 ${MAX_EMBEDDING_DIMENSIONS} 之间`)
  }
  return value.map((item, index) => {
    if (typeof item !== 'number' || !Number.isFinite(item) || Math.abs(item) > 1_000_000) {
      throw new Error(`${label}[${index}] 必须是有限数值`)
    }
    return item
  })
}

function readPurpose(value: unknown): EmbeddingPurpose {
  if (value === 'resource-index' || value === 'search-query') return value
  throw new Error('purpose 必须是 resource-index 或 search-query')
}

function readInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label} 必须是整数`)
  }
  if (value < MIN_EMBEDDING_DIMENSIONS || value > MAX_EMBEDDING_DIMENSIONS) {
    throw new Error(`${label} 超出允许范围`)
  }
  return value
}

function readString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`)
  if (!value.trim()) throw new Error(`${label} 不能为空`)
  if (value.length > maxLength) throw new Error(`${label} 过长`)
  return value
}

function assertAllowedKeys(
  input: Record<string, unknown>,
  allowedKeys: string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys)
  const unexpected = Object.keys(input).filter((key) => !allowed.has(key))
  if (unexpected.length > 0) {
    throw new Error(`${label} 包含未声明字段：${unexpected.join(', ')}`)
  }
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`)
  }
  return value as Record<string, unknown>
}

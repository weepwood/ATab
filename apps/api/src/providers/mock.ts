import type {
  AgentPlanDraft,
  AgentPlanRequest,
  AgentTabContext,
  ResourceSummaryDraft,
  ResourceSummaryRequest,
} from '@atab/contracts'
import type {
  EmbeddingDraft,
  EmbeddingRequest,
} from '@atab/contracts/embedding'
import type { AgentProvider } from './types'

const MOCK_EMBEDDING_DIMENSIONS = 64

export class MockAgentProvider implements AgentProvider {
  readonly name = 'mock'
  readonly model = 'atab-mock-v1'
  readonly embeddingModel = 'atab-mock-embedding-v1'

  async generatePlan(request: AgentPlanRequest): Promise<AgentPlanDraft> {
    const command = request.command.toLowerCase()

    if (command.includes('重复')) return duplicatePlan(request.tabs)
    if (command.includes('github') || command.includes('开发')) return githubPlan(request.tabs)
    if (command.includes('静音') || command.includes('mute')) return mutePlan(request.tabs)

    return {
      summary: '当前 Mock Provider 无法安全识别该指令',
      reason: 'Mock Provider 只支持重复标签、GitHub 分组和静音标签三类演示指令。',
      risk: 'read-only',
      requiresConfirmation: false,
      operations: [],
    }
  }

  async summarizeResource(request: ResourceSummaryRequest): Promise<ResourceSummaryDraft> {
    const sentences = splitSentences(request.content)
    const selected = sentences.slice(0, 4)
    const summary = selected.join(' ').slice(0, 900)
      || request.content.slice(0, 900)

    return {
      summary,
      keyPoints: selected.slice(0, 3).map((sentence) => sentence.slice(0, 280)),
      tags: deriveTags(request),
    }
  }

  async embedTexts(request: EmbeddingRequest): Promise<EmbeddingDraft> {
    return {
      embeddings: request.inputs.map((input) => ({
        id: input.id,
        vector: createMockEmbedding(input.text),
      })),
    }
  }
}

function duplicatePlan(tabs: AgentTabContext[]): AgentPlanDraft {
  const byUrl = new Map<string, AgentTabContext[]>()
  for (const tab of tabs) {
    const key = normalizeUrl(tab.url)
    byUrl.set(key, [...(byUrl.get(key) ?? []), tab])
  }

  const tabIds = [...byUrl.values()].flatMap((items) => {
    if (items.length < 2) return []
    const keep = items.find((item) => item.active) ?? items[0]
    return items.filter((item) => item.id !== keep.id).map((item) => item.id)
  })

  return {
    summary: `关闭 ${tabIds.length} 个重复标签页`,
    reason: '按清理常见追踪参数后的 URL 判断重复项，并优先保留当前活动标签。',
    risk: 'destructive',
    requiresConfirmation: true,
    operations: tabIds.length === 0 ? [] : [{
      type: 'CLOSE_TABS',
      tabIds,
      name: null,
      color: null,
    }],
  }
}

function githubPlan(tabs: AgentTabContext[]): AgentPlanDraft {
  const tabIds = tabs
    .filter((tab) => readDomain(tab.url).endsWith('github.com'))
    .map((tab) => tab.id)

  return {
    summary: `把 ${tabIds.length} 个 GitHub 标签页放入“开发”分组`,
    reason: 'Mock Provider 使用域名规则生成可预览的结构化计划。',
    risk: 'reversible',
    requiresConfirmation: true,
    operations: tabIds.length === 0 ? [] : [{
      type: 'CREATE_GROUP',
      tabIds,
      name: '开发',
      color: 'blue',
    }],
  }
}

function mutePlan(tabs: AgentTabContext[]): AgentPlanDraft {
  const tabIds = tabs
    .filter((tab) => tab.audible && !tab.muted)
    .map((tab) => tab.id)

  return {
    summary: `静音 ${tabIds.length} 个正在播放声音的标签页`,
    reason: '只选择当前正在播放声音且尚未静音的标签页。',
    risk: 'reversible',
    requiresConfirmation: true,
    operations: tabIds.length === 0 ? [] : [{
      type: 'MUTE_TABS',
      tabIds,
      name: null,
      color: null,
    }],
  }
}

function splitSentences(content: string): string[] {
  const normalized = content.replace(/\s+/g, ' ').trim()
  const sentences = normalized
    .split(/(?<=[。！？.!?])\s*/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12)
  return sentences.length > 0 ? sentences : [normalized.slice(0, 900)]
}

function deriveTags(request: ResourceSummaryRequest): string[] {
  const tags = new Set<string>(['本地 Mock 摘要'])
  try {
    tags.add(new URL(request.url).hostname.replace(/^www\./, ''))
  } catch {
    // 请求已经经过共享协议校验，保留防御性分支。
  }
  if (request.language) tags.add(request.language)
  for (const word of request.title
    .split(/[\s·｜|：:—–\-_/]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 4)) {
    tags.add(word.slice(0, 80))
  }
  return [...tags].slice(0, 12)
}

function createMockEmbedding(text: string): number[] {
  const vector = Array<number>(MOCK_EMBEDDING_DIMENSIONS).fill(0)
  const tokens = tokenizeForEmbedding(text)
  for (const token of tokens) {
    const firstHash = hashToken(token, 2_166_136_261)
    const secondHash = hashToken(token, 1_314_238_911)
    const firstIndex = firstHash % MOCK_EMBEDDING_DIMENSIONS
    const secondIndex = secondHash % MOCK_EMBEDDING_DIMENSIONS
    vector[firstIndex] += (firstHash & 1) === 0 ? 1 : -1
    vector[secondIndex] += (secondHash & 1) === 0 ? 0.5 : -0.5
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (norm === 0) return vector.map((_, index) => (index === 0 ? 1 : 0))
  return vector.map((value) => Number((value / norm).toFixed(8)))
}

function tokenizeForEmbedding(text: string): string[] {
  const normalized = text.normalize('NFKC').toLocaleLowerCase('zh-CN')
  const words = normalized.match(/[a-z0-9]+|[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/gu) ?? []
  const bigrams: string[] = []
  for (let index = 0; index < words.length - 1; index += 1) {
    bigrams.push(`${words[index]}:${words[index + 1]}`)
  }
  return [...words, ...bigrams].slice(0, 20_000)
}

function hashToken(token: string, seed: number): number {
  let hash = seed >>> 0
  for (const character of token) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619) >>> 0
  }
  return hash
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value)
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid']) {
      url.searchParams.delete(key)
    }
    url.hash = ''
    return url.toString()
  } catch {
    return value
  }
}

function readDomain(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

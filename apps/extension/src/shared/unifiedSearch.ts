import type {
  BookmarkNodeView,
  CloudBookmarkRecord,
  HistoryEntry,
  ResourceContentRecord,
  ResourceRecord,
  SessionRecord,
  TabView,
} from './domain'
import { flattenBookmarkTree } from './bookmarks'
import { getDomain } from './url'

export const UNIFIED_SEARCH_SOURCES = [
  'tab',
  'bookmark',
  'cloud-bookmark',
  'resource',
  'session',
  'history',
] as const

export type UnifiedSearchSource = (typeof UNIFIED_SEARCH_SOURCES)[number]
export type UnifiedSearchAction = 'focus-tab' | 'open-url' | 'restore-session'

export interface UnifiedSearchDocument {
  id: string
  source: UnifiedSearchSource
  targetId: string
  action: UnifiedSearchAction
  title: string
  subtitle: string
  url?: string
  keywords: string[]
  body?: string
  updatedAt?: number
  active?: boolean
}

export interface UnifiedSearchResult extends UnifiedSearchDocument {
  score: number
  matchedFields: Array<'title' | 'url' | 'keywords' | 'subtitle' | 'body'>
}

export interface UnifiedSearchOptions {
  sources?: UnifiedSearchSource[]
  limit?: number
  now?: number
}

const RESOURCE_SEARCH_TEXT_LIMIT = 50_000

const SOURCE_BOOST: Record<UnifiedSearchSource, number> = {
  tab: 24,
  resource: 22,
  'cloud-bookmark': 20,
  bookmark: 16,
  session: 12,
  history: 8,
}

export function searchUnifiedDocuments(
  query: string,
  documents: UnifiedSearchDocument[],
  options: UnifiedSearchOptions = {},
): UnifiedSearchResult[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []
  const tokens = [...new Set(normalizedQuery.split(/\s+/).filter(Boolean))]
  const allowedSources = new Set(options.sources ?? UNIFIED_SEARCH_SOURCES)
  const now = options.now ?? Date.now()
  const limit = Math.max(1, Math.min(options.limit ?? 100, 500))

  return documents
    .filter((document) => allowedSources.has(document.source))
    .flatMap((document) => {
      const scored = scoreDocument(document, normalizedQuery, tokens, now)
      return scored ? [scored] : []
    })
    .sort((a, b) => b.score - a.score || compareUpdatedAt(a, b) || a.title.localeCompare(b.title, 'zh-CN'))
    .slice(0, limit)
}

export function createTabSearchDocuments(tabs: TabView[]): UnifiedSearchDocument[] {
  return tabs.map((tab) => ({
    id: `tab:${tab.id}`,
    source: 'tab',
    targetId: String(tab.id),
    action: 'focus-tab',
    title: tab.title,
    subtitle: `${getDomain(tab.url)} · ${tab.active ? '当前标签页' : '已打开标签页'}`,
    url: tab.url,
    keywords: [getDomain(tab.url), tab.pinned ? '固定' : '', tab.audible ? '播放声音' : ''],
    active: tab.active,
  }))
}

export function createBookmarkSearchDocuments(
  tree: BookmarkNodeView[],
): UnifiedSearchDocument[] {
  return flattenBookmarkTree(tree)
    .filter((node): node is ReturnType<typeof flattenBookmarkTree>[number] & { url: string } => Boolean(node.url))
    .map((node) => ({
      id: `bookmark:${node.id}`,
      source: 'bookmark',
      targetId: node.id,
      action: 'open-url',
      title: node.title || getDomain(node.url),
      subtitle: `原生书签 · ${getDomain(node.url)}`,
      url: node.url,
      keywords: [getDomain(node.url)],
      updatedAt: node.dateAdded,
    }))
}

export function createCloudBookmarkSearchDocuments(
  records: CloudBookmarkRecord[],
): UnifiedSearchDocument[] {
  return records.map((record) => ({
    id: `cloud-bookmark:${record.id}`,
    source: 'cloud-bookmark',
    targetId: record.id,
    action: 'open-url',
    title: record.title,
    subtitle: [record.folder || '未分类', record.archived ? '已归档' : '云收藏'].join(' · '),
    url: record.url,
    keywords: [record.folder, record.note, ...record.tags, getDomain(record.url)],
    updatedAt: Date.parse(record.updatedAt),
  }))
}

export function createResourceSearchDocuments(
  resources: ResourceRecord[],
  contents: ResourceContentRecord[],
): UnifiedSearchDocument[] {
  const contentById = new Map(contents.map((content) => [content.resourceId, content]))
  return resources.flatMap((resource) => {
    const content = contentById.get(resource.id)
    if (!content) return []
    return [{
      id: `resource:${resource.id}`,
      source: 'resource' as const,
      targetId: resource.id,
      action: 'open-url' as const,
      title: resource.title,
      subtitle: `本地网页资料 · ${resource.domain}`,
      url: resource.originalUrl,
      keywords: [
        resource.domain,
        resource.description ?? '',
        resource.language ?? '',
      ],
      body: content.text.slice(0, RESOURCE_SEARCH_TEXT_LIMIT),
      updatedAt: Date.parse(content.capturedAt),
    }]
  })
}

export function createSessionSearchDocuments(
  sessions: SessionRecord[],
): UnifiedSearchDocument[] {
  return sessions.map((session) => {
    const tabs = session.windows.flatMap((window) => window.tabs)
    const sampleTitles = tabs.slice(0, 3).map((tab) => tab.title).filter(Boolean)
    return {
      id: `session:${session.id}`,
      source: 'session' as const,
      targetId: session.id,
      action: 'restore-session' as const,
      title: session.name,
      subtitle: `${session.tabCount} 个标签页 · ${session.kind === 'auto' ? '自动快照' : '手动会话'}`,
      keywords: [
        ...tabs.flatMap((tab) => [tab.title, tab.url, getDomain(tab.url)]),
        ...sampleTitles,
      ],
      updatedAt: Date.parse(session.updatedAt),
    }
  })
}

export function createHistorySearchDocuments(
  entries: HistoryEntry[],
): UnifiedSearchDocument[] {
  return entries.map((entry) => ({
    id: `history:${entry.id}`,
    source: 'history',
    targetId: entry.id,
    action: 'open-url',
    title: entry.title,
    subtitle: `浏览历史 · ${entry.visitCount} 次访问 · ${getDomain(entry.url)}`,
    url: entry.url,
    keywords: [getDomain(entry.url), String(entry.visitCount)],
    updatedAt: entry.lastVisitTime,
  }))
}

export function sourceLabel(source: UnifiedSearchSource): string {
  if (source === 'tab') return '标签页'
  if (source === 'bookmark') return '原生书签'
  if (source === 'cloud-bookmark') return '云收藏'
  if (source === 'resource') return '网页资料'
  if (source === 'session') return '会话'
  return '浏览历史'
}

function scoreDocument(
  document: UnifiedSearchDocument,
  fullQuery: string,
  tokens: string[],
  now: number,
): UnifiedSearchResult | null {
  const title = normalizeSearchText(document.title)
  const url = normalizeSearchText(document.url ?? '')
  const subtitle = normalizeSearchText(document.subtitle)
  const keywords = normalizeSearchText(document.keywords.join(' '))
  const body = normalizeSearchText(document.body ?? '')
  const matchedFields = new Set<UnifiedSearchResult['matchedFields'][number]>()
  let score = SOURCE_BOOST[document.source]

  for (const token of tokens) {
    let tokenScore = 0
    if (title === token) {
      tokenScore = Math.max(tokenScore, 120)
      matchedFields.add('title')
    } else if (title.startsWith(token)) {
      tokenScore = Math.max(tokenScore, 90)
      matchedFields.add('title')
    } else if (title.includes(token)) {
      tokenScore = Math.max(tokenScore, 68)
      matchedFields.add('title')
    }

    if (url.includes(token)) {
      tokenScore = Math.max(tokenScore, 42)
      matchedFields.add('url')
    }
    if (keywords.includes(token)) {
      tokenScore = Math.max(tokenScore, 34)
      matchedFields.add('keywords')
    }
    if (subtitle.includes(token)) {
      tokenScore = Math.max(tokenScore, 24)
      matchedFields.add('subtitle')
    }
    if (body.includes(token)) {
      tokenScore = Math.max(tokenScore, 18)
      matchedFields.add('body')
    }
    if (tokenScore === 0) return null
    score += tokenScore
  }

  if (title === fullQuery) score += 80
  else if (title.startsWith(fullQuery)) score += 36
  if (document.active) score += 36
  score += recencyBoost(document.updatedAt, now)

  return {
    ...document,
    score,
    matchedFields: [...matchedFields],
  }
}

function recencyBoost(updatedAt: number | undefined, now: number): number {
  if (!updatedAt || !Number.isFinite(updatedAt)) return 0
  const ageDays = Math.max(0, (now - updatedAt) / (24 * 60 * 60 * 1_000))
  if (ageDays <= 1) return 18
  if (ageDays <= 7) return 12
  if (ageDays <= 30) return 7
  if (ageDays <= 90) return 3
  return 0
}

function compareUpdatedAt(a: UnifiedSearchDocument, b: UnifiedSearchDocument): number {
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/g, ' ')
    .trim()
}

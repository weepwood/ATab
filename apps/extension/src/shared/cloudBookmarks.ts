import type {
  BookmarkNodeView,
  CloudBookmarkImportCandidate,
  CloudBookmarkRecord,
} from './domain'
import { normalizeBookmarkUrl } from './bookmarks'
import { normalizeUrl } from './url'

export interface CloudBookmarkInput {
  title: string
  url: string
  folder?: string
  tags?: string[]
  note?: string
  archived?: boolean
  source?: CloudBookmarkRecord['source']
  sourceBookmarkId?: string
}

export function createCloudBookmarkRecord(
  input: CloudBookmarkInput,
  now = new Date().toISOString(),
): CloudBookmarkRecord {
  const url = normalizeBookmarkUrl(input.url)
  const title = input.title.trim() || new URL(url).hostname
  return {
    id: crypto.randomUUID(),
    title,
    url,
    canonicalUrl: normalizeUrl(url),
    folder: normalizeFolder(input.folder ?? ''),
    tags: normalizeTags(input.tags ?? []),
    note: (input.note ?? '').trim(),
    archived: input.archived === true,
    source: input.source ?? 'manual',
    sourceBookmarkId: input.sourceBookmarkId,
    createdAt: now,
    updatedAt: now,
  }
}

export function updateCloudBookmarkRecord(
  current: CloudBookmarkRecord,
  input: CloudBookmarkInput,
  now = new Date().toISOString(),
): CloudBookmarkRecord {
  const next = createCloudBookmarkRecord(input, now)
  return {
    ...next,
    id: current.id,
    createdAt: current.createdAt,
    source: input.source ?? current.source,
    sourceBookmarkId: input.sourceBookmarkId ?? current.sourceBookmarkId,
  }
}

export function toCloudBookmarkPayload(
  record: CloudBookmarkRecord,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>
}

export function parseCloudBookmarkPayload(
  entityId: string,
  payload: Record<string, unknown>,
): CloudBookmarkRecord {
  const title = readString(payload.title, '云收藏标题')
  const url = normalizeBookmarkUrl(readString(payload.url, '云收藏网址'))
  const source = payload.source === 'browser-bookmark' ? 'browser-bookmark' : 'manual'
  const createdAt = readDate(payload.createdAt)
  const updatedAt = readDate(payload.updatedAt)

  return {
    id: entityId,
    title,
    url,
    canonicalUrl: normalizeUrl(url),
    folder: normalizeFolder(typeof payload.folder === 'string' ? payload.folder : ''),
    tags: normalizeTags(Array.isArray(payload.tags) ? payload.tags.filter(isString) : []),
    note: typeof payload.note === 'string' ? payload.note.trim() : '',
    archived: payload.archived === true,
    source,
    sourceBookmarkId: typeof payload.sourceBookmarkId === 'string'
      ? payload.sourceBookmarkId
      : undefined,
    createdAt,
    updatedAt,
  }
}

export function collectCloudBookmarkImportCandidates(
  nodes: BookmarkNodeView[],
  existingCanonicalUrls: Iterable<string>,
): CloudBookmarkImportCandidate[] {
  const seen = new Set(existingCanonicalUrls)
  const candidates: CloudBookmarkImportCandidate[] = []

  const visit = (items: BookmarkNodeView[], path: string[]): void => {
    for (const node of items) {
      if (node.url) {
        try {
          const url = normalizeBookmarkUrl(node.url)
          const canonicalUrl = normalizeUrl(url)
          const duplicate = seen.has(canonicalUrl)
          candidates.push({
            sourceBookmarkId: node.id,
            title: node.title.trim() || new URL(url).hostname,
            url,
            canonicalUrl,
            folder: normalizeFolder(path.join(' / ')),
            duplicate,
          })
          seen.add(canonicalUrl)
        } catch {
          // chrome://、javascript: 等不可同步协议不会进入云收藏导入列表。
        }
        continue
      }

      const nextPath = node.title.trim() ? [...path, node.title.trim()] : path
      visit(node.children, nextPath)
    }
  }

  visit(nodes, [])
  return candidates
}

export function filterCloudBookmarks(
  records: CloudBookmarkRecord[],
  options: { query?: string; folder?: string; includeArchived?: boolean },
): CloudBookmarkRecord[] {
  const query = options.query?.trim().toLowerCase() ?? ''
  const folder = normalizeFolder(options.folder ?? '')

  return records.filter((record) => {
    if (!options.includeArchived && record.archived) return false
    if (folder && record.folder !== folder) return false
    if (!query) return true
    return [record.title, record.url, record.folder, record.note, ...record.tags]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
}

export function listCloudBookmarkFolders(records: CloudBookmarkRecord[]): string[] {
  return [...new Set(records.map((record) => record.folder).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function normalizeFolder(value: string): string {
  return value
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' / ')
    .slice(0, 240)
}

export function normalizeTags(values: string[]): string[] {
  const normalized = values
    .flatMap((value) => value.split(/[,，]/))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .map((value) => value.slice(0, 40))
  return [...new Set(normalized)].slice(0, 20)
}

function readString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空`)
  return value.trim()
}

function readDate(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error('云收藏时间字段无效')
  }
  return new Date(value).toISOString()
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

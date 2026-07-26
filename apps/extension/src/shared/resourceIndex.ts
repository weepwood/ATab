import { db } from './db'
import type {
  ResourceContentRecord,
  ResourceRecord,
  TabView,
} from './domain'
import { capturePageFromTab } from './pageCapture'
import { getDomain, normalizeUrl } from './url'

export interface ResourceLibraryItem {
  resource: ResourceRecord
  content: ResourceContentRecord
}

export async function captureAndStoreResource(tab: TabView): Promise<ResourceLibraryItem> {
  const snapshot = await capturePageFromTab(tab)
  const canonicalUrl = normalizeUrl(snapshot.canonicalUrl ?? snapshot.originalUrl)
  const now = new Date().toISOString()
  const contentHash = await sha256(snapshot.text)
  const existing = await db.resources.where('canonicalUrl').equals(canonicalUrl).first()
  const resourceId = existing?.id ?? crypto.randomUUID()

  const resource: ResourceRecord = {
    id: resourceId,
    originalUrl: snapshot.originalUrl,
    canonicalUrl,
    title: snapshot.title,
    domain: getDomain(canonicalUrl),
    faviconUrl: tab.faviconUrl ?? existing?.faviconUrl,
    description: snapshot.description,
    language: snapshot.language,
    contentHash,
    contentLength: snapshot.text.length,
    capturedAt: now,
    summaryStatus: existing?.summaryStatus ?? 'not-requested',
    embeddingStatus: existing?.embeddingStatus ?? 'not-requested',
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
  }
  const content: ResourceContentRecord = {
    resourceId,
    text: snapshot.text,
    excerpt: createResourceExcerpt(snapshot.text),
    contentHash,
    characterCount: snapshot.text.length,
    wordCount: estimateWordCount(snapshot.text),
    capturedAt: now,
  }

  await db.transaction('rw', db.resources, db.resourceContents, async () => {
    await db.resources.put(resource)
    await db.resourceContents.put(content)
  })
  return { resource, content }
}

export async function listResourceLibraryItems(): Promise<ResourceLibraryItem[]> {
  const [resources, contents] = await Promise.all([
    db.resources.orderBy('capturedAt').reverse().toArray(),
    db.resourceContents.toArray(),
  ])
  const contentById = new Map(contents.map((content) => [content.resourceId, content]))
  return resources.flatMap((resource) => {
    const content = contentById.get(resource.id)
    return content ? [{ resource, content }] : []
  })
}

export async function deleteResourceSnapshot(resourceId: string): Promise<void> {
  await db.transaction('rw', db.resources, db.resourceContents, async () => {
    await db.resourceContents.delete(resourceId)
    await db.resources.delete(resourceId)
  })
}

export function filterResourceLibraryItems(
  items: ResourceLibraryItem[],
  query: string,
): ResourceLibraryItem[] {
  const tokens = normalizeQuery(query)
  if (tokens.length === 0) return items
  return items.filter(({ resource, content }) => {
    const haystack = [
      resource.title,
      resource.originalUrl,
      resource.canonicalUrl,
      resource.domain,
      resource.description ?? '',
      content.text,
    ].join('\n').normalize('NFKC').toLocaleLowerCase('zh-CN')
    return tokens.every((token) => haystack.includes(token))
  })
}

export function findOpenTabForResource(
  resource: ResourceRecord,
  tabs: TabView[],
): TabView | undefined {
  return tabs.find((tab) => normalizeUrl(tab.url) === resource.canonicalUrl)
}

export function createResourceExcerpt(text: string, limit = 360): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= limit) return compact
  return `${compact.slice(0, Math.max(1, limit - 1)).trimEnd()}…`
}

export function estimateWordCount(text: string): number {
  const latinWords = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
  const cjkCharacters = text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)?.length ?? 0
  return latinWords + cjkCharacters
}

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeQuery(query: string): string[] {
  return [...new Set(
    query
      .normalize('NFKC')
      .toLocaleLowerCase('zh-CN')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  )]
}

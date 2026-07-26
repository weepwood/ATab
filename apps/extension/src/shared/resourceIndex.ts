import { db } from './db'
import type {
  ResourceContentRecord,
  ResourceEmbeddingRecord,
  ResourceRecord,
  ResourceSummaryRecord,
  TabView,
} from './domain'
import { requestResourceSummary } from './ai/resourceSummary'
import { capturePageFromTab } from './pageCapture'
import { getDomain, normalizeUrl } from './url'

export interface ResourceLibraryItem {
  resource: ResourceRecord
  content: ResourceContentRecord
  summary?: ResourceSummaryRecord
  embedding?: ResourceEmbeddingRecord
}

export async function captureAndStoreResource(tab: TabView): Promise<ResourceLibraryItem> {
  const snapshot = await capturePageFromTab(tab)
  const canonicalUrl = normalizeUrl(snapshot.canonicalUrl ?? snapshot.originalUrl)
  const now = new Date().toISOString()
  const contentHash = await sha256(snapshot.text)
  const existing = await db.resources.where('canonicalUrl').equals(canonicalUrl).first()
  const resourceId = existing?.id ?? crypto.randomUUID()
  const [existingSummary, existingEmbedding] = await Promise.all([
    db.resourceSummaries.get(resourceId),
    db.resourceEmbeddings.get(resourceId),
  ])

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
    summaryStatus: existingSummary?.contentHash === contentHash ? 'ready' : 'not-requested',
    embeddingStatus: existingEmbedding?.contentHash === contentHash ? 'ready' : 'not-requested',
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
  return {
    resource,
    content,
    summary: existingSummary,
    embedding: existingEmbedding,
  }
}

export async function listResourceLibraryItems(): Promise<ResourceLibraryItem[]> {
  const [resources, contents, summaries, embeddings] = await Promise.all([
    db.resources.orderBy('capturedAt').reverse().toArray(),
    db.resourceContents.toArray(),
    db.resourceSummaries.toArray(),
    db.resourceEmbeddings.toArray(),
  ])
  const contentById = new Map(contents.map((content) => [content.resourceId, content]))
  const summaryById = new Map(summaries.map((summary) => [summary.resourceId, summary]))
  const embeddingById = new Map(embeddings.map((embedding) => [embedding.resourceId, embedding]))
  return resources.flatMap((resource) => {
    const content = contentById.get(resource.id)
    return content ? [{
      resource,
      content,
      summary: summaryById.get(resource.id),
      embedding: embeddingById.get(resource.id),
    }] : []
  })
}

export async function generateAndStoreResourceSummary(
  item: ResourceLibraryItem,
): Promise<ResourceSummaryRecord> {
  await db.resources.update(item.resource.id, { summaryStatus: 'pending' })

  try {
    const response = await requestResourceSummary(item.resource, item.content)
    const currentContent = await db.resourceContents.get(item.resource.id)
    if (!currentContent || currentContent.contentHash !== item.content.contentHash) {
      throw new Error('网页正文已在摘要生成期间发生变化，请基于最新内容重新生成')
    }

    const existing = await db.resourceSummaries.get(item.resource.id)
    const now = new Date().toISOString()
    const record: ResourceSummaryRecord = {
      resourceId: item.resource.id,
      summary: response.summary.summary,
      keyPoints: response.summary.keyPoints,
      tags: response.summary.tags,
      provider: response.provider,
      model: response.model,
      contentHash: currentContent.contentHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await db.transaction('rw', db.resources, db.resourceSummaries, async () => {
      await db.resourceSummaries.put(record)
      await db.resources.update(item.resource.id, { summaryStatus: 'ready' })
    })
    return record
  } catch (cause) {
    const currentContent = await db.resourceContents.get(item.resource.id)
    if (currentContent?.contentHash === item.content.contentHash) {
      await db.resources.update(item.resource.id, { summaryStatus: 'error' })
    }
    throw cause
  }
}

export async function deleteResourceSummary(resourceId: string): Promise<void> {
  await db.transaction('rw', db.resources, db.resourceSummaries, async () => {
    await db.resourceSummaries.delete(resourceId)
    await db.resources.update(resourceId, { summaryStatus: 'not-requested' })
  })
}

export async function deleteResourceSnapshot(resourceId: string): Promise<void> {
  await db.transaction(
    'rw',
    db.resources,
    db.resourceContents,
    db.resourceSummaries,
    db.resourceEmbeddings,
    async () => {
      await db.resourceEmbeddings.delete(resourceId)
      await db.resourceSummaries.delete(resourceId)
      await db.resourceContents.delete(resourceId)
      await db.resources.delete(resourceId)
    },
  )
}

export function isResourceSummaryStale(item: ResourceLibraryItem): boolean {
  return Boolean(item.summary && item.summary.contentHash !== item.content.contentHash)
}

export function filterResourceLibraryItems(
  items: ResourceLibraryItem[],
  query: string,
): ResourceLibraryItem[] {
  const tokens = normalizeQuery(query)
  if (tokens.length === 0) return items
  return items.filter(({ resource, content, summary }) => {
    const haystack = [
      resource.title,
      resource.originalUrl,
      resource.canonicalUrl,
      resource.domain,
      resource.description ?? '',
      content.text,
      summary?.summary ?? '',
      ...(summary?.keyPoints ?? []),
      ...(summary?.tags ?? []),
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

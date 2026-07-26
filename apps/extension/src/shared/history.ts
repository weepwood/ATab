import type { HistoryEntry } from './domain'

export type HistoryRangeDays = 1 | 7 | 30 | 90

export interface HistoryGroup {
  key: string
  label: string
  entries: HistoryEntry[]
}

export async function hasHistoryPermission(): Promise<boolean> {
  return chrome.permissions.contains({ permissions: ['history'] })
}

export async function requestHistoryPermission(): Promise<boolean> {
  return chrome.permissions.request({ permissions: ['history'] })
}

export async function searchBrowserHistory(options: {
  query: string
  rangeDays: HistoryRangeDays
  maxResults?: number
}): Promise<HistoryEntry[]> {
  const items = await chrome.history.search({
    text: options.query.trim(),
    startTime: historyStartTime(options.rangeDays),
    maxResults: Math.max(1, Math.min(options.maxResults ?? 2_000, 10_000)),
  })

  return items
    .map(toHistoryEntry)
    .filter((entry): entry is HistoryEntry => entry !== null)
    .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
}

export async function deleteHistoryUrl(url: string): Promise<void> {
  await chrome.history.deleteUrl({ url })
}

export async function openHistoryUrl(url: string): Promise<void> {
  await chrome.tabs.create({ url })
}

export function historyStartTime(
  rangeDays: HistoryRangeDays,
  now = Date.now(),
): number {
  return now - rangeDays * 24 * 60 * 60 * 1_000
}

export function groupHistoryEntries(entries: HistoryEntry[]): HistoryGroup[] {
  const groups = new Map<string, HistoryEntry[]>()
  for (const entry of entries) {
    const key = localDateKey(entry.lastVisitTime)
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({
      key,
      label: formatDateLabel(items[0]?.lastVisitTime ?? Date.now()),
      entries: items.sort((a, b) => b.lastVisitTime - a.lastVisitTime),
    }))
}

export function toHistoryEntry(
  item: Pick<chrome.history.HistoryItem, 'id' | 'title' | 'url' | 'lastVisitTime' | 'visitCount' | 'typedCount'>,
): HistoryEntry | null {
  if (!item.url || !item.lastVisitTime || !isWebUrl(item.url)) return null
  return {
    id: item.id,
    title: item.title?.trim() || new URL(item.url).hostname,
    url: item.url,
    lastVisitTime: item.lastVisitTime,
    visitCount: item.visitCount ?? 0,
    typedCount: item.typedCount ?? 0,
  }
}

function isWebUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(timestamp))
}

import type {
  AgentActionPlan,
  AgentOperation,
  TabGroupColor as SharedTabGroupColor,
} from '@atab/contracts'

export interface TabView {
  id: number
  windowId: number
  groupId: number
  title: string
  url: string
  faviconUrl?: string
  active: boolean
  pinned: boolean
  audible: boolean
  muted: boolean
}

export interface BookmarkNodeView {
  id: string
  parentId?: string
  index?: number
  title: string
  url?: string
  dateAdded?: number
  dateGroupModified?: number
  children: BookmarkNodeView[]
}

export interface CloudBookmarkRecord {
  id: string
  title: string
  url: string
  canonicalUrl: string
  folder: string
  tags: string[]
  note: string
  archived: boolean
  source: 'manual' | 'browser-bookmark'
  sourceBookmarkId?: string
  createdAt: string
  updatedAt: string
}

export interface CloudBookmarkImportCandidate {
  sourceBookmarkId: string
  title: string
  url: string
  canonicalUrl: string
  folder: string
  duplicate: boolean
}

export interface HistoryEntry {
  id: string
  title: string
  url: string
  lastVisitTime: number
  visitCount: number
  typedCount: number
}

export type TabGroupColor = SharedTabGroupColor

export interface SessionGroupSnapshot {
  key: string
  title?: string
  color: TabGroupColor
  collapsed: boolean
}

export interface SessionTabSnapshot {
  title: string
  url: string
  pinned: boolean
  index: number
  groupKey?: string
}

export type SessionWindowState = 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'locked'

export interface SessionWindowSnapshot {
  key: string
  focused: boolean
  state: SessionWindowState
  groups: SessionGroupSnapshot[]
  tabs: SessionTabSnapshot[]
}

export interface SessionRecord {
  id: string
  name: string
  kind: 'manual' | 'auto'
  createdAt: string
  updatedAt: string
  tabCount: number
  windows: SessionWindowSnapshot[]
}

export interface SessionRestoreResult {
  restoredTabs: number
  skippedTabs: number
  createdWindows: number
}

export type ResourceProcessingStatus = 'not-requested' | 'pending' | 'ready' | 'error'

export interface ResourceRecord {
  id: string
  originalUrl: string
  canonicalUrl: string
  title: string
  domain: string
  faviconUrl?: string
  description?: string
  language?: string
  contentHash?: string
  contentLength?: number
  capturedAt?: string
  summaryStatus?: ResourceProcessingStatus
  embeddingStatus?: ResourceProcessingStatus
  firstSeenAt: string
  lastSeenAt: string
}

export interface ResourceContentRecord {
  resourceId: string
  text: string
  excerpt: string
  contentHash: string
  characterCount: number
  wordCount: number
  capturedAt: string
}

export interface ResourceSummaryRecord {
  resourceId: string
  summary: string
  keyPoints: string[]
  tags: string[]
  provider: string
  model?: string
  contentHash: string
  createdAt: string
  updatedAt: string
}

export type AiOperation = AgentOperation
export type AiActionPlan = AgentActionPlan

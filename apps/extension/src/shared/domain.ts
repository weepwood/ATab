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

export type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange'

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

export interface ResourceRecord {
  id: string
  originalUrl: string
  canonicalUrl: string
  title: string
  domain: string
  faviconUrl?: string
  firstSeenAt: string
  lastSeenAt: string
}

export type AiOperation =
  | { type: 'CREATE_GROUP'; tabIds: number[]; name: string; color: TabGroupColor }
  | { type: 'CLOSE_TABS'; tabIds: number[] }
  | { type: 'MUTE_TABS'; tabIds: number[] }

export interface AiActionPlan {
  id: string
  summary: string
  reason: string
  risk: 'read-only' | 'reversible' | 'destructive'
  requiresConfirmation: boolean
  createdAt: string
  operations: AiOperation[]
}

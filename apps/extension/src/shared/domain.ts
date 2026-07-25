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

export type AiOperation = AgentOperation
export type AiActionPlan = AgentActionPlan

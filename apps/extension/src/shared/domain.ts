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

export interface SessionRecord {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  tabs: Array<Pick<TabView, 'title' | 'url' | 'pinned'>>
}

export type AiOperation =
  | { type: 'CREATE_GROUP'; tabIds: number[]; name: string; color: 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange' }
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

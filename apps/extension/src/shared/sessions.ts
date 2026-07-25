import type {
  SessionGroupSnapshot,
  SessionRecord,
  SessionWindowSnapshot,
  TabGroupColor,
} from './domain'

const RESTORABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:'])
const GROUP_COLORS = new Set<TabGroupColor>([
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
])

export function isRestorableUrl(value: string): boolean {
  try {
    return RESTORABLE_PROTOCOLS.has(new URL(value).protocol)
  } catch {
    return false
  }
}

export function createSessionRecord(
  name: string,
  kind: SessionRecord['kind'],
  windows: SessionWindowSnapshot[],
  now = new Date(),
): SessionRecord {
  const timestamp = now.toISOString()
  const normalizedWindows = windows
    .map((window) => ({
      ...window,
      tabs: window.tabs
        .filter((tab) => isRestorableUrl(tab.url))
        .sort((a, b) => a.index - b.index),
    }))
    .filter((window) => window.tabs.length > 0)

  return {
    id: crypto.randomUUID(),
    name: name.trim() || defaultSessionName(kind, now),
    kind,
    createdAt: timestamp,
    updatedAt: timestamp,
    tabCount: normalizedWindows.reduce((count, window) => count + window.tabs.length, 0),
    windows: normalizedWindows,
  }
}

export function sessionExportFileName(session: SessionRecord): string {
  const safeName = session.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'ATab-会话'
  return `${safeName}.atab-session.json`
}

export function parseSessionImport(value: unknown): SessionRecord {
  if (!isObject(value)) throw new Error('会话文件格式无效')
  if (typeof value.name !== 'string' || !Array.isArray(value.windows)) {
    throw new Error('会话文件缺少名称或窗口数据')
  }

  const windows = value.windows.map(parseWindow)
  const session = createSessionRecord(value.name, 'manual', windows)
  if (session.tabCount === 0) throw new Error('会话文件中没有可恢复的网址')
  return session
}

function defaultSessionName(kind: SessionRecord['kind'], now: Date): string {
  const date = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
  return kind === 'auto' ? `自动快照 ${date}` : `浏览会话 ${date}`
}

function parseWindow(value: unknown, index: number): SessionWindowSnapshot {
  if (!isObject(value) || !Array.isArray(value.tabs)) {
    throw new Error(`第 ${index + 1} 个窗口格式无效`)
  }

  const groups = Array.isArray(value.groups)
    ? value.groups.map(parseGroup)
    : []

  const tabs = value.tabs.map((tab, tabIndex) => {
    if (!isObject(tab) || typeof tab.url !== 'string') {
      throw new Error(`第 ${index + 1} 个窗口中的第 ${tabIndex + 1} 个标签格式无效`)
    }
    return {
      title: typeof tab.title === 'string' ? tab.title : tab.url,
      url: tab.url,
      pinned: Boolean(tab.pinned),
      index: typeof tab.index === 'number' ? tab.index : tabIndex,
      groupKey: typeof tab.groupKey === 'string' ? tab.groupKey : undefined,
    }
  })

  return {
    key: typeof value.key === 'string' ? value.key : `imported-${index}`,
    focused: Boolean(value.focused),
    state: isWindowState(value.state) ? value.state : 'normal',
    groups,
    tabs,
  }
}

function parseGroup(value: unknown, index: number): SessionGroupSnapshot {
  if (!isObject(value)) throw new Error(`第 ${index + 1} 个标签组格式无效`)
  const color = typeof value.color === 'string' && GROUP_COLORS.has(value.color as TabGroupColor)
    ? value.color as TabGroupColor
    : 'grey'
  return {
    key: typeof value.key === 'string' ? value.key : `group-${index}`,
    title: typeof value.title === 'string' ? value.title : undefined,
    color,
    collapsed: Boolean(value.collapsed),
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isWindowState(value: unknown): value is SessionWindowSnapshot['state'] {
  return value === 'normal'
    || value === 'minimized'
    || value === 'maximized'
    || value === 'fullscreen'
    || value === 'locked'
}

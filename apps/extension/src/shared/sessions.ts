import type {
  SessionGroupSnapshot,
  SessionRecord,
  SessionWindowSnapshot,
  TabGroupColor,
} from './domain'

export const SESSION_IMPORT_MAX_BYTES = 2 * 1024 * 1024
export const SESSION_MAX_WINDOWS = 20
export const SESSION_MAX_TOTAL_TABS = 500
export const SESSION_MAX_TABS_PER_WINDOW = 200
export const SESSION_MAX_GROUPS_PER_WINDOW = 100

const SESSION_NAME_MAX_LENGTH = 200
const TAB_TITLE_MAX_LENGTH = 500
const URL_MAX_LENGTH = 8192
const KEY_MAX_LENGTH = 200
const GROUP_TITLE_MAX_LENGTH = 200

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
  if (!value || value.length > URL_MAX_LENGTH) return false
  try {
    return RESTORABLE_PROTOCOLS.has(new URL(value).protocol)
  } catch {
    return false
  }
}

export function assertSessionImportTextSize(text: string): void {
  if (new Blob([text]).size > SESSION_IMPORT_MAX_BYTES) {
    throw new Error('会话文件不能超过 2 MB')
  }
}

export function createSessionRecord(
  name: string,
  kind: SessionRecord['kind'],
  windows: SessionWindowSnapshot[],
  now = new Date(),
): SessionRecord {
  assertWindowCount(windows.length)
  const timestamp = now.toISOString()
  const normalizedWindows = windows
    .map((window, index) => normalizeWindow(window, index))
    .filter((window) => window.tabs.length > 0)
  const tabCount = normalizedWindows.reduce((count, window) => count + window.tabs.length, 0)
  assertTotalTabCount(tabCount)

  return {
    id: crypto.randomUUID(),
    name: normalizeText(name, SESSION_NAME_MAX_LENGTH) || defaultSessionName(kind, now),
    kind,
    createdAt: timestamp,
    updatedAt: timestamp,
    tabCount,
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

  assertWindowCount(value.windows.length)
  const windows = value.windows.map(parseWindow)
  const session = createSessionRecord(value.name, 'manual', windows)
  if (session.tabCount === 0) throw new Error('会话文件中没有可恢复的网址')
  return session
}

function normalizeWindow(window: SessionWindowSnapshot, index: number): SessionWindowSnapshot {
  assertTabsPerWindow(window.tabs.length, index)
  assertGroupsPerWindow(window.groups.length, index)
  return {
    key: normalizeText(window.key, KEY_MAX_LENGTH) || `window-${index}`,
    focused: Boolean(window.focused),
    state: isWindowState(window.state) ? window.state : 'normal',
    groups: window.groups.slice(0, SESSION_MAX_GROUPS_PER_WINDOW).map((group, groupIndex) => ({
      key: normalizeText(group.key, KEY_MAX_LENGTH) || `group-${index}-${groupIndex}`,
      title: group.title ? normalizeText(group.title, GROUP_TITLE_MAX_LENGTH) : undefined,
      color: GROUP_COLORS.has(group.color) ? group.color : 'grey',
      collapsed: Boolean(group.collapsed),
    })),
    tabs: window.tabs
      .filter((tab) => isRestorableUrl(tab.url))
      .map((tab, tabIndex) => ({
        title: normalizeText(tab.title || tab.url, TAB_TITLE_MAX_LENGTH),
        url: tab.url,
        pinned: Boolean(tab.pinned),
        index: Number.isInteger(tab.index) && tab.index >= 0 ? tab.index : tabIndex,
        groupKey: tab.groupKey ? normalizeText(tab.groupKey, KEY_MAX_LENGTH) : undefined,
      }))
      .sort((a, b) => a.index - b.index),
  }
}

function parseWindow(value: unknown, index: number): SessionWindowSnapshot {
  if (!isObject(value) || !Array.isArray(value.tabs)) {
    throw new Error(`第 ${index + 1} 个窗口格式无效`)
  }

  assertTabsPerWindow(value.tabs.length, index)
  const rawGroups = Array.isArray(value.groups) ? value.groups : []
  assertGroupsPerWindow(rawGroups.length, index)
  const groups = rawGroups.map((group, groupIndex) => parseGroup(group, index, groupIndex))

  const tabs = value.tabs.map((tab, tabIndex) => {
    if (!isObject(tab) || typeof tab.url !== 'string') {
      throw new Error(`第 ${index + 1} 个窗口中的第 ${tabIndex + 1} 个标签格式无效`)
    }
    if (tab.url.length > URL_MAX_LENGTH) {
      throw new Error(`第 ${index + 1} 个窗口中的第 ${tabIndex + 1} 个网址过长`)
    }
    return {
      title: typeof tab.title === 'string'
        ? normalizeText(tab.title, TAB_TITLE_MAX_LENGTH)
        : tab.url,
      url: tab.url,
      pinned: Boolean(tab.pinned),
      index: typeof tab.index === 'number' && Number.isInteger(tab.index) && tab.index >= 0
        ? tab.index
        : tabIndex,
      groupKey: typeof tab.groupKey === 'string'
        ? normalizeText(tab.groupKey, KEY_MAX_LENGTH)
        : undefined,
    }
  })

  return {
    key: typeof value.key === 'string'
      ? normalizeText(value.key, KEY_MAX_LENGTH)
      : `imported-${index}`,
    focused: Boolean(value.focused),
    state: isWindowState(value.state) ? value.state : 'normal',
    groups,
    tabs,
  }
}

function parseGroup(value: unknown, windowIndex: number, groupIndex: number): SessionGroupSnapshot {
  if (!isObject(value)) {
    throw new Error(`第 ${windowIndex + 1} 个窗口中的第 ${groupIndex + 1} 个标签组格式无效`)
  }
  const color = typeof value.color === 'string' && GROUP_COLORS.has(value.color as TabGroupColor)
    ? value.color as TabGroupColor
    : 'grey'
  return {
    key: typeof value.key === 'string'
      ? normalizeText(value.key, KEY_MAX_LENGTH)
      : `group-${windowIndex}-${groupIndex}`,
    title: typeof value.title === 'string'
      ? normalizeText(value.title, GROUP_TITLE_MAX_LENGTH)
      : undefined,
    color,
    collapsed: Boolean(value.collapsed),
  }
}

function assertWindowCount(count: number): void {
  if (count > SESSION_MAX_WINDOWS) throw new Error(`会话最多包含 ${SESSION_MAX_WINDOWS} 个窗口`)
}

function assertTabsPerWindow(count: number, index: number): void {
  if (count > SESSION_MAX_TABS_PER_WINDOW) {
    throw new Error(`第 ${index + 1} 个窗口最多包含 ${SESSION_MAX_TABS_PER_WINDOW} 个标签`)
  }
}

function assertGroupsPerWindow(count: number, index: number): void {
  if (count > SESSION_MAX_GROUPS_PER_WINDOW) {
    throw new Error(`第 ${index + 1} 个窗口最多包含 ${SESSION_MAX_GROUPS_PER_WINDOW} 个标签组`)
  }
}

function assertTotalTabCount(count: number): void {
  if (count > SESSION_MAX_TOTAL_TABS) {
    throw new Error(`会话最多包含 ${SESSION_MAX_TOTAL_TABS} 个可恢复标签`)
  }
}

function normalizeText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength)
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

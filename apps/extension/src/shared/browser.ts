import type {
  AiOperation,
  BookmarkNodeView,
  SessionRecord,
  SessionRestoreResult,
  SessionWindowSnapshot,
  SessionWindowState,
  TabView,
} from './domain'

function toTabView(tab: chrome.tabs.Tab): TabView | null {
  if (tab.id === undefined) return null
  return {
    id: tab.id,
    windowId: tab.windowId,
    groupId: tab.groupId,
    title: tab.title || '未命名标签页',
    url: tab.url || '',
    faviconUrl: tab.favIconUrl,
    active: tab.active,
    pinned: tab.pinned,
    audible: Boolean(tab.audible),
    muted: Boolean(tab.mutedInfo?.muted),
  }
}

function toBookmarkNode(node: chrome.bookmarks.BookmarkTreeNode): BookmarkNodeView {
  return {
    id: node.id,
    parentId: node.parentId,
    index: node.index,
    title: node.title,
    url: node.url,
    dateAdded: node.dateAdded,
    dateGroupModified: node.dateGroupModified,
    children: (node.children ?? []).map(toBookmarkNode),
  }
}

function toSessionWindowState(state: chrome.windows.WindowState | undefined): SessionWindowState {
  if (state === 'minimized' || state === 'maximized' || state === 'fullscreen' || state === 'locked') {
    return state
  }
  return 'normal'
}

async function captureWindow(window: chrome.windows.Window): Promise<SessionWindowSnapshot | null> {
  if (window.id === undefined) return null
  const groups = await chrome.tabGroups.query({ windowId: window.id })
  const groupKeys = new Map<number, string>()
  const groupSnapshots = groups.map((group) => {
    const key = `${window.id}:${group.id}`
    groupKeys.set(group.id, key)
    return {
      key,
      title: group.title,
      color: group.color,
      collapsed: group.collapsed,
    }
  })

  return {
    key: String(window.id),
    focused: window.focused,
    state: toSessionWindowState(window.state),
    groups: groupSnapshots,
    tabs: (window.tabs ?? []).flatMap((tab) => {
      if (!tab.url) return []
      return [{
        title: tab.title || tab.url,
        url: tab.url,
        pinned: tab.pinned,
        index: tab.index,
        groupKey: tab.groupId >= 0 ? groupKeys.get(tab.groupId) : undefined,
      }]
    }),
  }
}

export const browserGateway = {
  async listTabs(): Promise<TabView[]> {
    const tabs = await chrome.tabs.query({})
    return tabs.map(toTabView).filter((tab): tab is TabView => tab !== null)
  },

  async focusTab(tabId: number): Promise<void> {
    const tab = await chrome.tabs.get(tabId)
    await chrome.tabs.update(tabId, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
  },

  async closeTabs(tabIds: number[]): Promise<void> {
    if (tabIds.length > 0) await chrome.tabs.remove(tabIds)
  },

  async togglePinned(tab: TabView): Promise<void> {
    await chrome.tabs.update(tab.id, { pinned: !tab.pinned })
  },

  async toggleMuted(tab: TabView): Promise<void> {
    await chrome.tabs.update(tab.id, { muted: !tab.muted })
  },

  async listBookmarks(): Promise<BookmarkNodeView[]> {
    return (await chrome.bookmarks.getTree()).map(toBookmarkNode)
  },

  async openBookmark(url: string): Promise<void> {
    await chrome.tabs.create({ url })
  },

  async createBookmark(input: {
    parentId: string
    title: string
    url?: string
  }): Promise<void> {
    await chrome.bookmarks.create(input)
  },

  async updateBookmark(input: {
    id: string
    title: string
    url?: string
  }): Promise<void> {
    const changes: chrome.bookmarks.UpdateChanges = { title: input.title }
    if (input.url) changes.url = input.url
    await chrome.bookmarks.update(input.id, changes)
  },

  async moveBookmark(id: string, parentId: string): Promise<void> {
    await chrome.bookmarks.move(id, { parentId })
  },

  async removeBookmark(node: BookmarkNodeView): Promise<void> {
    if (node.url) {
      await chrome.bookmarks.remove(node.id)
      return
    }
    await chrome.bookmarks.removeTree(node.id)
  },

  async captureSession(scope: 'current' | 'all'): Promise<SessionWindowSnapshot[]> {
    const windows = scope === 'current'
      ? [await chrome.windows.getCurrent({ populate: true })]
      : await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })
    const snapshots = await Promise.all(windows.map(captureWindow))
    return snapshots.filter((window): window is SessionWindowSnapshot => window !== null)
  },

  async restoreSession(session: SessionRecord): Promise<SessionRestoreResult> {
    const result: SessionRestoreResult = {
      restoredTabs: 0,
      skippedTabs: 0,
      createdWindows: 0,
    }
    let firstCreatedWindowId: number | undefined

    for (const windowSnapshot of session.windows) {
      const [firstTab, ...remainingTabs] = windowSnapshot.tabs
      if (!firstTab) continue

      try {
        const createdWindow = await chrome.windows.create({ url: firstTab.url, focused: false })
        if (createdWindow.id === undefined || createdWindow.tabs?.[0]?.id === undefined) {
          result.skippedTabs += windowSnapshot.tabs.length
          continue
        }

        firstCreatedWindowId ??= createdWindow.id
        result.createdWindows += 1
        const createdByGroup = new Map<string, number[]>()
        const firstCreatedTabId = createdWindow.tabs[0].id
        await chrome.tabs.update(firstCreatedTabId, { pinned: firstTab.pinned })
        result.restoredTabs += 1
        if (firstTab.groupKey) createdByGroup.set(firstTab.groupKey, [firstCreatedTabId])

        for (const tab of remainingTabs) {
          try {
            const created = await chrome.tabs.create({
              windowId: createdWindow.id,
              url: tab.url,
              active: false,
              pinned: tab.pinned,
            })
            if (created.id === undefined) {
              result.skippedTabs += 1
              continue
            }
            result.restoredTabs += 1
            if (tab.groupKey) {
              createdByGroup.set(tab.groupKey, [
                ...(createdByGroup.get(tab.groupKey) ?? []),
                created.id,
              ])
            }
          } catch {
            result.skippedTabs += 1
          }
        }

        for (const group of windowSnapshot.groups) {
          const tabIds = createdByGroup.get(group.key) ?? []
          if (tabIds.length === 0) continue
          const groupId = await chrome.tabs.group({
            tabIds,
            createProperties: { windowId: createdWindow.id },
          })
          await chrome.tabGroups.update(groupId, {
            title: group.title,
            color: group.color,
            collapsed: group.collapsed,
          })
        }

        if (windowSnapshot.state !== 'normal' && windowSnapshot.state !== 'locked') {
          await chrome.windows.update(createdWindow.id, { state: windowSnapshot.state })
        }
      } catch {
        result.skippedTabs += windowSnapshot.tabs.length
      }
    }

    if (firstCreatedWindowId !== undefined) {
      await chrome.windows.update(firstCreatedWindowId, { focused: true })
    }
    return result
  },

  async executeOperation(operation: AiOperation): Promise<void> {
    const existing = new Set(
      (await chrome.tabs.query({})).flatMap((tab) => (tab.id === undefined ? [] : [tab.id])),
    )
    const validIds = operation.tabIds.filter((id) => existing.has(id))
    if (validIds.length === 0) return

    if (operation.type === 'CLOSE_TABS') {
      await chrome.tabs.remove(validIds)
      return
    }

    if (operation.type === 'MUTE_TABS') {
      await Promise.all(validIds.map((id) => chrome.tabs.update(id, { muted: true })))
      return
    }

    const groupId = await chrome.tabs.group({ tabIds: validIds })
    await chrome.tabGroups.update(groupId, {
      title: operation.name,
      color: operation.color,
      collapsed: false,
    })
  },
}

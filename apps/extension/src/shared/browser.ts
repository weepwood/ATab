import type { AiOperation, BookmarkNodeView, TabView } from './domain'

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
    const changes: chrome.bookmarks.BookmarkChangesArg = { title: input.title }
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

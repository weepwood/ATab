import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  findBookmarkNode,
  flattenBookmarkTree,
  getBookmarkMoveTargets,
  normalizeBookmarkUrl,
} from '@/shared/bookmarks'
import { browserGateway } from '@/shared/browser'
import type { BookmarkNodeView } from '@/shared/domain'

export const useBookmarksStore = defineStore('bookmarks', () => {
  const roots = ref<BookmarkNodeView[]>([])
  const query = ref('')
  const activeFolderId = ref<string | null>(null)
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref('')

  const allNodes = computed(() => flattenBookmarkTree(roots.value))
  const folders = computed(() => allNodes.value.filter((node) => !node.url))
  const activeFolder = computed(() => {
    if (!activeFolderId.value) return roots.value[0]
    return findBookmarkNode(roots.value, activeFolderId.value) ?? roots.value[0]
  })

  const visibleItems = computed(() => {
    const keyword = query.value.trim().toLowerCase()
    if (keyword) {
      return allNodes.value.filter((node) => {
        if (!node.parentId) return false
        return `${node.title} ${node.url ?? ''}`.toLowerCase().includes(keyword)
      })
    }
    return activeFolder.value?.children ?? []
  })

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      roots.value = await browserGateway.listBookmarks()
      if (!activeFolderId.value || !findBookmarkNode(roots.value, activeFolderId.value)) {
        activeFolderId.value = roots.value[0]?.id ?? null
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '读取书签失败'
    } finally {
      loading.value = false
    }
  }

  function selectFolder(id: string): void {
    const node = findBookmarkNode(roots.value, id)
    if (node && !node.url) activeFolderId.value = id
  }

  async function openNode(node: BookmarkNodeView): Promise<void> {
    if (node.url) {
      await browserGateway.openBookmark(node.url)
      return
    }
    selectFolder(node.id)
  }

  async function runMutation(action: () => Promise<void>): Promise<void> {
    mutating.value = true
    error.value = ''
    try {
      await action()
      await refresh()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '书签操作失败'
      throw cause
    } finally {
      mutating.value = false
    }
  }

  async function createFolder(title: string): Promise<void> {
    const parentId = activeFolder.value?.id
    const normalizedTitle = title.trim()
    if (!parentId) throw new Error('没有可用的父文件夹')
    if (!normalizedTitle) throw new Error('请输入文件夹名称')
    await runMutation(() => browserGateway.createBookmark({ parentId, title: normalizedTitle }))
  }

  async function createBookmark(title: string, url: string): Promise<void> {
    const parentId = activeFolder.value?.id
    if (!parentId) throw new Error('没有可用的父文件夹')
    const normalizedUrl = normalizeBookmarkUrl(url)
    const normalizedTitle = title.trim() || new URL(normalizedUrl).hostname
    await runMutation(() => browserGateway.createBookmark({
      parentId,
      title: normalizedTitle,
      url: normalizedUrl,
    }))
  }

  async function updateNode(node: BookmarkNodeView, title: string, url: string): Promise<void> {
    const normalizedTitle = title.trim()
    if (!normalizedTitle) throw new Error('名称不能为空')
    const normalizedUrl = node.url ? normalizeBookmarkUrl(url) : undefined
    await runMutation(() => browserGateway.updateBookmark({
      id: node.id,
      title: normalizedTitle,
      url: normalizedUrl,
    }))
  }

  function moveTargets(nodeId: string): ReturnType<typeof getBookmarkMoveTargets> {
    return getBookmarkMoveTargets(roots.value, nodeId)
  }

  async function moveNode(node: BookmarkNodeView, parentId: string): Promise<void> {
    const allowed = moveTargets(node.id).some((target) => target.id === parentId)
    if (!allowed) throw new Error('不能移动到当前节点或其子目录')
    await runMutation(() => browserGateway.moveBookmark(node.id, parentId))
  }

  async function deleteNode(node: BookmarkNodeView): Promise<void> {
    if (!node.parentId) throw new Error('不能删除书签根节点')
    await runMutation(() => browserGateway.removeBookmark(node))
  }

  return {
    roots,
    query,
    activeFolderId,
    loading,
    mutating,
    error,
    allNodes,
    folders,
    activeFolder,
    visibleItems,
    refresh,
    selectFolder,
    openNode,
    createFolder,
    createBookmark,
    updateNode,
    moveTargets,
    moveNode,
    deleteNode,
  }
})

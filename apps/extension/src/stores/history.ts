import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createCloudBookmark } from '@/shared/cloudBookmarkService'
import { db } from '@/shared/db'
import type { HistoryEntry } from '@/shared/domain'
import {
  deleteHistoryUrl,
  groupHistoryEntries,
  hasHistoryPermission,
  openHistoryUrl,
  requestHistoryPermission,
  searchBrowserHistory,
  type HistoryRangeDays,
} from '@/shared/history'
import { normalizeUrl } from '@/shared/url'

export const useHistoryStore = defineStore('history', () => {
  const permissionGranted = ref(false)
  const initialized = ref(false)
  const query = ref('')
  const rangeDays = ref<HistoryRangeDays>(7)
  const entries = ref<HistoryEntry[]>([])
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref('')
  const message = ref('')
  const savedIds = ref<string[]>([])

  const groups = computed(() => groupHistoryEntries(entries.value))

  async function initialize(): Promise<void> {
    permissionGranted.value = await hasHistoryPermission()
    initialized.value = true
    if (permissionGranted.value) await refresh()
  }

  async function grantPermission(): Promise<void> {
    error.value = ''
    permissionGranted.value = await requestHistoryPermission()
    if (!permissionGranted.value) {
      error.value = '未授予浏览历史权限。其他功能仍可正常使用。'
      return
    }
    await refresh()
  }

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = ''
    message.value = ''
    try {
      permissionGranted.value = await hasHistoryPermission()
      if (!permissionGranted.value) {
        entries.value = []
        return
      }
      entries.value = await searchBrowserHistory({
        query: query.value,
        rangeDays: rangeDays.value,
      })
    } catch (cause) {
      error.value = messageOf(cause)
    } finally {
      loading.value = false
    }
  }

  async function open(entry: HistoryEntry): Promise<void> {
    await openHistoryUrl(entry.url)
  }

  async function remove(entry: HistoryEntry): Promise<void> {
    mutating.value = true
    error.value = ''
    message.value = ''
    try {
      await deleteHistoryUrl(entry.url)
      entries.value = entries.value.filter((item) => item.url !== entry.url)
      message.value = '已删除该网址的浏览历史记录。'
    } catch (cause) {
      error.value = messageOf(cause)
      throw cause
    } finally {
      mutating.value = false
    }
  }

  async function saveToCloud(entry: HistoryEntry): Promise<void> {
    mutating.value = true
    error.value = ''
    message.value = ''
    try {
      const canonicalUrl = normalizeUrl(entry.url)
      const existing = await db.cloudBookmarks.where('canonicalUrl').equals(canonicalUrl).first()
      if (existing) {
        savedIds.value = [...new Set([...savedIds.value, entry.id])]
        message.value = '该页面已存在于云收藏。'
        return
      }
      await createCloudBookmark({
        title: entry.title,
        url: entry.url,
        folder: '浏览历史',
        tags: ['history'],
        note: `从浏览历史保存，最近访问：${new Date(entry.lastVisitTime).toLocaleString('zh-CN')}`,
      })
      savedIds.value = [...new Set([...savedIds.value, entry.id])]
      message.value = '已保存到云收藏，并进入同步队列。'
    } catch (cause) {
      error.value = messageOf(cause)
      throw cause
    } finally {
      mutating.value = false
    }
  }

  return {
    permissionGranted,
    initialized,
    query,
    rangeDays,
    entries,
    loading,
    mutating,
    error,
    message,
    savedIds,
    groups,
    initialize,
    grantPermission,
    refresh,
    open,
    remove,
    saveToCloud,
  }
})

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : '浏览历史操作失败'
}

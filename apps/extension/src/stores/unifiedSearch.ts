import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { browserGateway } from '@/shared/browser'
import { db } from '@/shared/db'
import { hasHistoryPermission, searchBrowserHistory } from '@/shared/history'
import {
  createBookmarkSearchDocuments,
  createCloudBookmarkSearchDocuments,
  createHistorySearchDocuments,
  createSessionSearchDocuments,
  createTabSearchDocuments,
  searchUnifiedDocuments,
  UNIFIED_SEARCH_SOURCES,
  type UnifiedSearchResult,
  type UnifiedSearchSource,
} from '@/shared/unifiedSearch'

export const useUnifiedSearchStore = defineStore('unified-search', () => {
  const query = ref('')
  const selectedSources = ref<UnifiedSearchSource[]>([...UNIFIED_SEARCH_SOURCES])
  const results = ref<UnifiedSearchResult[]>([])
  const loading = ref(false)
  const executing = ref(false)
  const error = ref('')
  const historyAvailable = ref(false)
  const selectedIndex = ref(0)
  let searchGeneration = 0

  const selectedResult = computed(() => results.value[selectedIndex.value] ?? null)
  const sourceCounts = computed(() => {
    const counts = Object.fromEntries(
      UNIFIED_SEARCH_SOURCES.map((source) => [source, 0]),
    ) as Record<UnifiedSearchSource, number>
    for (const result of results.value) counts[result.source] += 1
    return counts
  })

  async function search(): Promise<void> {
    const normalizedQuery = query.value.trim()
    const generation = ++searchGeneration
    if (!normalizedQuery) {
      results.value = []
      selectedIndex.value = 0
      error.value = ''
      return
    }

    loading.value = true
    error.value = ''
    try {
      historyAvailable.value = await hasHistoryPermission()
      const [tabs, bookmarkTree, cloudBookmarks, sessions, history] = await Promise.all([
        browserGateway.listTabs(),
        browserGateway.listBookmarks(),
        db.cloudBookmarks.toArray(),
        db.sessions.toArray(),
        historyAvailable.value && selectedSources.value.includes('history')
          ? searchBrowserHistory({ query: normalizedQuery, rangeDays: 90, maxResults: 500 })
          : Promise.resolve([]),
      ])
      if (generation !== searchGeneration) return

      const documents = [
        ...createTabSearchDocuments(tabs),
        ...createBookmarkSearchDocuments(bookmarkTree),
        ...createCloudBookmarkSearchDocuments(cloudBookmarks),
        ...createSessionSearchDocuments(sessions),
        ...createHistorySearchDocuments(history),
      ]
      results.value = searchUnifiedDocuments(normalizedQuery, documents, {
        sources: selectedSources.value,
        limit: 120,
      })
      selectedIndex.value = results.value.length > 0 ? 0 : -1
    } catch (cause) {
      if (generation === searchGeneration) {
        results.value = []
        selectedIndex.value = -1
        error.value = cause instanceof Error ? cause.message : '统一搜索失败'
      }
    } finally {
      if (generation === searchGeneration) loading.value = false
    }
  }

  function toggleSource(source: UnifiedSearchSource): void {
    selectedSources.value = selectedSources.value.includes(source)
      ? selectedSources.value.filter((item) => item !== source)
      : [...selectedSources.value, source]
    if (selectedSources.value.length === 0) selectedSources.value = [source]
  }

  function moveSelection(offset: number): void {
    if (results.value.length === 0) {
      selectedIndex.value = -1
      return
    }
    selectedIndex.value = (
      selectedIndex.value + offset + results.value.length
    ) % results.value.length
  }

  function select(index: number): void {
    if (index >= 0 && index < results.value.length) selectedIndex.value = index
  }

  async function execute(result = selectedResult.value): Promise<void> {
    if (!result) return
    executing.value = true
    error.value = ''
    try {
      if (result.action === 'focus-tab') {
        await browserGateway.focusTab(Number(result.targetId))
        return
      }
      if (result.action === 'open-url' && result.url) {
        await browserGateway.openBookmark(result.url)
        return
      }
      if (result.action === 'restore-session') {
        const session = await db.sessions.get(result.targetId)
        if (!session) throw new Error('该会话已不存在，请重新搜索')
        await browserGateway.restoreSession(session)
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '执行搜索结果失败'
      throw cause
    } finally {
      executing.value = false
    }
  }

  return {
    query,
    selectedSources,
    results,
    loading,
    executing,
    error,
    historyAvailable,
    selectedIndex,
    selectedResult,
    sourceCounts,
    search,
    toggleSource,
    moveSelection,
    select,
    execute,
  }
})

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { browserGateway } from '@/shared/browser'
import { db } from '@/shared/db'
import { hasHistoryPermission, searchBrowserHistory } from '@/shared/history'
import {
  getSemanticSearchEnabled,
  mergeSemanticSearchResults,
  searchSemanticResources,
  setSemanticSearchEnabled,
} from '@/shared/semanticSearch'
import {
  createBookmarkSearchDocuments,
  createCloudBookmarkSearchDocuments,
  createHistorySearchDocuments,
  createResourceSearchDocuments,
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
  const semanticEnabled = ref(false)
  const semanticLoading = ref(false)
  const semanticError = ref('')
  const semanticMatchCount = ref(0)
  let searchGeneration = 0
  let semanticGeneration = 0

  const selectedResult = computed(() => results.value[selectedIndex.value] ?? null)
  const sourceCounts = computed(() => {
    const counts = Object.fromEntries(
      UNIFIED_SEARCH_SOURCES.map((source) => [source, 0]),
    ) as Record<UnifiedSearchSource, number>
    for (const result of results.value) counts[result.source] += 1
    return counts
  })

  async function loadSemanticSettings(): Promise<void> {
    semanticEnabled.value = await getSemanticSearchEnabled()
  }

  async function enableSemanticSearch(): Promise<void> {
    await setSemanticSearchEnabled(true)
    semanticEnabled.value = true
    semanticError.value = ''
  }

  async function disableSemanticSearch(): Promise<void> {
    semanticGeneration += 1
    await setSemanticSearchEnabled(false)
    semanticEnabled.value = false
    semanticLoading.value = false
    semanticError.value = ''
    semanticMatchCount.value = 0
  }

  async function search(): Promise<void> {
    const normalizedQuery = query.value.trim()
    const generation = ++searchGeneration
    semanticGeneration += 1
    semanticLoading.value = false
    semanticError.value = ''
    semanticMatchCount.value = 0

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
      const [
        tabs,
        bookmarkTree,
        cloudBookmarks,
        resources,
        resourceContents,
        sessions,
        history,
      ] = await Promise.all([
        browserGateway.listTabs(),
        browserGateway.listBookmarks(),
        db.cloudBookmarks.toArray(),
        selectedSources.value.includes('resource') ? db.resources.toArray() : Promise.resolve([]),
        selectedSources.value.includes('resource') ? db.resourceContents.toArray() : Promise.resolve([]),
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
        ...createResourceSearchDocuments(resources, resourceContents),
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

  async function runSemanticSearch(): Promise<void> {
    const normalizedQuery = normalizeSemanticQuery(query.value)
    if (!semanticEnabled.value) throw new Error('语义搜索尚未启用')
    if (!selectedSources.value.includes('resource')) {
      throw new Error('请先启用“网页资料”搜索来源')
    }
    if (normalizedQuery.length < 2) throw new Error('语义查询至少需要 2 个字符')

    const generation = ++semanticGeneration
    semanticLoading.value = true
    semanticError.value = ''
    semanticMatchCount.value = 0
    try {
      const matches = await searchSemanticResources(normalizedQuery)
      if (
        generation !== semanticGeneration
        || normalizeSemanticQuery(query.value) !== normalizedQuery
      ) return

      const [resources, contents] = await Promise.all([
        db.resources.toArray(),
        db.resourceContents.toArray(),
      ])
      const documentsByResourceId = new Map(
        createResourceSearchDocuments(resources, contents)
          .map((document) => [document.targetId, document]),
      )
      const semanticResults = matches.flatMap((match): UnifiedSearchResult[] => {
        const document = documentsByResourceId.get(match.resource.id)
        if (!document) return []
        const percentage = Math.max(0, Math.min(100, Math.round(match.similarity * 100)))
        return [{
          ...document,
          subtitle: `语义相似度 ${percentage}% · ${document.subtitle}`,
          score: 70 + percentage,
          matchedFields: ['body'],
        }]
      })

      results.value = mergeSemanticSearchResults(results.value, semanticResults)
      semanticMatchCount.value = semanticResults.length
      selectedIndex.value = results.value.length > 0 ? 0 : -1
    } catch (cause) {
      if (generation === semanticGeneration) {
        semanticError.value = cause instanceof Error ? cause.message : '语义搜索失败'
      }
      throw cause
    } finally {
      if (generation === semanticGeneration) semanticLoading.value = false
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
    semanticEnabled,
    semanticLoading,
    semanticError,
    semanticMatchCount,
    loadSemanticSettings,
    enableSemanticSearch,
    disableSemanticSearch,
    search,
    runSemanticSearch,
    toggleSource,
    moveSelection,
    select,
    execute,
  }
})

function normalizeSemanticQuery(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

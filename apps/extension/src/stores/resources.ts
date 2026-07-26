import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { browserGateway } from '@/shared/browser'
import type { ResourceRecord, TabView } from '@/shared/domain'
import { isCapturablePageUrl } from '@/shared/pageCapture'
import {
  captureAndStoreResource,
  deleteResourceSnapshot,
  deleteResourceSummary,
  filterResourceLibraryItems,
  findOpenTabForResource,
  generateAndStoreResourceSummary,
  isResourceSummaryStale,
  listResourceLibraryItems,
  type ResourceLibraryItem,
} from '@/shared/resourceIndex'

export const useResourcesStore = defineStore('resources', () => {
  const items = ref<ResourceLibraryItem[]>([])
  const tabs = ref<TabView[]>([])
  const query = ref('')
  const selectedTabId = ref<number | null>(null)
  const loading = ref(false)
  const capturing = ref(false)
  const mutating = ref(false)
  const summarizingIds = ref<string[]>([])
  const error = ref('')
  const message = ref('')

  const capturableTabs = computed(() => tabs.value
    .filter((tab) => isCapturablePageUrl(tab.url))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title, 'zh-CN')))
  const selectedTab = computed(() => (
    capturableTabs.value.find((tab) => tab.id === selectedTabId.value) ?? null
  ))
  const filteredItems = computed(() => filterResourceLibraryItems(items.value, query.value))
  const totalCharacters = computed(() => items.value.reduce(
    (total, item) => total + item.content.characterCount,
    0,
  ))

  async function initialize(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      await Promise.all([refreshItems(), refreshTabs()])
    } catch (cause) {
      error.value = messageOf(cause)
    } finally {
      loading.value = false
    }
  }

  async function refreshItems(): Promise<void> {
    items.value = await listResourceLibraryItems()
  }

  async function refreshTabs(): Promise<void> {
    tabs.value = await browserGateway.listTabs()
    if (!selectedTab.value) selectedTabId.value = capturableTabs.value[0]?.id ?? null
  }

  async function captureSelected(): Promise<void> {
    const tab = selectedTab.value
    if (!tab) throw new Error('请选择一个可保存的网页标签页')
    await capture(tab)
  }

  async function refreshResource(resource: ResourceRecord): Promise<void> {
    const tab = findOpenTabForResource(resource, tabs.value)
    if (!tab) throw new Error('请先在浏览器中打开该网页，再重新采集正文')
    await capture(tab)
  }

  async function capture(tab: TabView): Promise<void> {
    capturing.value = true
    error.value = ''
    message.value = ''
    try {
      const item = await captureAndStoreResource(tab)
      await refreshItems()
      message.value = `已将“${item.resource.title}”保存到本地资源库。正文不会自动上传或发送给 AI。`
    } catch (cause) {
      error.value = messageOf(cause)
      throw cause
    } finally {
      capturing.value = false
    }
  }

  async function summarize(item: ResourceLibraryItem): Promise<void> {
    if (!summarizingIds.value.includes(item.resource.id)) {
      summarizingIds.value = [...summarizingIds.value, item.resource.id]
    }
    error.value = ''
    message.value = ''
    try {
      const summary = await generateAndStoreResourceSummary(item)
      await refreshItems()
      message.value = `已使用 ${summary.provider}${summary.model ? ` / ${summary.model}` : ''} 生成“${item.resource.title}”的摘要，并仅保存到本地。`
    } catch (cause) {
      error.value = messageOf(cause)
      await refreshItems()
      throw cause
    } finally {
      summarizingIds.value = summarizingIds.value.filter((id) => id !== item.resource.id)
    }
  }

  async function removeSummary(item: ResourceLibraryItem): Promise<void> {
    mutating.value = true
    error.value = ''
    message.value = ''
    try {
      await deleteResourceSummary(item.resource.id)
      await refreshItems()
      message.value = `已删除“${item.resource.title}”的本地 AI 摘要，网页正文仍保留。`
    } catch (cause) {
      error.value = messageOf(cause)
      throw cause
    } finally {
      mutating.value = false
    }
  }

  async function remove(resource: ResourceRecord): Promise<void> {
    mutating.value = true
    error.value = ''
    message.value = ''
    try {
      await deleteResourceSnapshot(resource.id)
      await refreshItems()
      message.value = `已删除“${resource.title}”的 ATab 本地快照。`
    } catch (cause) {
      error.value = messageOf(cause)
      throw cause
    } finally {
      mutating.value = false
    }
  }

  async function open(resource: ResourceRecord): Promise<void> {
    await browserGateway.openBookmark(resource.originalUrl)
  }

  function hasOpenTab(resource: ResourceRecord): boolean {
    return Boolean(findOpenTabForResource(resource, tabs.value))
  }

  function isSummarizing(resourceId: string): boolean {
    return summarizingIds.value.includes(resourceId)
  }

  return {
    items,
    tabs,
    query,
    selectedTabId,
    loading,
    capturing,
    mutating,
    summarizingIds,
    error,
    message,
    capturableTabs,
    selectedTab,
    filteredItems,
    totalCharacters,
    initialize,
    refreshItems,
    refreshTabs,
    captureSelected,
    refreshResource,
    summarize,
    removeSummary,
    remove,
    open,
    hasOpenTab,
    isSummarizing,
    isSummaryStale: isResourceSummaryStale,
  }
})

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : '资源操作失败'
}

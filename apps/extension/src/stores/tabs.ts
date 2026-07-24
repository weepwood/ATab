import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { browserGateway } from '@/shared/browser'
import type { AiActionPlan, TabView } from '@/shared/domain'
import { buildLocalPlan } from '@/shared/ai/localPlanner'
import { getDomain } from '@/shared/url'
import { db } from '@/shared/db'

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabView[]>([])
  const selectedIds = ref<number[]>([])
  const query = ref('')
  const loading = ref(false)
  const currentPlan = ref<AiActionPlan | null>(null)

  const filteredTabs = computed(() => {
    const keyword = query.value.trim().toLowerCase()
    if (!keyword) return tabs.value
    return tabs.value.filter((tab) =>
      `${tab.title} ${tab.url}`.toLowerCase().includes(keyword),
    )
  })

  const groupedTabs = computed(() => {
    const groups = new Map<string, TabView[]>()
    for (const tab of filteredTabs.value) {
      const domain = getDomain(tab.url)
      groups.set(domain, [...(groups.get(domain) ?? []), tab])
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
  })

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      tabs.value = await browserGateway.listTabs()
      selectedIds.value = selectedIds.value.filter((id) => tabs.value.some((tab) => tab.id === id))
    } finally {
      loading.value = false
    }
  }

  function toggleSelected(tabId: number): void {
    selectedIds.value = selectedIds.value.includes(tabId)
      ? selectedIds.value.filter((id) => id !== tabId)
      : [...selectedIds.value, tabId]
  }

  function selectAllVisible(): void {
    selectedIds.value = filteredTabs.value.map((tab) => tab.id)
  }

  function clearSelection(): void {
    selectedIds.value = []
  }

  async function closeSelected(): Promise<void> {
    await browserGateway.closeTabs(selectedIds.value)
    clearSelection()
    await refresh()
  }

  async function createPlan(command: string): Promise<void> {
    currentPlan.value = buildLocalPlan(command, tabs.value)
    await db.actionPlans.put(currentPlan.value)
  }

  async function executeCurrentPlan(): Promise<void> {
    if (!currentPlan.value) return
    for (const operation of currentPlan.value.operations) {
      await browserGateway.executeOperation(operation)
    }
    currentPlan.value = null
    await refresh()
  }

  return {
    tabs,
    selectedIds,
    query,
    loading,
    currentPlan,
    filteredTabs,
    groupedTabs,
    refresh,
    toggleSelected,
    selectAllVisible,
    clearSelection,
    closeSelected,
    createPlan,
    executeCurrentPlan,
  }
})

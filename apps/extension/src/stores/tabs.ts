import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { browserGateway } from '@/shared/browser'
import type { AiActionPlan, TabView } from '@/shared/domain'
import { createAiPlan } from '@/shared/ai/provider'
import { getDomain } from '@/shared/url'
import { db } from '@/shared/db'

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabView[]>([])
  const selectedIds = ref<number[]>([])
  const query = ref('')
  const loading = ref(false)
  const planning = ref(false)
  const executing = ref(false)
  const planError = ref('')
  const currentPlan = ref<AiActionPlan | null>(null)
  const planTargetUrls = ref<Record<number, string>>({})

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
    const normalizedCommand = command.trim()
    if (!normalizedCommand) {
      planError.value = '请输入需要 AI 处理的任务'
      return
    }

    planning.value = true
    planError.value = ''
    currentPlan.value = null
    planTargetUrls.value = {}
    try {
      const plan = await createAiPlan(normalizedCommand, tabs.value)
      const targetIds = new Set(plan.operations.flatMap((operation) => operation.tabIds))
      planTargetUrls.value = Object.fromEntries(
        tabs.value
          .filter((tab) => targetIds.has(tab.id))
          .map((tab) => [tab.id, tab.url]),
      )
      currentPlan.value = plan
      await db.actionPlans.put(plan)
    } catch (cause) {
      planError.value = cause instanceof Error ? cause.message : '生成 AI 计划失败'
    } finally {
      planning.value = false
    }
  }

  function cancelPlan(): void {
    currentPlan.value = null
    planTargetUrls.value = {}
    planError.value = ''
  }

  async function executeCurrentPlan(): Promise<void> {
    if (!currentPlan.value || executing.value) return
    executing.value = true
    planError.value = ''
    try {
      const currentTabs = await browserGateway.listTabs()
      const currentById = new Map(currentTabs.map((tab) => [tab.id, tab]))
      const staleIds = Object.entries(planTargetUrls.value)
        .filter(([id, expectedUrl]) => currentById.get(Number(id))?.url !== expectedUrl)
        .map(([id]) => Number(id))

      if (staleIds.length > 0) {
        throw new Error('部分目标标签已关闭或网址发生变化，请重新生成操作计划')
      }

      for (const operation of currentPlan.value.operations) {
        await browserGateway.executeOperation(operation)
      }
      cancelPlan()
      await refresh()
    } catch (cause) {
      planError.value = cause instanceof Error ? cause.message : '执行 AI 计划失败'
    } finally {
      executing.value = false
    }
  }

  return {
    tabs,
    selectedIds,
    query,
    loading,
    planning,
    executing,
    planError,
    currentPlan,
    filteredTabs,
    groupedTabs,
    refresh,
    toggleSelected,
    selectAllVisible,
    clearSelection,
    closeSelected,
    createPlan,
    cancelPlan,
    executeCurrentPlan,
  }
})

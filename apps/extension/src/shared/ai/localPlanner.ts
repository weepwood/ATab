import type { AiActionPlan, TabView } from '../domain'
import { getDomain, normalizeUrl } from '../url'

function createPlan(partial: Omit<AiActionPlan, 'id' | 'createdAt'>): AiActionPlan {
  return {
    ...partial,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
}

export function buildLocalPlan(command: string, tabs: TabView[]): AiActionPlan {
  const normalized = command.trim().toLowerCase()

  if (normalized.includes('重复')) {
    const byUrl = new Map<string, TabView[]>()
    for (const tab of tabs) {
      const key = normalizeUrl(tab.url)
      byUrl.set(key, [...(byUrl.get(key) ?? []), tab])
    }
    const duplicateIds = [...byUrl.values()].flatMap((items) => {
      if (items.length < 2) return []
      const keep = items.find((item) => item.active) ?? items[0]
      return items.filter((item) => item.id !== keep.id).map((item) => item.id)
    })

    return createPlan({
      summary: `发现 ${duplicateIds.length} 个可关闭的重复标签页`,
      reason:
        duplicateIds.length > 0
          ? '当前初始原型只提供重复检测结果。关闭操作将在目标 URL、窗口、计划有效期和恢复记录均可校验后启用。'
          : '按清理追踪参数后的规范化 URL 检查，当前没有发现重复标签页。',
      risk: 'read-only',
      requiresConfirmation: false,
      operations: [],
    })
  }

  if (normalized.includes('github') || normalized.includes('开发')) {
    const tabIds = tabs.filter((tab) => getDomain(tab.url).endsWith('github.com')).map((tab) => tab.id)
    return createPlan({
      summary: `把 ${tabIds.length} 个 GitHub 标签页放入“开发”分组`,
      reason: '当前原型使用域名规则生成安全、可预览的操作计划。',
      risk: 'reversible',
      requiresConfirmation: true,
      operations: tabIds.length > 0 ? [{ type: 'CREATE_GROUP', tabIds, name: '开发', color: 'blue' }] : [],
    })
  }

  if (normalized.includes('静音') || normalized.includes('mute')) {
    const tabIds = tabs.filter((tab) => tab.audible && !tab.muted).map((tab) => tab.id)
    return createPlan({
      summary: `静音 ${tabIds.length} 个正在播放声音的标签页`,
      reason: '仅选择当前正在播放声音且尚未静音的标签页。',
      risk: 'reversible',
      requiresConfirmation: true,
      operations: tabIds.length > 0 ? [{ type: 'MUTE_TABS', tabIds }] : [],
    })
  }

  return createPlan({
    summary: '当前本地计划器无法安全识别该指令',
    reason: '云端模型尚未接入。当前只支持“重复标签检测”“GitHub/开发分组”和“静音标签”三类演示指令。',
    risk: 'read-only',
    requiresConfirmation: false,
    operations: [],
  })
}

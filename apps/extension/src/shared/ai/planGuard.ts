import type { AiActionPlan, TabView } from '../domain'

export interface PlanTargetSnapshot {
  url: string
  windowId: number
}

export const PLAN_MAX_AGE_MS = 5 * 60 * 1_000

export function assertPlanFresh(plan: AiActionPlan, now = Date.now()): void {
  const createdAt = new Date(plan.createdAt).getTime()
  if (!Number.isFinite(createdAt)
    || now - createdAt > PLAN_MAX_AGE_MS
    || createdAt > now + 60_000) {
    throw new Error('操作计划已过期，请重新生成')
  }
}

export function findStalePlanTargetIds(
  targets: Record<number, PlanTargetSnapshot>,
  currentTabs: TabView[],
): number[] {
  const currentById = new Map(currentTabs.map((tab) => [tab.id, tab]))
  return Object.entries(targets)
    .filter(([id, expected]) => {
      const current = currentById.get(Number(id))
      return !current || current.url !== expected.url || current.windowId !== expected.windowId
    })
    .map(([id]) => Number(id))
}

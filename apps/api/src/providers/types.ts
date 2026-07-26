import type { AgentPlanRequest } from '@atab/contracts'

export interface AgentProvider {
  readonly name: string
  generatePlan(request: AgentPlanRequest): Promise<unknown>
}

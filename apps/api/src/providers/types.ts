import type { AgentPlanDraft, AgentPlanRequest } from '@atab/contracts'

export interface AgentProvider {
  readonly name: string
  generatePlan(request: AgentPlanRequest): Promise<AgentPlanDraft>
}

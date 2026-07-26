import type {
  AgentPlanRequest,
  ResourceSummaryRequest,
} from '@atab/contracts'

export interface AgentProvider {
  readonly name: string
  readonly model?: string
  generatePlan(request: AgentPlanRequest): Promise<unknown>
  summarizeResource(request: ResourceSummaryRequest): Promise<unknown>
}

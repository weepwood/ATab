import type {
  AgentPlanRequest,
  ResourceSummaryRequest,
} from '@atab/contracts'
import type { EmbeddingRequest } from '@atab/contracts/embedding'

export interface AgentProvider {
  readonly name: string
  readonly model?: string
  readonly embeddingModel?: string
  generatePlan(request: AgentPlanRequest): Promise<unknown>
  summarizeResource(request: ResourceSummaryRequest): Promise<unknown>
  embedTexts(request: EmbeddingRequest): Promise<unknown>
}

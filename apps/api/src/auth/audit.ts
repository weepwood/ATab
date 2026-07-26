export type AiAuditRoute = 'agent-plan' | 'resource-summary' | 'embeddings'
export type AiAuditStatus = 'success' | 'error' | 'unauthorized' | 'rate-limited'

export interface AiAuditEvent {
  requestId: string
  userId: string
  route: AiAuditRoute
  provider: string
  model?: string
  inputCount: number
  characterCount: number
  status: AiAuditStatus
  durationMs: number
  errorCode?: string
  createdAt: string
}

export interface AiAuditSink {
  write(event: AiAuditEvent): void | Promise<void>
}

export class MemoryAiAuditSink implements AiAuditSink {
  readonly events: AiAuditEvent[] = []

  write(event: AiAuditEvent): void {
    this.events.push(structuredClone(event))
  }
}

export function createAiAuditEvent(input: {
  requestId: string
  userId: string
  route: AiAuditRoute
  provider: string
  model?: string
  inputCount: number
  characterCount: number
  status: AiAuditStatus
  startedAt: number
  errorCode?: string
  now?: number
}): AiAuditEvent {
  const now = input.now ?? Date.now()
  return {
    requestId: input.requestId,
    userId: input.userId,
    route: input.route,
    provider: input.provider,
    model: input.model,
    inputCount: clampNonNegativeInteger(input.inputCount),
    characterCount: clampNonNegativeInteger(input.characterCount),
    status: input.status,
    durationMs: Math.max(0, Math.round(now - input.startedAt)),
    errorCode: input.errorCode,
    createdAt: new Date(now).toISOString(),
  }
}

function clampNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

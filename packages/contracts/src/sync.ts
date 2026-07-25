export const SYNC_ENTITY_TYPES = [
  'session',
  'cloud-bookmark',
  'setting',
] as const

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number]
export type SyncOperation = 'upsert' | 'delete'
export type SyncApplyStatus = 'applied' | 'conflict' | 'duplicate'

export interface SyncPushChange {
  changeId: string
  entityType: SyncEntityType
  entityId: string
  baseVersion: number
  operation: SyncOperation
  payload: Record<string, unknown> | null
  clientUpdatedAt: string
}

export interface SyncPushRequest {
  deviceId: string
  changes: SyncPushChange[]
}

export interface SyncEntitySnapshot {
  entityType: SyncEntityType
  entityId: string
  version: number
  payload: Record<string, unknown> | null
  deleted: boolean
  updatedAt: string
  updatedByDevice: string
}

export interface SyncApplyResult {
  changeId: string
  status: SyncApplyStatus
  version: number
  sequence: number | null
  serverEntity: SyncEntitySnapshot | null
}

export interface SyncPushResponse {
  results: SyncApplyResult[]
}

export interface SyncPullRequest {
  afterSequence: number
  limit: number
}

export interface SyncRemoteChange extends SyncEntitySnapshot {
  sequence: number
  operation: SyncOperation
}

export interface SyncPullResponse {
  changes: SyncRemoteChange[]
  nextSequence: number
  hasMore: boolean
}

const MAX_CHANGES_PER_PUSH = 100
const MAX_PAYLOAD_BYTES = 262_144
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function validateSyncPushRequest(value: unknown): SyncPushRequest {
  const input = asObject(value, '同步请求')
  const deviceId = readUuid(input.deviceId, 'deviceId')
  if (!Array.isArray(input.changes)) throw new Error('changes 必须是数组')
  if (input.changes.length > MAX_CHANGES_PER_PUSH) {
    throw new Error(`每次最多推送 ${MAX_CHANGES_PER_PUSH} 个变更`)
  }

  const changeIds = new Set<string>()
  const changes = input.changes.map((change, index) => {
    const item = asObject(change, `changes[${index}]`)
    const changeId = readUuid(item.changeId, `changes[${index}].changeId`)
    if (changeIds.has(changeId)) throw new Error(`请求中存在重复 changeId：${changeId}`)
    changeIds.add(changeId)

    const entityType = readEntityType(item.entityType, `changes[${index}].entityType`)
    const entityId = readIdentifier(item.entityId, `changes[${index}].entityId`)
    const baseVersion = readNonNegativeInteger(item.baseVersion, `changes[${index}].baseVersion`)
    const operation = readOperation(item.operation, `changes[${index}].operation`)
    const clientUpdatedAt = readIsoDate(item.clientUpdatedAt, `changes[${index}].clientUpdatedAt`)
    const payload = readPayload(item.payload, operation, `changes[${index}].payload`)

    return {
      changeId,
      entityType,
      entityId,
      baseVersion,
      operation,
      payload,
      clientUpdatedAt,
    }
  })

  return { deviceId, changes }
}

export function validateSyncPullRequest(value: unknown): SyncPullRequest {
  const input = asObject(value, '拉取请求')
  const afterSequence = readNonNegativeInteger(input.afterSequence ?? 0, 'afterSequence')
  const requestedLimit = input.limit === undefined
    ? 200
    : readNonNegativeInteger(input.limit, 'limit')
  if (requestedLimit < 1) throw new Error('limit 必须大于 0')
  return {
    afterSequence,
    limit: Math.min(requestedLimit, 500),
  }
}

export function validateSyncPushResponse(value: unknown): SyncPushResponse {
  const input = asObject(value, '推送响应')
  if (!Array.isArray(input.results)) throw new Error('results 必须是数组')
  return {
    results: input.results.map((result, index) => {
      const item = asObject(result, `results[${index}]`)
      const status = readApplyStatus(item.status, `results[${index}].status`)
      return {
        changeId: readUuid(item.changeId, `results[${index}].changeId`),
        status,
        version: readNonNegativeInteger(item.version, `results[${index}].version`),
        sequence: item.sequence === null
          ? null
          : readNonNegativeInteger(item.sequence, `results[${index}].sequence`),
        serverEntity: item.serverEntity === null
          ? null
          : readEntitySnapshot(item.serverEntity, `results[${index}].serverEntity`),
      }
    }),
  }
}

export function validateSyncPullResponse(value: unknown): SyncPullResponse {
  const input = asObject(value, '拉取响应')
  if (!Array.isArray(input.changes)) throw new Error('changes 必须是数组')
  return {
    changes: input.changes.map((change, index) => {
      const item = asObject(change, `changes[${index}]`)
      const snapshot = readEntitySnapshot(item, `changes[${index}]`)
      return {
        ...snapshot,
        sequence: readNonNegativeInteger(item.sequence, `changes[${index}].sequence`),
        operation: readOperation(item.operation, `changes[${index}].operation`),
      }
    }),
    nextSequence: readNonNegativeInteger(input.nextSequence, 'nextSequence'),
    hasMore: readBoolean(input.hasMore, 'hasMore'),
  }
}

function readEntitySnapshot(value: unknown, label: string): SyncEntitySnapshot {
  const input = asObject(value, label)
  return {
    entityType: readEntityType(input.entityType, `${label}.entityType`),
    entityId: readIdentifier(input.entityId, `${label}.entityId`),
    version: readNonNegativeInteger(input.version, `${label}.version`),
    payload: input.payload === null ? null : readObjectPayload(input.payload, `${label}.payload`),
    deleted: readBoolean(input.deleted, `${label}.deleted`),
    updatedAt: readIsoDate(input.updatedAt, `${label}.updatedAt`),
    updatedByDevice: readUuid(input.updatedByDevice, `${label}.updatedByDevice`),
  }
}

function readPayload(
  value: unknown,
  operation: SyncOperation,
  label: string,
): Record<string, unknown> | null {
  if (operation === 'delete') {
    if (value !== null) throw new Error(`${label} 在 delete 操作中必须为 null`)
    return null
  }
  return readObjectPayload(value, label)
}

function readObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const payload = asObject(value, label)
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength
  if (bytes > MAX_PAYLOAD_BYTES) throw new Error(`${label} 超过 256KB 限制`)
  return payload
}

function readEntityType(value: unknown, label: string): SyncEntityType {
  if (typeof value === 'string' && SYNC_ENTITY_TYPES.includes(value as SyncEntityType)) {
    return value as SyncEntityType
  }
  throw new Error(`${label} 不是允许的实体类型`)
}

function readOperation(value: unknown, label: string): SyncOperation {
  if (value === 'upsert' || value === 'delete') return value
  throw new Error(`${label} 必须是 upsert 或 delete`)
}

function readApplyStatus(value: unknown, label: string): SyncApplyStatus {
  if (value === 'applied' || value === 'conflict' || value === 'duplicate') return value
  throw new Error(`${label} 不是有效状态`)
}

function readIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) {
    throw new Error(`${label} 必须是 1 到 160 个字符`)
  }
  return value.trim()
}

function readUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} 必须是 UUID`)
  }
  return value.toLowerCase()
}

function readIsoDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} 必须是 ISO 日期字符串`)
  }
  return new Date(value).toISOString()
}

function readNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} 必须是非负安全整数`)
  }
  return value
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} 必须是布尔值`)
  return value
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`)
  }
  return value as Record<string, unknown>
}

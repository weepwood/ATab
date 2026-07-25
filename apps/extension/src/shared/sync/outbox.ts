import type {
  SyncApplyResult,
  SyncEntityType,
  SyncPushChange,
  SyncPushResponse,
} from '@atab/contracts/sync'
import { db, type SyncOutboxRecord } from '../db'

const CURSOR_KEY = 'remote-sequence'

export async function queueSyncUpsert(
  entityType: SyncEntityType,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await queueChange(entityType, entityId, 'upsert', payload)
}

export async function queueSyncDelete(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  await queueChange(entityType, entityId, 'delete', null)
}

export async function getPendingSyncChanges(limit = 100): Promise<SyncPushChange[]> {
  const records = await db.syncOutbox
    .where('status')
    .equals('pending')
    .sortBy('updatedAt')
  return records.slice(0, Math.max(1, Math.min(limit, 100))).map(toPushChange)
}

export async function applySyncPushResponse(response: SyncPushResponse): Promise<void> {
  await db.transaction('rw', db.syncOutbox, db.syncVersions, async () => {
    for (const result of response.results) {
      const record = await db.syncOutbox.get(result.changeId)
      if (!record) continue

      if (result.status === 'conflict') {
        await db.syncOutbox.update(record.id, {
          status: 'conflict',
          serverEntity: result.serverEntity,
          lastError: '服务端已有更新，需要解决冲突',
          updatedAt: new Date().toISOString(),
        })
        if (result.serverEntity) await saveVersion(result.serverEntity.entityType, result.serverEntity.entityId, result.serverEntity.version)
        continue
      }

      await db.syncOutbox.delete(record.id)
      await saveVersion(record.entityType, record.entityId, result.version)
    }
  })
}

export async function recordSyncPushFailure(
  changeIds: string[],
  message: string,
): Promise<void> {
  const updatedAt = new Date().toISOString()
  await db.transaction('rw', db.syncOutbox, async () => {
    for (const changeId of changeIds) {
      const record = await db.syncOutbox.get(changeId)
      if (!record) continue
      await db.syncOutbox.update(changeId, {
        attempts: record.attempts + 1,
        lastError: message,
        updatedAt,
      })
    }
  })
}

export async function listSyncConflicts(): Promise<SyncOutboxRecord[]> {
  return db.syncOutbox.where('status').equals('conflict').sortBy('updatedAt')
}

export async function retryConflictWithLocal(record: SyncOutboxRecord): Promise<void> {
  if (record.status !== 'conflict' || !record.serverEntity) {
    throw new Error('该记录没有可重试的服务端冲突版本')
  }

  const nextId = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.transaction('rw', db.syncOutbox, db.syncVersions, async () => {
    await db.syncOutbox.delete(record.id)
    await db.syncOutbox.put({
      ...record,
      id: nextId,
      changeId: nextId,
      baseVersion: record.serverEntity?.version ?? record.baseVersion,
      status: 'pending',
      attempts: 0,
      lastError: undefined,
      serverEntity: undefined,
      clientUpdatedAt: now,
      updatedAt: now,
    })
    await saveVersion(record.entityType, record.entityId, record.serverEntity!.version)
  })
}

export async function discardLocalConflict(record: SyncOutboxRecord): Promise<void> {
  await db.transaction('rw', db.syncOutbox, db.syncVersions, async () => {
    await db.syncOutbox.delete(record.id)
    if (record.serverEntity) {
      await saveVersion(record.entityType, record.entityId, record.serverEntity.version)
    }
  })
}

export async function getSyncCursor(): Promise<number> {
  const value = await db.syncMetadata.get(CURSOR_KEY)
  return typeof value?.value === 'number' && Number.isSafeInteger(value.value) && value.value >= 0
    ? value.value
    : 0
}

export async function setSyncCursor(sequence: number): Promise<void> {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('同步游标无效')
  await db.syncMetadata.put({
    key: CURSOR_KEY,
    value: sequence,
    updatedAt: new Date().toISOString(),
  })
}

export function syncEntityKey(entityType: SyncEntityType, entityId: string): string {
  return `${entityType}:${entityId}`
}

async function queueChange(
  entityType: SyncEntityType,
  entityId: string,
  operation: SyncPushChange['operation'],
  payload: Record<string, unknown> | null,
): Promise<void> {
  const key = syncEntityKey(entityType, entityId)
  const now = new Date().toISOString()

  await db.transaction('rw', db.syncOutbox, db.syncVersions, async () => {
    const existing = await db.syncOutbox.where('entityKey').equals(key).first()
    const version = await db.syncVersions.get(key)

    if (existing) {
      await db.syncOutbox.update(existing.id, {
        operation,
        payload,
        baseVersion: version?.version ?? existing.baseVersion,
        status: 'pending',
        attempts: 0,
        lastError: undefined,
        serverEntity: undefined,
        clientUpdatedAt: now,
        updatedAt: now,
      })
      return
    }

    const changeId = crypto.randomUUID()
    await db.syncOutbox.put({
      id: changeId,
      changeId,
      entityKey: key,
      entityType,
      entityId,
      baseVersion: version?.version ?? 0,
      operation,
      payload,
      clientUpdatedAt: now,
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    })
  })
}

async function saveVersion(
  entityType: SyncEntityType,
  entityId: string,
  version: number,
): Promise<void> {
  await db.syncVersions.put({
    key: syncEntityKey(entityType, entityId),
    entityType,
    entityId,
    version,
    updatedAt: new Date().toISOString(),
  })
}

function toPushChange(record: SyncOutboxRecord): SyncPushChange {
  return {
    changeId: record.changeId,
    entityType: record.entityType,
    entityId: record.entityId,
    baseVersion: record.baseVersion,
    operation: record.operation,
    payload: record.payload,
    clientUpdatedAt: record.clientUpdatedAt,
  }
}

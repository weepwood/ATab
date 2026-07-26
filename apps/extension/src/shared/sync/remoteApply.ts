import type { SyncRemoteChange } from '@atab/contracts/sync'
import { db } from '../db'
import type { SessionRecord } from '../domain'
import { parseCloudBookmarkPayload } from '../cloudBookmarks'
import { parseSessionImport } from '../sessions'
import { syncEntityKey } from './outbox'

export async function applyRemoteChanges(
  changes: SyncRemoteChange[],
  localDeviceId: string,
): Promise<{ applied: number; conflicts: number }> {
  let applied = 0
  let conflicts = 0

  await db.transaction(
    'rw',
    db.sessions,
    db.cloudBookmarks,
    db.settings,
    db.syncOutbox,
    db.syncVersions,
    async () => {
      for (const change of changes) {
        const key = syncEntityKey(change.entityType, change.entityId)
        const pending = await db.syncOutbox.where('entityKey').equals(key).first()

        if (pending && change.updatedByDevice !== localDeviceId) {
          await db.syncOutbox.update(pending.id, {
            status: 'conflict',
            serverEntity: {
              entityType: change.entityType,
              entityId: change.entityId,
              version: change.version,
              payload: change.payload,
              deleted: change.deleted,
              updatedAt: change.updatedAt,
              updatedByDevice: change.updatedByDevice,
            },
            lastError: '另一台设备已修改同一实体',
            updatedAt: new Date().toISOString(),
          })
          conflicts += 1
        } else {
          await applyRemoteEntity(change)
          applied += 1
        }

        await db.syncVersions.put({
          key,
          entityType: change.entityType,
          entityId: change.entityId,
          version: change.version,
          updatedAt: change.updatedAt,
        })
      }
    },
  )

  return { applied, conflicts }
}

async function applyRemoteEntity(change: SyncRemoteChange): Promise<void> {
  if (change.entityType === 'session') {
    if (change.deleted) {
      await db.sessions.delete(change.entityId)
    } else if (change.payload) {
      await db.sessions.put(parseRemoteSession(change.entityId, change.payload))
    }
    return
  }

  if (change.entityType === 'cloud-bookmark') {
    if (change.deleted) {
      await db.cloudBookmarks.delete(change.entityId)
    } else if (change.payload) {
      await db.cloudBookmarks.put(parseCloudBookmarkPayload(change.entityId, change.payload))
    }
    return
  }

  if (change.entityType === 'setting' && change.payload) {
    const settingKey = typeof change.payload.key === 'string'
      ? change.payload.key
      : change.entityId
    await db.settings.put({
      key: settingKey,
      value: change.payload.value,
      updatedAt: change.updatedAt,
    })
  }
}

function parseRemoteSession(
  entityId: string,
  payload: Record<string, unknown>,
): SessionRecord {
  const parsed = parseSessionImport(payload)
  return {
    ...parsed,
    id: entityId,
    name: typeof payload.name === 'string' ? payload.name : parsed.name,
    createdAt: readDate(payload.createdAt, parsed.createdAt),
    updatedAt: readDate(payload.updatedAt, parsed.updatedAt),
    kind: 'manual',
  }
}

function readDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback
}

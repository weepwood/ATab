import { db, type SyncOutboxRecord } from '../db'
import type { SessionRecord } from '../domain'
import { parseCloudBookmarkPayload } from '../cloudBookmarks'
import { parseSessionImport } from '../sessions'
import { retryConflictWithLocal, syncEntityKey } from './outbox'

export async function keepLocalConflict(record: SyncOutboxRecord): Promise<void> {
  await retryConflictWithLocal(record)
}

export async function acceptServerConflict(record: SyncOutboxRecord): Promise<void> {
  const server = record.serverEntity
  if (!server) throw new Error('冲突记录缺少服务端版本')

  await db.transaction(
    'rw',
    db.sessions,
    db.cloudBookmarks,
    db.settings,
    db.syncOutbox,
    db.syncVersions,
    async () => {
      if (server.entityType === 'session') {
        if (server.deleted) {
          await db.sessions.delete(server.entityId)
        } else if (server.payload) {
          await db.sessions.put(parseServerSession(server.entityId, server.payload))
        }
      } else if (server.entityType === 'cloud-bookmark') {
        if (server.deleted) {
          await db.cloudBookmarks.delete(server.entityId)
        } else if (server.payload) {
          await db.cloudBookmarks.put(parseCloudBookmarkPayload(server.entityId, server.payload))
        }
      } else if (server.entityType === 'setting' && server.payload) {
        const key = typeof server.payload.key === 'string'
          ? server.payload.key
          : server.entityId
        await db.settings.put({
          key,
          value: server.payload.value,
          updatedAt: server.updatedAt,
        })
      }

      await db.syncOutbox.delete(record.id)
      await db.syncVersions.put({
        key: syncEntityKey(server.entityType, server.entityId),
        entityType: server.entityType,
        entityId: server.entityId,
        version: server.version,
        updatedAt: server.updatedAt,
      })
    },
  )
}

function parseServerSession(
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

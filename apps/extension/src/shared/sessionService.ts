import { browserGateway } from './browser'
import { db } from './db'
import type { SessionRecord } from './domain'
import { createSessionRecord } from './sessions'
import { queueSyncDelete, queueSyncUpsert } from './sync/outbox'

const AUTO_SNAPSHOT_LIMIT = 10

export async function captureAndSaveSession(
  scope: 'current' | 'all',
  name: string,
  kind: SessionRecord['kind'] = 'manual',
): Promise<SessionRecord> {
  const windows = await browserGateway.captureSession(scope)
  const session = createSessionRecord(name, kind, windows)
  if (session.tabCount === 0) throw new Error('当前没有可保存的网页标签')

  if (kind === 'manual') {
    await saveManualSession(session)
  } else {
    await db.sessions.put(session)
    await pruneAutoSnapshots()
  }
  return session
}

export async function saveImportedSession(session: SessionRecord): Promise<void> {
  await saveManualSession({ ...session, kind: 'manual' })
}

export async function updateSessionRecord(session: SessionRecord): Promise<void> {
  if (session.kind === 'manual') {
    await saveManualSession(session)
    return
  }
  await db.sessions.put(session)
}

export async function deleteSessionRecord(session: SessionRecord): Promise<void> {
  if (session.kind === 'manual') {
    await db.transaction('rw', db.sessions, db.syncOutbox, db.syncVersions, async () => {
      await db.sessions.delete(session.id)
      await queueSyncDelete('session', session.id)
    })
    return
  }
  await db.sessions.delete(session.id)
}

export async function pruneAutoSnapshots(): Promise<void> {
  const autoSessions = await db.sessions.where('kind').equals('auto').sortBy('updatedAt')
  const expired = autoSessions.slice(0, Math.max(0, autoSessions.length - AUTO_SNAPSHOT_LIMIT))
  if (expired.length > 0) await db.sessions.bulkDelete(expired.map((session) => session.id))
}

export async function createAutoSnapshot(): Promise<void> {
  try {
    await captureAndSaveSession('all', '', 'auto')
  } catch {
    // 浏览器可能只有内部页面，或正处于关闭过程；自动快照静默跳过。
  }
}

async function saveManualSession(session: SessionRecord): Promise<void> {
  await db.transaction('rw', db.sessions, db.syncOutbox, db.syncVersions, async () => {
    await db.sessions.put(session)
    await queueSyncUpsert('session', session.id, toPayload(session))
  })
}

function toPayload(session: SessionRecord): Record<string, unknown> {
  return JSON.parse(JSON.stringify(session)) as Record<string, unknown>
}

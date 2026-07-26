import { browserGateway } from './browser'
import { db } from './db'
import type { SessionRecord } from './domain'
import { createSessionRecord } from './sessions'

const AUTO_SNAPSHOT_LIMIT = 10

export async function captureAndSaveSession(
  scope: 'current' | 'all',
  name: string,
  kind: SessionRecord['kind'] = 'manual',
): Promise<SessionRecord> {
  const windows = await browserGateway.captureSession(scope)
  const session = createSessionRecord(name, kind, windows)
  if (session.tabCount === 0) throw new Error('当前没有可保存的网页标签')
  await db.sessions.put(session)
  if (kind === 'auto') await pruneAutoSnapshots()
  return session
}

export async function saveImportedSession(session: SessionRecord): Promise<void> {
  await db.sessions.put(session)
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
    // 浏览器关闭、只有内部页面或会话超过安全上限时静默跳过自动任务。
  }
}

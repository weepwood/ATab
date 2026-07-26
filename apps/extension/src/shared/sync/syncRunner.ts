import {
  validateSyncPullResponse,
  validateSyncPushResponse,
} from '@atab/contracts/sync'
import { db } from '../db'
import { getValidSyncAccessToken } from './auth'
import {
  applySyncPushResponse,
  getPendingSyncChanges,
  getSyncCursor,
  recordSyncPushFailure,
  setSyncCursor,
} from './outbox'
import { applyRemoteChanges } from './remoteApply'
import { getSyncSettings, normalizeHttpEndpoint } from './settings'

export interface SyncRunResult {
  pushed: number
  pushConflicts: number
  pulled: number
  applied: number
  pullConflicts: number
  nextSequence: number
}

export interface SyncQueueSummary {
  pending: number
  conflicts: number
  lastSyncAt?: string
  lastError?: string
}

const MAX_PULL_PAGES = 10

export async function runSyncOnce(): Promise<SyncRunResult> {
  const settings = await getSyncSettings()
  if (!settings.enabled) throw new Error('云同步尚未启用')
  const accessToken = await getValidSyncAccessToken(settings)
  const authorization = `Bearer ${accessToken}`
  const endpoint = normalizeHttpEndpoint(settings.apiEndpoint, '同步 API 地址')

  await requestJson(`${endpoint}/v1/sync/devices/register`, authorization, {
    deviceId: settings.deviceId,
    name: settings.deviceName,
    platform: settings.platform,
  })

  const result: SyncRunResult = {
    pushed: 0,
    pushConflicts: 0,
    pulled: 0,
    applied: 0,
    pullConflicts: 0,
    nextSequence: await getSyncCursor(),
  }

  const pending = await getPendingSyncChanges(100)
  if (pending.length > 0) {
    try {
      const pushResponse = validateSyncPushResponse(await requestJson(
        `${endpoint}/v1/sync/push`,
        authorization,
        { deviceId: settings.deviceId, changes: pending },
      ))
      await applySyncPushResponse(pushResponse)
      result.pushed = pushResponse.results.filter((item) => item.status !== 'conflict').length
      result.pushConflicts = pushResponse.results.filter((item) => item.status === 'conflict').length
    } catch (cause) {
      await recordSyncPushFailure(
        pending.map((change) => change.changeId),
        errorMessage(cause),
      )
      await saveSyncStatus(undefined, errorMessage(cause))
      throw cause
    }
  }

  for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
    const pullResponse = validateSyncPullResponse(await requestJson(
      `${endpoint}/v1/sync/pull`,
      authorization,
      {
        deviceId: settings.deviceId,
        afterSequence: result.nextSequence,
        limit: 200,
      },
    ))

    result.pulled += pullResponse.changes.length
    const applied = await applyRemoteChanges(pullResponse.changes, settings.deviceId)
    result.applied += applied.applied
    result.pullConflicts += applied.conflicts
    result.nextSequence = pullResponse.nextSequence
    await setSyncCursor(result.nextSequence)
    if (!pullResponse.hasMore) break
  }

  await saveSyncStatus(new Date().toISOString())
  return result
}

export async function getSyncQueueSummary(): Promise<SyncQueueSummary> {
  const [pending, conflicts, metadata] = await Promise.all([
    db.syncOutbox.where('status').equals('pending').count(),
    db.syncOutbox.where('status').equals('conflict').count(),
    db.syncMetadata.get('last-run'),
  ])
  const value = isRecord(metadata?.value) ? metadata.value : {}
  return {
    pending,
    conflicts,
    lastSyncAt: typeof value.lastSyncAt === 'string' ? value.lastSyncAt : undefined,
    lastError: typeof value.lastError === 'string' ? value.lastError : undefined,
  }
}

async function requestJson(
  url: string,
  authorization: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const value = await readJson(response)
    if (!response.ok) throw new Error(readApiError(value, response.status))
    return value
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error('同步请求超过 30000ms')
    }
    throw cause
  } finally {
    globalThis.clearTimeout(timer)
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`同步 API 返回了无法解析的响应（HTTP ${response.status}）`)
  }
}

function readApiError(value: unknown, status: number): string {
  if (isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string') {
    return value.error.message
  }
  return `同步 API 返回 HTTP ${status}`
}

async function saveSyncStatus(lastSyncAt?: string, lastError?: string): Promise<void> {
  await db.syncMetadata.put({
    key: 'last-run',
    value: { lastSyncAt, lastError },
    updatedAt: new Date().toISOString(),
  })
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '同步失败'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

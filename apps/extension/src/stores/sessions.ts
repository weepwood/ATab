import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { browserGateway } from '@/shared/browser'
import { db } from '@/shared/db'
import type { SessionRecord, SessionRestoreResult } from '@/shared/domain'
import { captureAndSaveSession, saveImportedSession } from '@/shared/sessionService'
import {
  assertSessionImportTextSize,
  parseSessionImport,
  SESSION_IMPORT_MAX_BYTES,
} from '@/shared/sessions'

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<SessionRecord[]>([])
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref('')
  const lastRestore = ref<SessionRestoreResult | null>(null)

  const manualSessions = computed(() => sessions.value.filter((session) => session.kind === 'manual'))
  const autoSessions = computed(() => sessions.value.filter((session) => session.kind === 'auto'))

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      sessions.value = await db.sessions.orderBy('updatedAt').reverse().toArray()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '读取会话失败'
    } finally {
      loading.value = false
    }
  }

  async function runMutation(action: () => Promise<void>): Promise<void> {
    if (mutating.value) throw new Error('已有会话操作正在执行')
    mutating.value = true
    error.value = ''
    try {
      await action()
      await refresh()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '会话操作失败'
      throw cause
    } finally {
      mutating.value = false
    }
  }

  async function save(scope: 'current' | 'all', name: string): Promise<void> {
    await runMutation(async () => {
      await captureAndSaveSession(scope, name)
    })
  }

  async function restore(session: SessionRecord): Promise<SessionRestoreResult> {
    if (mutating.value) throw new Error('已有会话操作正在执行')
    mutating.value = true
    error.value = ''
    lastRestore.value = null
    try {
      lastRestore.value = await browserGateway.restoreSession(session)
      return lastRestore.value
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '恢复会话失败'
      throw cause
    } finally {
      mutating.value = false
    }
  }

  async function rename(session: SessionRecord, name: string): Promise<void> {
    const normalizedName = name.trim().slice(0, 200)
    if (!normalizedName) throw new Error('会话名称不能为空')
    await runMutation(async () => {
      await db.sessions.put({
        ...session,
        name: normalizedName,
        updatedAt: new Date().toISOString(),
      })
    })
  }

  async function remove(session: SessionRecord): Promise<void> {
    await runMutation(() => db.sessions.delete(session.id))
  }

  async function importFromJson(text: string): Promise<void> {
    assertSessionImportTextSize(text)
    await runMutation(async () => {
      let value: unknown
      try {
        value = JSON.parse(text) as unknown
      } catch {
        throw new Error('会话文件不是有效的 JSON')
      }
      const parsed = parseSessionImport(value)
      await saveImportedSession(parsed)
    })
  }

  async function importFile(file: File): Promise<void> {
    if (file.size > SESSION_IMPORT_MAX_BYTES) {
      error.value = '会话文件不能超过 2 MB'
      throw new Error(error.value)
    }
    await importFromJson(await file.text())
  }

  return {
    sessions,
    loading,
    mutating,
    error,
    lastRestore,
    manualSessions,
    autoSessions,
    refresh,
    save,
    restore,
    rename,
    remove,
    importFromJson,
    importFile,
  }
})

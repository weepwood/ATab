import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { browserGateway } from '@/shared/browser'
import { db } from '@/shared/db'
import type { SessionRecord, SessionRestoreResult } from '@/shared/domain'
import {
  captureAndSaveSession,
  deleteSessionRecord,
  saveImportedSession,
  updateSessionRecord,
} from '@/shared/sessionService'
import { parseSessionImport } from '@/shared/sessions'

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
    mutating.value = true
    error.value = ''
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
    const normalizedName = name.trim()
    if (!normalizedName) throw new Error('会话名称不能为空')
    await runMutation(async () => {
      await updateSessionRecord({
        ...session,
        name: normalizedName,
        updatedAt: new Date().toISOString(),
      })
    })
  }

  async function remove(session: SessionRecord): Promise<void> {
    await runMutation(() => deleteSessionRecord(session))
  }

  async function importFromJson(text: string): Promise<void> {
    await runMutation(async () => {
      const parsed = parseSessionImport(JSON.parse(text) as unknown)
      await saveImportedSession(parsed)
    })
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
  }
})

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { SyncOutboxRecord } from '@/shared/db'
import {
  getSyncQueueSummary,
  runSyncOnce,
  type SyncQueueSummary,
  type SyncRunResult,
} from '@/shared/sync/client'
import {
  acceptServerConflict,
  keepLocalConflict,
} from '@/shared/sync/conflicts'
import { listSyncConflicts } from '@/shared/sync/outbox'
import {
  getSyncAuthSession,
  getSyncSettings,
  type SyncAuthSession,
  type SyncSettings,
} from '@/shared/sync/settings'

const loading = ref(false)
const busy = ref(false)
const error = ref('')
const lastResult = ref<SyncRunResult | null>(null)
const conflicts = ref<SyncOutboxRecord[]>([])
const summary = ref<SyncQueueSummary>({ pending: 0, conflicts: 0 })
const settings = ref<SyncSettings | null>(null)
const auth = ref<SyncAuthSession | null>(null)
const optionsUrl = chrome.runtime.getURL('src/options/index.html')

onMounted(() => void refresh())

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [nextSettings, nextAuth, nextSummary, nextConflicts] = await Promise.all([
      getSyncSettings(),
      getSyncAuthSession(),
      getSyncQueueSummary(),
      listSyncConflicts(),
    ])
    settings.value = nextSettings
    auth.value = nextAuth
    summary.value = nextSummary
    conflicts.value = nextConflicts
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    loading.value = false
  }
}

async function syncNow(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    lastResult.value = await runSyncOnce()
    await refresh()
  } catch (cause) {
    error.value = messageOf(cause)
    await refresh()
  } finally {
    busy.value = false
  }
}

async function resolveConflict(
  record: SyncOutboxRecord,
  choice: 'local' | 'server',
): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    if (choice === 'local') {
      await keepLocalConflict(record)
    } else {
      await acceptServerConflict(record)
    }
    await refresh()
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    busy.value = false
  }
}

function formatTime(value?: string): string {
  if (!value) return '尚未同步'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function entityLabel(record: SyncOutboxRecord): string {
  if (record.entityType === 'session') return '浏览会话'
  if (record.entityType === 'cloud-bookmark') return '云收藏'
  return '设置'
}

function operationLabel(record: SyncOutboxRecord): string {
  return record.operation === 'delete' ? '本地准备删除' : '本地存在修改'
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : '同步操作失败'
}
</script>

<template>
  <section class="view-content">
    <header class="page-header">
      <div>
        <p>本地优先与跨设备</p>
        <h1>同步中心</h1>
      </div>
      <div class="header-actions">
        <a class="ghost-button" :href="optionsUrl">同步设置</a>
        <button class="ghost-button" :disabled="loading || busy" @click="refresh">刷新</button>
        <button
          class="primary-button"
          :disabled="busy || !settings?.enabled || !auth"
          @click="syncNow"
        >
          {{ busy ? '处理中…' : '立即同步' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="error-banner">{{ error }}</p>
    <p v-if="summary.lastError" class="warning-banner">上次后台同步：{{ summary.lastError }}</p>

    <div v-if="loading" class="empty">正在读取同步状态…</div>
    <template v-else>
      <section class="status-grid">
        <article class="surface status-card">
          <small>账号</small>
          <strong>{{ auth?.email ?? (auth ? auth.userId : '未登录') }}</strong>
          <span>{{ settings?.enabled ? '同步已启用' : '同步未启用' }}</span>
        </article>
        <article class="surface status-card">
          <small>待推送</small>
          <strong>{{ summary.pending }}</strong>
          <span>离线变更保存在本地 Outbox</span>
        </article>
        <article class="surface status-card">
          <small>待处理冲突</small>
          <strong>{{ summary.conflicts }}</strong>
          <span>不会自动覆盖其他设备的数据</span>
        </article>
        <article class="surface status-card">
          <small>最近同步</small>
          <strong class="time-value">{{ formatTime(summary.lastSyncAt) }}</strong>
          <span>后台每 15 分钟尝试一次</span>
        </article>
      </section>

      <section v-if="lastResult" class="result surface">
        <strong>本次同步完成</strong>
        <span>推送 {{ lastResult.pushed }} · 拉取 {{ lastResult.pulled }} · 应用 {{ lastResult.applied }} · 冲突 {{ lastResult.pushConflicts + lastResult.pullConflicts }}</span>
      </section>

      <section class="conflict-section">
        <header>
          <div>
            <h2>冲突处理</h2>
            <p>逐项选择保留本地修改，或接受服务端当前版本。</p>
          </div>
          <span>{{ conflicts.length }} 项</span>
        </header>

        <div v-if="conflicts.length === 0" class="empty small surface">当前没有需要处理的冲突</div>
        <div v-else class="conflict-list">
          <article v-for="record in conflicts" :key="record.id" class="conflict-card surface">
            <div class="conflict-copy">
              <div class="conflict-title">
                <span>{{ entityLabel(record) }}</span>
                <strong>{{ record.entityId }}</strong>
              </div>
              <p>{{ operationLabel(record) }}；服务端版本为 {{ record.serverEntity?.version ?? '未知' }}。</p>
              <small>本地基准版本 {{ record.baseVersion }} · {{ formatTime(record.updatedAt) }}</small>
            </div>
            <div class="conflict-actions">
              <button class="primary-button" :disabled="busy" @click="resolveConflict(record, 'local')">
                保留本地并重试
              </button>
              <button class="ghost-button" :disabled="busy" @click="resolveConflict(record, 'server')">
                接受服务端版本
              </button>
            </div>
          </article>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.view-content { width: min(1240px, 100%); margin: 0 auto; padding: 32px; }
.page-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 22px; }
.page-header p, .conflict-section header p { margin: 0; color: var(--muted); }
h1 { margin: 2px 0 0; font-size: 32px; }
h2 { margin: 0; }
.header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.header-actions a { text-decoration: none; }
.status-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.status-card { min-width: 0; padding: 18px; display: grid; gap: 8px; }
.status-card small, .status-card span { color: var(--muted); }
.status-card strong { font-size: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-card .time-value { font-size: 16px; }
.result { margin-top: 16px; padding: 16px 18px; display: flex; justify-content: space-between; gap: 18px; background: var(--primary-soft); }
.result span { color: var(--muted); }
.conflict-section { display: grid; gap: 14px; margin-top: 30px; }
.conflict-section > header { display: flex; justify-content: space-between; align-items: end; }
.conflict-section > header div { display: grid; gap: 4px; }
.conflict-section > header span { color: var(--muted); }
.conflict-list { display: grid; gap: 12px; }
.conflict-card { padding: 18px; display: flex; justify-content: space-between; gap: 20px; align-items: center; }
.conflict-copy { min-width: 0; display: grid; gap: 6px; }
.conflict-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.conflict-title span { padding: 4px 8px; border-radius: 999px; background: var(--primary-soft); color: var(--primary); font-size: 12px; }
.conflict-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conflict-copy p, .conflict-copy small { margin: 0; color: var(--muted); }
.conflict-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.error-banner, .warning-banner { padding: 10px 14px; border-radius: 12px; }
.error-banner { background: rgba(217, 45, 32, 0.12); color: var(--danger); }
.warning-banner { background: var(--primary-soft); color: var(--text); }
.empty { padding: 80px 0; text-align: center; color: var(--muted); }
.empty.small { padding: 42px 0; }
button:disabled { cursor: not-allowed; opacity: 0.65; }
@media (max-width: 980px) {
  .status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .view-content { padding: 18px; }
  .page-header, .conflict-card, .result { align-items: flex-start; flex-direction: column; }
  .status-grid { grid-template-columns: 1fr; }
  .conflict-actions { justify-content: flex-start; }
}
</style>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useHistoryStore } from '@/stores/history'
import type { HistoryEntry } from '@/shared/domain'

const store = useHistoryStore()

onMounted(() => void store.initialize())

async function remove(entry: HistoryEntry): Promise<void> {
  const confirmed = window.confirm(
    `删除“${entry.title}”的全部浏览历史记录？\n\n该操作只影响此网址，不会删除云收藏或书签。`,
  )
  if (!confirmed) return
  await store.remove(entry)
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
</script>

<template>
  <section class="view-content">
    <header class="page-header">
      <div>
        <p>本地浏览数据</p>
        <h1>浏览历史</h1>
      </div>
      <button
        v-if="store.permissionGranted"
        class="ghost-button"
        :disabled="store.loading"
        @click="store.refresh"
      >
        刷新
      </button>
    </header>

    <div v-if="!store.initialized" class="empty">正在检查权限…</div>

    <section v-else-if="!store.permissionGranted" class="permission-card surface">
      <div class="permission-icon">◷</div>
      <h2>浏览历史权限尚未启用</h2>
      <p>
        ATab 只在你打开此页面并明确授权后读取本地历史。历史不会自动写入数据库或上传到云端。
      </p>
      <ul>
        <li>可搜索最近访问页面并按日期分组。</li>
        <li>删除操作只针对你明确选择的网址。</li>
        <li>只有点击“保存到云收藏”时，才会生成同步记录。</li>
      </ul>
      <button class="primary-button" @click="store.grantPermission">授权读取浏览历史</button>
      <p v-if="store.error" class="error-banner">{{ store.error }}</p>
    </section>

    <template v-else>
      <p class="privacy-notice">
        当前历史内容仅从浏览器临时读取。搜索词和结果不会自动同步；权限可在浏览器扩展设置中随时撤销。
      </p>

      <section class="toolbar surface">
        <input
          v-model="store.query"
          class="input"
          placeholder="搜索标题或网址"
          @keyup.enter="store.refresh"
        />
        <select v-model="store.rangeDays" class="input range-select" @change="store.refresh">
          <option :value="1">最近 1 天</option>
          <option :value="7">最近 7 天</option>
          <option :value="30">最近 30 天</option>
          <option :value="90">最近 90 天</option>
        </select>
        <button class="primary-button" :disabled="store.loading" @click="store.refresh">
          {{ store.loading ? '搜索中…' : '搜索' }}
        </button>
      </section>

      <p v-if="store.error" class="error-banner">{{ store.error }}</p>
      <p v-if="store.message" class="success-banner">{{ store.message }}</p>

      <div v-if="store.loading" class="empty">正在读取浏览历史…</div>
      <div v-else-if="store.entries.length === 0" class="empty surface">
        当前时间范围内没有匹配的网页历史记录。
      </div>

      <section v-else class="history-groups">
        <article v-for="group in store.groups" :key="group.key" class="history-group">
          <header class="group-header">
            <h2>{{ group.label }}</h2>
            <span>{{ group.entries.length }} 个页面</span>
          </header>
          <div class="history-list surface">
            <div v-for="entry in group.entries" :key="entry.id" class="history-row">
              <time>{{ formatTime(entry.lastVisitTime) }}</time>
              <div class="site-icon">{{ domainOf(entry.url).slice(0, 1).toUpperCase() }}</div>
              <button class="entry-main" @click="store.open(entry)">
                <strong>{{ entry.title }}</strong>
                <small>{{ domainOf(entry.url) }} · {{ entry.url }}</small>
              </button>
              <div class="visit-meta">
                <span>访问 {{ entry.visitCount }} 次</span>
                <span v-if="entry.typedCount">手输 {{ entry.typedCount }} 次</span>
              </div>
              <div class="row-actions">
                <button
                  class="row-action"
                  :disabled="store.mutating || store.savedIds.includes(entry.id)"
                  @click="store.saveToCloud(entry)"
                >
                  {{ store.savedIds.includes(entry.id) ? '已收藏' : '保存到云收藏' }}
                </button>
                <button class="danger-link" :disabled="store.mutating" @click="remove(entry)">
                  删除历史
                </button>
              </div>
            </div>
          </div>
        </article>
      </section>
    </template>
  </section>
</template>

<style scoped>
.view-content { width: min(1280px, 100%); margin: 0 auto; padding: 32px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.page-header p { margin: 0; color: var(--muted); }
h1 { margin: 2px 0 0; font-size: 32px; }
.permission-card { width: min(680px, 100%); margin: 60px auto; padding: 34px; text-align: center; }
.permission-card p, .permission-card li { color: var(--muted); line-height: 1.7; }
.permission-card ul { width: fit-content; margin: 20px auto; text-align: left; }
.permission-icon { width: 64px; height: 64px; margin: 0 auto 16px; display: grid; place-items: center; border-radius: 20px; background: var(--primary-soft); color: var(--primary); font-size: 32px; }
.privacy-notice, .error-banner, .success-banner { padding: 12px 14px; border-radius: 12px; }
.privacy-notice { color: var(--muted); background: var(--primary-soft); }
.error-banner { color: var(--danger); background: rgba(217, 45, 32, 0.1); }
.success-banner { color: var(--primary); background: var(--primary-soft); }
.toolbar { display: grid; grid-template-columns: minmax(0, 1fr) 160px auto; gap: 10px; padding: 14px; margin: 18px 0 24px; }
.range-select { min-width: 150px; }
.history-groups { display: grid; gap: 24px; }
.history-group { display: grid; gap: 10px; }
.group-header { display: flex; justify-content: space-between; align-items: center; }
.group-header h2 { margin: 0; font-size: 18px; }
.group-header span { color: var(--muted); }
.history-list { overflow: hidden; }
.history-row { display: grid; grid-template-columns: 76px 34px minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.history-row:last-child { border-bottom: 0; }
time { color: var(--muted); font-variant-numeric: tabular-nums; }
.site-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 10px; background: var(--primary-soft); color: var(--primary); font-weight: 700; }
.entry-main { min-width: 0; border: 0; background: transparent; color: var(--text); text-align: left; display: grid; gap: 4px; }
.entry-main strong, .entry-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-main small { color: var(--muted); }
.visit-meta { display: grid; gap: 3px; color: var(--muted); font-size: 12px; text-align: right; }
.row-actions { display: flex; gap: 6px; }
.row-action, .danger-link { border: 0; background: transparent; padding: 7px; color: var(--muted); white-space: nowrap; }
.danger-link { color: var(--danger); }
button:disabled { cursor: not-allowed; opacity: 0.55; }
.empty { padding: 72px 24px; text-align: center; color: var(--muted); }
@media (max-width: 900px) {
  .history-row { grid-template-columns: 60px 32px minmax(0, 1fr); }
  .visit-meta, .row-actions { grid-column: 3; justify-content: flex-start; text-align: left; display: flex; flex-wrap: wrap; }
}
@media (max-width: 640px) {
  .view-content { padding: 18px; }
  .toolbar { grid-template-columns: 1fr; }
  .history-row { grid-template-columns: 32px minmax(0, 1fr); }
  .history-row time { grid-column: 1 / -1; }
  .site-icon { grid-column: 1; }
  .entry-main, .visit-meta, .row-actions { grid-column: 2; }
}
</style>

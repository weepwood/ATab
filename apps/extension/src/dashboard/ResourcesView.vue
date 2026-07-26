<script setup lang="ts">
import { onMounted } from 'vue'
import type { ResourceRecord } from '@/shared/domain'
import { isPotentiallySensitivePage } from '@/shared/pageCapture'
import { useResourcesStore } from '@/stores/resources'

const store = useResourcesStore()

onMounted(() => void store.initialize())

async function captureSelected(): Promise<void> {
  const tab = store.selectedTab
  if (!tab) return
  if (isPotentiallySensitivePage(tab.url, tab.title)) {
    const confirmed = window.confirm(
      `“${tab.title}”可能包含登录、支付、邮箱或医疗等敏感内容。\n\n确认只在本地保存该页面正文？正文默认不会上传或发送给 AI。`,
    )
    if (!confirmed) return
  }
  try {
    await store.captureSelected()
  } catch {
    // 错误已经写入 store，页面通过错误提示展示。
  }
}

async function refresh(resource: ResourceRecord): Promise<void> {
  if (isPotentiallySensitivePage(resource.originalUrl, resource.title)) {
    const confirmed = window.confirm(
      `确认重新读取“${resource.title}”当前打开页面的正文？`,
    )
    if (!confirmed) return
  }
  try {
    await store.refreshResource(resource)
  } catch {
    // 错误已经写入 store。
  }
}

async function remove(resource: ResourceRecord): Promise<void> {
  const confirmed = window.confirm(
    `删除“${resource.title}”的 ATab 本地正文快照？\n\n不会删除浏览器书签、历史记录或网页本身。`,
  )
  if (!confirmed) return
  try {
    await store.remove(resource)
  } catch {
    // 错误已经写入 store。
  }
}

function formatTime(value?: string): string {
  if (!value) return '尚未采集'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}
</script>

<template>
  <section class="view-content">
    <header class="page-header">
      <div>
        <p>本地网页知识索引</p>
        <h1>网页资料</h1>
      </div>
      <button class="ghost-button" :disabled="store.loading" @click="store.initialize">
        刷新
      </button>
    </header>

    <p class="privacy-notice">
      ATab 只在你主动点击保存时读取所选页面。正文保存在当前浏览器的 IndexedDB 中，不进入同步 Outbox，也不会自动发送给 AI。
    </p>

    <section class="capture-panel surface">
      <div class="capture-copy">
        <strong>从打开的标签页保存正文</strong>
        <span>首次读取某个网站时，浏览器会请求该网站的主机权限。</span>
      </div>
      <select v-model.number="store.selectedTabId" class="input tab-select">
        <option :value="null" disabled>选择网页标签页</option>
        <option v-for="tab in store.capturableTabs" :key="tab.id" :value="tab.id">
          {{ tab.title }} · {{ tab.url }}
        </option>
      </select>
      <div class="capture-actions">
        <button class="ghost-button" :disabled="store.loading" @click="store.refreshTabs">
          更新标签页
        </button>
        <button
          class="primary-button"
          :disabled="store.capturing || !store.selectedTab"
          @click="captureSelected"
        >
          {{ store.capturing ? '采集中…' : '保存网页正文' }}
        </button>
      </div>
    </section>

    <p v-if="store.error" class="error-banner">{{ store.error }}</p>
    <p v-if="store.message" class="success-banner">{{ store.message }}</p>

    <section class="library-toolbar">
      <input
        v-model="store.query"
        class="input"
        placeholder="搜索标题、网址、描述或已保存正文"
      />
      <span>{{ store.filteredItems.length }} 项 · {{ formatNumber(store.totalCharacters) }} 字符</span>
    </section>

    <div v-if="store.loading" class="empty">正在读取本地资源库…</div>
    <div v-else-if="store.filteredItems.length === 0" class="empty surface">
      <template v-if="store.items.length === 0">
        尚未保存网页正文。选择一个打开的标签页，点击“保存网页正文”建立本地索引。
      </template>
      <template v-else>
        没有匹配当前关键词的网页资料。
      </template>
    </div>

    <section v-else class="resource-grid">
      <article v-for="item in store.filteredItems" :key="item.resource.id" class="resource-card surface">
        <header>
          <div class="resource-icon">
            <img v-if="item.resource.faviconUrl" :src="item.resource.faviconUrl" alt="" />
            <span v-else>{{ item.resource.domain.slice(0, 1).toUpperCase() }}</span>
          </div>
          <div class="resource-heading">
            <button class="resource-title" @click="store.open(item.resource)">
              {{ item.resource.title }}
            </button>
            <small>{{ item.resource.domain }} · {{ item.resource.canonicalUrl }}</small>
          </div>
        </header>

        <p v-if="item.resource.description" class="description">
          {{ item.resource.description }}
        </p>
        <p class="excerpt">{{ item.content.excerpt }}</p>

        <div class="resource-meta">
          <span>采集于 {{ formatTime(item.content.capturedAt) }}</span>
          <span>{{ formatNumber(item.content.characterCount) }} 字符</span>
          <span>{{ formatNumber(item.content.wordCount) }} 词元</span>
          <span v-if="item.resource.language">{{ item.resource.language }}</span>
        </div>

        <div class="privacy-tags">
          <span>仅本地</span>
          <span>AI 未读取</span>
          <span>未同步</span>
        </div>

        <footer>
          <button class="row-action" @click="store.open(item.resource)">打开网页</button>
          <button
            class="row-action"
            :disabled="store.capturing || !store.hasOpenTab(item.resource)"
            :title="store.hasOpenTab(item.resource) ? '重新读取当前打开页面' : '请先打开该网页'"
            @click="refresh(item.resource)"
          >
            重新采集
          </button>
          <button class="danger-link" :disabled="store.mutating" @click="remove(item.resource)">
            删除快照
          </button>
        </footer>
      </article>
    </section>
  </section>
</template>

<style scoped>
.view-content { width: min(1280px, 100%); margin: 0 auto; padding: 32px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.page-header p { margin: 0; color: var(--muted); }
h1 { margin: 2px 0 0; font-size: 32px; }
.privacy-notice, .error-banner, .success-banner { padding: 12px 14px; border-radius: 12px; }
.privacy-notice { color: var(--muted); background: var(--primary-soft); line-height: 1.6; }
.error-banner { color: var(--danger); background: rgba(217, 45, 32, 0.1); }
.success-banner { color: var(--primary); background: var(--primary-soft); }
.capture-panel { display: grid; grid-template-columns: minmax(210px, 0.7fr) minmax(320px, 1.3fr) auto; gap: 14px; align-items: center; padding: 16px; margin: 18px 0; }
.capture-copy { display: grid; gap: 4px; }
.capture-copy span { color: var(--muted); font-size: 13px; line-height: 1.5; }
.tab-select { min-width: 0; }
.capture-actions { display: flex; gap: 8px; }
.library-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: center; margin: 22px 0 16px; }
.library-toolbar span { color: var(--muted); white-space: nowrap; }
.resource-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
.resource-card { display: grid; gap: 14px; padding: 18px; min-width: 0; }
.resource-card header { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 12px; align-items: center; }
.resource-icon { width: 42px; height: 42px; display: grid; place-items: center; overflow: hidden; border-radius: 13px; background: var(--primary-soft); color: var(--primary); font-weight: 700; }
.resource-icon img { width: 22px; height: 22px; object-fit: contain; }
.resource-heading { min-width: 0; display: grid; gap: 4px; }
.resource-title { min-width: 0; border: 0; padding: 0; background: transparent; color: var(--text); font-size: 16px; font-weight: 700; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resource-heading small { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.description { margin: 0; color: var(--text); line-height: 1.6; }
.excerpt { margin: 0; color: var(--muted); line-height: 1.65; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
.resource-meta, .privacy-tags { display: flex; flex-wrap: wrap; gap: 7px; color: var(--muted); font-size: 12px; }
.resource-meta span, .privacy-tags span { padding: 5px 8px; border-radius: 999px; background: var(--surface-strong); }
.privacy-tags span { color: var(--primary); background: var(--primary-soft); }
.resource-card footer { display: flex; gap: 8px; padding-top: 4px; border-top: 1px solid var(--line); }
.row-action, .danger-link { border: 0; background: transparent; padding: 7px; color: var(--muted); }
.danger-link { margin-left: auto; color: var(--danger); }
button:disabled { cursor: not-allowed; opacity: 0.55; }
.empty { padding: 72px 24px; text-align: center; color: var(--muted); }
@media (max-width: 940px) {
  .capture-panel { grid-template-columns: 1fr; }
  .capture-actions { justify-content: flex-end; }
}
@media (max-width: 640px) {
  .view-content { padding: 18px; }
  .library-toolbar { grid-template-columns: 1fr; }
  .capture-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .resource-grid { grid-template-columns: 1fr; }
}
</style>

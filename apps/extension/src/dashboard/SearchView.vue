<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getEmbeddingEndpointPreview } from '@/shared/ai/embedding'
import { useUnifiedSearchStore } from '@/stores/unifiedSearch'
import {
  sourceLabel,
  UNIFIED_SEARCH_SOURCES,
  type UnifiedSearchResult,
  type UnifiedSearchSource,
} from '@/shared/unifiedSearch'

const store = useUnifiedSearchStore()
const input = ref<HTMLInputElement | null>(null)
let debounceTimer: number | undefined

onMounted(() => {
  void store.loadSemanticSettings().catch((cause: unknown) => {
    store.semanticError = cause instanceof Error ? cause.message : '读取语义搜索设置失败'
  })
})

watch(
  () => store.query,
  () => scheduleSearch(),
)

onBeforeUnmount(() => {
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
})

defineExpose({ focus })

function focus(): void {
  void nextTick(() => {
    input.value?.focus()
    input.value?.select()
  })
}

function scheduleSearch(): void {
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => void store.search(), 180)
}

function toggleSource(source: UnifiedSearchSource): void {
  store.toggleSource(source)
  scheduleSearch()
}

async function enableSemanticSearch(): Promise<void> {
  try {
    const preview = await getEmbeddingEndpointPreview()
    const confirmed = window.confirm(
      `启用语义搜索？\n\n启用操作本身不会发送数据。此后只有你主动点击“语义查找（发送当前查询）”时，ATab 才会把当前搜索词发送到：\n${preview.endpoint}\n\n资源向量和相似度计算仍只保存在当前浏览器。`,
    )
    if (!confirmed) return
    await store.enableSemanticSearch()
  } catch (cause) {
    store.semanticError = cause instanceof Error ? cause.message : '启用语义搜索失败'
  }
}

async function disableSemanticSearch(): Promise<void> {
  try {
    await store.disableSemanticSearch()
  } catch (cause) {
    store.semanticError = cause instanceof Error ? cause.message : '关闭语义搜索失败'
  }
}

async function runSemanticSearch(): Promise<void> {
  try {
    await store.runSemanticSearch()
  } catch {
    // 语义错误单独保存在 store，不清空本地关键词结果。
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    store.moveSelection(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    store.moveSelection(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    void store.execute()
  } else if (event.key === 'Escape') {
    store.query = ''
    store.results = []
  }
}

function actionLabel(result: UnifiedSearchResult): string {
  if (result.action === 'focus-tab') return '切换'
  if (result.action === 'restore-session') return '恢复'
  return '打开'
}

function matchLabel(result: UnifiedSearchResult): string {
  return result.matchedFields
    .map((field) => {
      if (field === 'title') return '标题'
      if (field === 'url') return '网址'
      if (field === 'keywords') return '标签/内容'
      if (field === 'body') return '正文/语义'
      return '说明'
    })
    .join('、')
}

function sourceClass(source: UnifiedSearchSource): string {
  return `source-${source}`
}
</script>

<template>
  <section class="view-content">
    <header class="page-header">
      <div>
        <p>本地跨数据源检索</p>
        <h1>统一搜索</h1>
      </div>
      <kbd>Ctrl / ⌘ + K</kbd>
    </header>

    <section class="search-shell surface">
      <div class="search-box">
        <span class="search-icon">⌕</span>
        <input
          ref="input"
          v-model="store.query"
          placeholder="搜索标签页、书签、云收藏、网页资料、会话和浏览历史"
          autocomplete="off"
          @keydown="onKeydown"
        />
        <span v-if="store.loading" class="loading-text">检索中…</span>
        <button v-else-if="store.query" class="clear-button" @click="store.query = ''">清空</button>
      </div>

      <div class="source-filters">
        <button
          v-for="source in UNIFIED_SEARCH_SOURCES"
          :key="source"
          :class="{ active: store.selectedSources.includes(source) }"
          @click="toggleSource(source)"
        >
          {{ sourceLabel(source) }}
          <span v-if="store.query">{{ store.sourceCounts[source] }}</span>
        </button>
      </div>

      <div class="semantic-controls">
        <template v-if="!store.semanticEnabled">
          <div>
            <strong>语义搜索默认关闭</strong>
            <span>本地关键词搜索不会发送查询词，也不依赖 AI 服务。</span>
          </div>
          <button class="semantic-enable" @click="enableSemanticSearch">了解并启用</button>
        </template>
        <template v-else>
          <div>
            <strong>语义搜索已启用</strong>
            <span>只有点击右侧按钮才会发送当前查询；仅比较已建立本地语义索引的网页资料。</span>
          </div>
          <div class="semantic-actions">
            <button
              class="semantic-run"
              :disabled="store.semanticLoading || store.query.trim().length < 2 || !store.selectedSources.includes('resource')"
              @click="runSemanticSearch"
            >
              {{ store.semanticLoading ? '语义查找中…' : '语义查找（发送当前查询）' }}
            </button>
            <button class="semantic-disable" :disabled="store.semanticLoading" @click="disableSemanticSearch">
              关闭
            </button>
          </div>
        </template>
      </div>
    </section>

    <p class="privacy-notice">
      实时关键词搜索完全在扩展本地执行。网页正文只检索你主动保存的快照；语义搜索仅在点击按钮时发送当前查询，资源向量与相似度结果不进入同步服务。
    </p>
    <p v-if="store.error" class="error-banner">{{ store.error }}</p>
    <p v-if="store.semanticError" class="semantic-error">
      语义搜索：{{ store.semanticError }}。本地关键词结果仍然可用。
    </p>
    <p v-else-if="store.semanticMatchCount > 0" class="semantic-success">
      已合并 {{ store.semanticMatchCount }} 条语义相似的网页资料结果。
    </p>

    <section v-if="!store.query" class="empty-state surface">
      <strong>输入关键词开始检索</strong>
      <p>支持多个以空格分隔的关键词；每个关键词都必须在标题、网址、标签、备注、说明或已保存正文中命中。</p>
      <div class="hints">
        <span>↑ ↓ 选择</span>
        <span>Enter 打开</span>
        <span>Esc 清空</span>
      </div>
    </section>

    <section v-else-if="!store.loading && store.results.length === 0" class="empty-state surface">
      <strong>本地关键词没有匹配结果</strong>
      <p v-if="store.semanticEnabled">仍可点击“语义查找”寻找含义接近且已建立向量索引的网页资料。</p>
      <p v-else-if="!store.historyAvailable">浏览历史未授权，因此当前只检索其他本地数据源。</p>
      <p v-else>尝试减少关键词，或重新启用某个数据来源。</p>
    </section>

    <section v-else class="results surface">
      <header class="results-header">
        <span>共 {{ store.results.length }} 条结果</span>
        <span>{{ store.semanticMatchCount > 0 ? '关键词与语义混合排序' : '本地关键词相关度排序' }}</span>
      </header>
      <button
        v-for="(result, index) in store.results"
        :key="result.id"
        class="result-row"
        :class="{ selected: index === store.selectedIndex }"
        @mouseenter="store.select(index)"
        @click="store.execute(result)"
      >
        <span class="source-badge" :class="sourceClass(result.source)">
          {{ sourceLabel(result.source) }}
        </span>
        <span class="result-main">
          <strong>{{ result.title }}</strong>
          <small>{{ result.subtitle }}</small>
          <small v-if="result.url" class="url">{{ result.url }}</small>
        </span>
        <span class="match-info">命中：{{ matchLabel(result) }}</span>
        <span class="action-hint">{{ actionLabel(result) }}</span>
      </button>
    </section>
  </section>
</template>

<style scoped>
.view-content { width: min(1120px, 100%); margin: 0 auto; padding: 32px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header p { margin: 0; color: var(--muted); }
h1 { margin: 2px 0 0; font-size: 32px; }
kbd { padding: 7px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-strong); color: var(--muted); box-shadow: 0 2px 0 var(--line); }
.search-shell { overflow: hidden; }
.search-box { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; padding: 10px 16px; }
.search-box input { border: 0; outline: 0; padding: 10px 0; background: transparent; color: var(--text); font-size: 18px; }
.search-icon { font-size: 28px; color: var(--primary); }
.loading-text { color: var(--muted); }
.clear-button { border: 0; background: transparent; color: var(--muted); padding: 8px; }
.source-filters { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); }
.source-filters button { border: 1px solid transparent; border-radius: 999px; padding: 7px 11px; background: transparent; color: var(--muted); }
.source-filters button.active { border-color: var(--line); background: var(--primary-soft); color: var(--primary); }
.source-filters span { margin-left: 5px; opacity: 0.75; }
.semantic-controls { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 13px 16px; border-top: 1px solid var(--line); background: rgba(37, 99, 235, 0.05); }
.semantic-controls > div:first-child { display: grid; gap: 3px; }
.semantic-controls span { color: var(--muted); font-size: 12px; line-height: 1.5; }
.semantic-actions { display: flex; gap: 8px; flex-shrink: 0; }
.semantic-enable, .semantic-run, .semantic-disable { border-radius: 10px; padding: 8px 11px; }
.semantic-enable, .semantic-run { border: 0; background: #2563eb; color: white; }
.semantic-disable { border: 1px solid var(--line); background: transparent; color: var(--muted); }
.semantic-run:disabled, .semantic-disable:disabled { cursor: not-allowed; opacity: 0.5; }
.privacy-notice, .error-banner, .semantic-error, .semantic-success { padding: 11px 13px; border-radius: 12px; }
.privacy-notice { color: var(--muted); background: var(--primary-soft); }
.error-banner, .semantic-error { color: var(--danger); background: rgba(217, 45, 32, 0.1); }
.semantic-success { color: #2563eb; background: rgba(37, 99, 235, 0.08); }
.empty-state { margin-top: 18px; padding: 70px 24px; text-align: center; color: var(--muted); }
.empty-state strong { color: var(--text); font-size: 18px; }
.hints { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.hints span { padding: 5px 9px; border-radius: 8px; background: var(--primary-soft); }
.results { margin-top: 18px; overflow: hidden; }
.results-header { display: flex; justify-content: space-between; padding: 12px 16px; color: var(--muted); border-bottom: 1px solid var(--line); }
.result-row { width: 100%; display: grid; grid-template-columns: 88px minmax(0, 1fr) auto 54px; gap: 12px; align-items: center; border: 0; border-bottom: 1px solid var(--line); padding: 13px 16px; background: transparent; color: var(--text); text-align: left; }
.result-row:last-child { border-bottom: 0; }
.result-row.selected { background: var(--primary-soft); }
.source-badge { width: fit-content; padding: 5px 8px; border-radius: 8px; background: var(--surface-strong); color: var(--muted); font-size: 12px; }
.source-tab { color: var(--primary); }
.source-cloud-bookmark { color: #7b61ff; }
.source-resource { color: #2563eb; }
.source-session { color: #9a6700; }
.source-history { color: #087a6f; }
.result-main { min-width: 0; display: grid; gap: 3px; }
.result-main strong, .result-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-main small { color: var(--muted); }
.result-main .url { opacity: 0.76; }
.match-info { color: var(--muted); font-size: 12px; white-space: nowrap; }
.action-hint { color: var(--primary); text-align: right; }
@media (max-width: 760px) {
  .view-content { padding: 18px; }
  .page-header kbd { display: none; }
  .semantic-controls { display: grid; }
  .semantic-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
  .result-row { grid-template-columns: 78px minmax(0, 1fr) auto; }
  .match-info { display: none; }
}
</style>

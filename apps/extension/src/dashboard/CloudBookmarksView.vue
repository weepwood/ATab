<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useCloudBookmarksStore } from '@/stores/cloudBookmarks'
import type { CloudBookmarkRecord } from '@/shared/domain'

const store = useCloudBookmarksStore()
const editing = ref<CloudBookmarkRecord | null>(null)
const editorOpen = ref(false)
const form = reactive({
  title: '',
  url: '',
  folder: '',
  tags: '',
  note: '',
})

onMounted(() => void store.refresh())

function startCreate(): void {
  editing.value = null
  Object.assign(form, { title: '', url: '', folder: store.selectedFolder, tags: '', note: '' })
  editorOpen.value = true
}

function startEdit(record: CloudBookmarkRecord): void {
  editing.value = record
  Object.assign(form, {
    title: record.title,
    url: record.url,
    folder: record.folder,
    tags: record.tags.join(', '),
    note: record.note,
  })
  editorOpen.value = true
}

async function save(): Promise<void> {
  const input = {
    title: form.title,
    url: form.url,
    folder: form.folder,
    tags: form.tags.split(/[,，]/),
    note: form.note,
    archived: editing.value?.archived ?? false,
  }
  if (editing.value) await store.update(editing.value, input)
  else await store.create(input)
  editorOpen.value = false
}

async function remove(record: CloudBookmarkRecord): Promise<void> {
  if (!window.confirm(`删除云收藏“${record.title}”？这不会删除浏览器原生书签。`)) return
  await store.remove(record)
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
</script>

<template>
  <section class="view-content">
    <header class="page-header">
      <div>
        <p>跨设备知识收藏</p>
        <h1>云收藏</h1>
      </div>
      <div class="header-actions">
        <button class="ghost-button" :disabled="store.mutating" @click="store.prepareImport">
          从原生书签导入
        </button>
        <button class="primary-button" @click="startCreate">新增云收藏</button>
      </div>
    </header>

    <p class="notice">
      云收藏与 Chrome/Edge 原生书签相互独立。导入只复制数据，删除云收藏不会影响原书签。
    </p>
    <p v-if="store.error" class="error-banner">{{ store.error }}</p>
    <p v-if="store.lastImportResult" class="success-banner">
      已导入 {{ store.lastImportResult.created }} 条，跳过 {{ store.lastImportResult.skipped }} 条。
    </p>

    <section class="toolbar surface">
      <input v-model="store.query" class="input" placeholder="搜索标题、网址、标签或备注" />
      <label class="archive-toggle">
        <input v-model="store.includeArchived" type="checkbox" />
        显示已归档
      </label>
      <button class="ghost-button" :disabled="store.loading" @click="store.refresh">刷新</button>
    </section>

    <div class="workspace">
      <aside class="folders surface">
        <button :class="{ active: store.selectedFolder === '' }" @click="store.selectedFolder = ''">
          全部收藏
          <span>{{ store.records.length }}</span>
        </button>
        <button
          v-for="folder in store.folders"
          :key="folder"
          :class="{ active: store.selectedFolder === folder }"
          @click="store.selectedFolder = folder"
        >
          {{ folder }}
          <span>{{ store.records.filter((record) => record.folder === folder).length }}</span>
        </button>
      </aside>

      <main class="records">
        <div v-if="store.loading" class="empty">正在读取云收藏…</div>
        <div v-else-if="store.filteredRecords.length === 0" class="empty surface">
          当前没有匹配的云收藏。
        </div>
        <article
          v-for="record in store.filteredRecords"
          :key="record.id"
          class="record surface"
          :class="{ archived: record.archived }"
        >
          <div class="record-main">
            <button class="title-button" @click="store.open(record)">{{ record.title }}</button>
            <a :href="record.url" target="_blank" rel="noreferrer">{{ record.url }}</a>
            <p v-if="record.note">{{ record.note }}</p>
            <div class="meta">
              <span v-if="record.folder">{{ record.folder }}</span>
              <span v-for="tag in record.tags" :key="tag">#{{ tag }}</span>
              <span>{{ record.source === 'browser-bookmark' ? '原生书签导入' : '手动创建' }}</span>
              <span>{{ formatTime(record.updatedAt) }}</span>
            </div>
          </div>
          <div class="record-actions">
            <button class="row-action" @click="startEdit(record)">编辑</button>
            <button class="row-action" @click="store.toggleArchived(record)">
              {{ record.archived ? '取消归档' : '归档' }}
            </button>
            <button class="danger-link" @click="remove(record)">删除</button>
          </div>
        </article>
      </main>
    </div>

    <div v-if="editorOpen" class="overlay" @click.self="editorOpen = false">
      <section class="dialog surface">
        <header>
          <div>
            <p>云收藏</p>
            <h2>{{ editing ? '编辑收藏' : '新增收藏' }}</h2>
          </div>
          <button class="row-action" @click="editorOpen = false">关闭</button>
        </header>
        <label>标题<input v-model="form.title" class="input" placeholder="页面标题" /></label>
        <label>网址<input v-model="form.url" class="input" placeholder="https://example.com" /></label>
        <label>文件夹路径<input v-model="form.folder" class="input" placeholder="工作 / 前端" /></label>
        <label>标签<input v-model="form.tags" class="input" placeholder="vue, ai, 稍后阅读" /></label>
        <label>备注<textarea v-model="form.note" class="input textarea" placeholder="为什么收藏、后续要做什么" /></label>
        <footer>
          <button class="ghost-button" @click="editorOpen = false">取消</button>
          <button class="primary-button" :disabled="store.mutating" @click="save">
            {{ store.mutating ? '保存中…' : '保存' }}
          </button>
        </footer>
      </section>
    </div>

    <div v-if="store.importCandidates.length" class="overlay" @click.self="store.cancelImport">
      <section class="dialog import-dialog surface">
        <header>
          <div>
            <p>只复制，不修改原书签</p>
            <h2>导入预览</h2>
          </div>
          <button class="row-action" @click="store.cancelImport">关闭</button>
        </header>
        <div class="import-summary">
          共发现 {{ store.importCandidates.length }} 条；可导入 {{ store.importableCandidates.length }} 条；
          已存在或树内重复 {{ store.importCandidates.length - store.importableCandidates.length }} 条。
        </div>
        <div class="import-actions">
          <button class="ghost-button" @click="store.selectAllImportable">选择全部可导入项</button>
          <span>已选择 {{ store.selectedImportIds.length }} 条</span>
        </div>
        <div class="import-list">
          <label v-for="candidate in store.importCandidates.slice(0, 500)" :key="candidate.sourceBookmarkId">
            <input
              type="checkbox"
              :disabled="candidate.duplicate"
              :checked="store.selectedImportIds.includes(candidate.sourceBookmarkId)"
              @change="store.toggleImport(candidate.sourceBookmarkId)"
            />
            <span>
              <strong>{{ candidate.title }}</strong>
              <small>{{ candidate.folder || '未分类' }} · {{ candidate.url }}</small>
            </span>
            <em v-if="candidate.duplicate">重复</em>
          </label>
        </div>
        <p v-if="store.importCandidates.length > 500" class="notice">
          预览只显示前 500 条，但导入仍按当前选择执行。
        </p>
        <footer>
          <button class="ghost-button" @click="store.cancelImport">取消</button>
          <button
            class="primary-button"
            :disabled="store.mutating || store.selectedImportIds.length === 0"
            @click="store.importSelected"
          >
            {{ store.mutating ? '导入中…' : `导入 ${store.selectedImportIds.length} 条` }}
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.view-content { width: min(1280px, 100%); margin: 0 auto; padding: 32px; }
.page-header, .dialog header, .dialog footer, .header-actions, .record-actions, .import-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.page-header { margin-bottom: 16px; }
h1, h2 { margin: 2px 0 0; }
.page-header p, .dialog header p { margin: 0; color: var(--muted); }
.notice, .error-banner, .success-banner { padding: 12px 14px; border-radius: 12px; }
.notice { color: var(--muted); background: var(--primary-soft); }
.error-banner { color: var(--danger); background: rgba(217, 45, 32, 0.1); }
.success-banner { color: var(--primary); background: var(--primary-soft); }
.toolbar { display: flex; gap: 12px; align-items: center; padding: 14px; margin: 18px 0; }
.toolbar .input { flex: 1; }
.archive-toggle { display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.workspace { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 16px; align-items: start; }
.folders { padding: 10px; display: grid; gap: 5px; position: sticky; top: 18px; }
.folders button { display: flex; justify-content: space-between; gap: 10px; border: 0; border-radius: 10px; padding: 10px; background: transparent; color: var(--muted); text-align: left; }
.folders button.active { background: var(--primary-soft); color: var(--primary); }
.records { display: grid; gap: 12px; }
.record { padding: 18px; display: flex; justify-content: space-between; gap: 20px; }
.record.archived { opacity: 0.66; }
.record-main { min-width: 0; display: grid; gap: 7px; }
.title-button { border: 0; padding: 0; background: transparent; color: var(--text); text-align: left; font-weight: 700; font-size: 17px; }
.record a, .record p { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
.meta { display: flex; flex-wrap: wrap; gap: 7px; }
.meta span { padding: 4px 8px; border-radius: 999px; background: var(--primary-soft); color: var(--muted); font-size: 12px; }
.record-actions { align-self: flex-start; flex-wrap: wrap; justify-content: flex-end; }
.row-action, .danger-link { border: 0; background: transparent; padding: 7px; color: var(--muted); }
.danger-link { color: var(--danger); }
.empty { padding: 70px 24px; text-align: center; color: var(--muted); }
.overlay { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: 24px; background: rgba(10, 14, 24, 0.55); }
.dialog { width: min(620px, 100%); max-height: calc(100vh - 48px); overflow: auto; padding: 22px; display: grid; gap: 16px; }
.dialog label { display: grid; gap: 7px; }
.textarea { min-height: 110px; resize: vertical; }
.import-dialog { width: min(860px, 100%); }
.import-summary { color: var(--muted); }
.import-list { max-height: 52vh; overflow: auto; border: 1px solid var(--line); border-radius: 14px; }
.import-list label { grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; padding: 11px 12px; border-bottom: 1px solid var(--line); }
.import-list label:last-child { border-bottom: 0; }
.import-list span { display: grid; gap: 3px; min-width: 0; }
.import-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
.import-list em { color: var(--danger); font-style: normal; font-size: 12px; }
@media (max-width: 760px) {
  .view-content { padding: 18px; }
  .page-header, .toolbar, .record { align-items: stretch; flex-direction: column; }
  .workspace { grid-template-columns: 1fr; }
  .folders { position: static; display: flex; overflow-x: auto; }
  .folders button { min-width: 130px; }
  .record-actions { justify-content: flex-start; }
}
</style>

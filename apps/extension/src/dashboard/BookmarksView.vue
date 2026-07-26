<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useBookmarksStore } from '@/stores/bookmarks'
import type { BookmarkNodeView } from '@/shared/domain'

const store = useBookmarksStore()

type EditorMode = 'create-bookmark' | 'create-folder' | 'edit' | 'move' | 'delete'

const editorMode = ref<EditorMode | null>(null)
const editingNode = ref<BookmarkNodeView | null>(null)
const title = ref('')
const url = ref('')
const targetFolderId = ref('')
const dialogError = ref('')

const moveTargets = computed(() =>
  editingNode.value ? store.moveTargets(editingNode.value.id) : [],
)

onMounted(() => void store.refresh())

function folderTitle(node?: BookmarkNodeView): string {
  if (!node) return '未选择文件夹'
  return node.parentId ? node.title || '未命名文件夹' : '全部书签'
}

function closeEditor(): void {
  editorMode.value = null
  editingNode.value = null
  title.value = ''
  url.value = ''
  targetFolderId.value = ''
  dialogError.value = ''
}

function openCreateBookmark(): void {
  if (!store.activeFolder) return
  editorMode.value = 'create-bookmark'
  title.value = ''
  url.value = ''
}

function openCreateFolder(): void {
  if (!store.activeFolder) return
  editorMode.value = 'create-folder'
  title.value = ''
}

function openEdit(node: BookmarkNodeView): void {
  editingNode.value = node
  editorMode.value = 'edit'
  title.value = node.title
  url.value = node.url ?? ''
}

function openMove(node: BookmarkNodeView): void {
  editingNode.value = node
  editorMode.value = 'move'
  targetFolderId.value = node.parentId ?? moveTargets.value[0]?.id ?? ''
}

function openDelete(node: BookmarkNodeView): void {
  editingNode.value = node
  editorMode.value = 'delete'
}

async function submitEditor(): Promise<void> {
  dialogError.value = ''
  try {
    if (editorMode.value === 'create-bookmark') {
      await store.createBookmark(title.value, url.value)
    } else if (editorMode.value === 'create-folder') {
      await store.createFolder(title.value)
    } else if (editorMode.value === 'edit' && editingNode.value) {
      await store.updateNode(editingNode.value, title.value, url.value)
    } else if (editorMode.value === 'move' && editingNode.value) {
      await store.moveNode(editingNode.value, targetFolderId.value)
    } else if (editorMode.value === 'delete' && editingNode.value) {
      await store.deleteNode(editingNode.value)
    }
    closeEditor()
  } catch (cause) {
    dialogError.value = cause instanceof Error ? cause.message : '操作失败'
  }
}
</script>

<template>
  <section class="view-content">
    <header class="page-header">
      <div>
        <p>浏览器原生数据</p>
        <h1>书签管理</h1>
      </div>
      <div class="header-actions">
        <button class="ghost-button" :disabled="store.loading || store.mutating" @click="store.refresh">刷新</button>
        <button class="ghost-button" :disabled="store.mutating || !store.activeFolder" @click="openCreateFolder">新建文件夹</button>
        <button class="primary-button" :disabled="store.mutating || !store.activeFolder" @click="openCreateBookmark">添加书签</button>
      </div>
    </header>

    <section class="toolbar">
      <input v-model="store.query" class="input" placeholder="搜索全部书签、文件夹或网址" />
      <span>{{ store.visibleItems.length }} 项</span>
    </section>

    <p v-if="store.error" class="error-banner">{{ store.error }}</p>

    <div v-if="store.loading" class="empty">正在读取浏览器书签…</div>
    <section v-else class="bookmark-layout">
      <aside class="folder-panel surface">
        <header>
          <strong>文件夹</strong>
          <span>{{ store.folders.length }}</span>
        </header>
        <div class="folder-list">
          <button
            v-for="folder in store.folders"
            :key="folder.id"
            class="folder-row"
            :class="{ active: store.activeFolderId === folder.id }"
            :style="{ paddingLeft: `${12 + folder.depth * 14}px` }"
            @click="store.selectFolder(folder.id)"
          >
            <span>▸</span>
            <span>{{ folderTitle(folder) }}</span>
          </button>
        </div>
      </aside>

      <section class="items-panel surface">
        <header class="items-header">
          <div>
            <strong>{{ store.query ? '搜索结果' : folderTitle(store.activeFolder) }}</strong>
            <p>{{ store.query ? '在全部书签中检索' : '显示当前文件夹中的直接子项' }}</p>
          </div>
        </header>

        <div v-if="store.visibleItems.length === 0" class="empty small">当前没有书签</div>
        <div v-else class="bookmark-list">
          <article
            v-for="node in store.visibleItems"
            :key="node.id"
            class="bookmark-row"
            @dblclick="store.openNode(node)"
          >
            <button class="node-main" @click="store.openNode(node)">
              <span class="node-icon">{{ node.url ? '↗' : '▸' }}</span>
              <span class="node-copy">
                <strong>{{ node.title || (node.url ? '未命名书签' : '未命名文件夹') }}</strong>
                <small>{{ node.url || `${node.children.length} 个直接子项` }}</small>
              </span>
            </button>
            <div class="row-actions">
              <button @click.stop="openEdit(node)">编辑</button>
              <button @click.stop="openMove(node)">移动</button>
              <button class="danger-link" @click.stop="openDelete(node)">删除</button>
            </div>
          </article>
        </div>
      </section>
    </section>

    <div v-if="editorMode" class="dialog-backdrop" @click.self="closeEditor">
      <section class="dialog surface" role="dialog" aria-modal="true">
        <template v-if="editorMode === 'create-bookmark'">
          <h2>添加书签</h2>
          <p>保存到“{{ folderTitle(store.activeFolder) }}”。</p>
          <label>名称<input v-model="title" class="input" placeholder="可留空，将使用域名" /></label>
          <label>网址<input v-model="url" class="input" placeholder="https://example.com" /></label>
        </template>

        <template v-else-if="editorMode === 'create-folder'">
          <h2>新建文件夹</h2>
          <p>创建在“{{ folderTitle(store.activeFolder) }}”中。</p>
          <label>名称<input v-model="title" class="input" autofocus /></label>
        </template>

        <template v-else-if="editorMode === 'edit' && editingNode">
          <h2>编辑{{ editingNode.url ? '书签' : '文件夹' }}</h2>
          <label>名称<input v-model="title" class="input" /></label>
          <label v-if="editingNode.url">网址<input v-model="url" class="input" /></label>
        </template>

        <template v-else-if="editorMode === 'move' && editingNode">
          <h2>移动“{{ editingNode.title }}”</h2>
          <label>
            目标文件夹
            <select v-model="targetFolderId" class="input">
              <option v-for="folder in moveTargets" :key="folder.id" :value="folder.id">
                {{ '　'.repeat(folder.depth) }}{{ folderTitle(folder) }}
              </option>
            </select>
          </label>
        </template>

        <template v-else-if="editorMode === 'delete' && editingNode">
          <h2>确认删除</h2>
          <p>
            将删除“{{ editingNode.title || '未命名项目' }}”
            <template v-if="!editingNode.url">及其中的全部内容</template>。该操作会直接修改浏览器原生书签。
          </p>
        </template>

        <p v-if="dialogError" class="dialog-error">{{ dialogError }}</p>
        <footer>
          <button class="ghost-button" :disabled="store.mutating" @click="closeEditor">取消</button>
          <button
            :class="editorMode === 'delete' ? 'danger-button' : 'primary-button'"
            :disabled="store.mutating || (editorMode === 'move' && !targetFolderId)"
            @click="submitEditor"
          >
            {{ store.mutating ? '处理中…' : editorMode === 'delete' ? '确认删除' : '保存' }}
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.view-content { width: min(1280px, 100%); margin: 0 auto; padding: 32px; }
.page-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 22px; }
.page-header p, .items-header p, .dialog p { margin: 0; color: var(--muted); }
h1 { margin: 2px 0 0; font-size: 32px; }
.header-actions, .row-actions, .dialog footer { display: flex; gap: 8px; }
.toolbar { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
.toolbar .input { flex: 1; }
.toolbar span { color: var(--muted); white-space: nowrap; }
.bookmark-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 16px; min-height: 560px; }
.folder-panel, .items-panel { overflow: hidden; }
.folder-panel > header, .items-header { min-height: 64px; padding: 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line); }
.folder-panel > header span { color: var(--muted); }
.folder-list { max-height: 650px; overflow: auto; padding: 8px; }
.folder-row { width: 100%; display: flex; gap: 8px; align-items: center; border: 0; border-radius: 10px; padding-block: 9px; padding-right: 10px; background: transparent; color: var(--text); text-align: left; }
.folder-row:hover, .folder-row.active { background: var(--primary-soft); }
.folder-row span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.items-header { justify-content: flex-start; }
.items-header div { display: grid; gap: 3px; }
.bookmark-list { display: grid; }
.bookmark-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.bookmark-row:last-child { border-bottom: 0; }
.bookmark-row:hover { background: var(--primary-soft); }
.node-main { min-width: 0; border: 0; background: transparent; color: var(--text); display: flex; align-items: center; gap: 12px; text-align: left; }
.node-icon { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 9px; background: var(--primary-soft); color: var(--primary); }
.node-copy { min-width: 0; display: grid; gap: 3px; }
.node-copy strong, .node-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-copy small { color: var(--muted); }
.row-actions button { border: 0; background: transparent; color: var(--muted); padding: 8px; }
.row-actions .danger-link { color: var(--danger); }
.empty { padding: 80px 0; text-align: center; color: var(--muted); }
.empty.small { padding: 50px 0; }
.error-banner, .dialog-error { padding: 10px 14px; border-radius: 12px; background: rgba(217, 45, 32, 0.12); color: var(--danger); }
.dialog-backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 20px; background: rgba(0, 0, 0, 0.42); }
.dialog { width: min(480px, 100%); padding: 22px; display: grid; gap: 16px; background: var(--surface-strong); }
.dialog h2 { margin: 0; }
.dialog label { display: grid; gap: 7px; color: var(--muted); }
.dialog footer { justify-content: flex-end; }
@media (max-width: 840px) {
  .view-content { padding: 18px; }
  .page-header { align-items: flex-start; flex-direction: column; }
  .header-actions { flex-wrap: wrap; }
  .bookmark-layout { grid-template-columns: 1fr; }
  .folder-panel { max-height: 260px; }
}
@media (max-width: 620px) {
  .bookmark-row { grid-template-columns: 1fr; }
  .row-actions { padding-left: 40px; }
}
</style>

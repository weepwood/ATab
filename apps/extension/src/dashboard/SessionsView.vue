<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import type { SessionRecord } from '@/shared/domain'
import { sessionExportFileName } from '@/shared/sessions'

const store = useSessionsStore()
const fileInput = ref<HTMLInputElement | null>(null)

type DialogMode = 'save' | 'rename' | 'delete'

const dialogMode = ref<DialogMode | null>(null)
const selectedSession = ref<SessionRecord | null>(null)
const sessionName = ref('')
const saveScope = ref<'current' | 'all'>('current')
const dialogError = ref('')

onMounted(() => void store.refresh())

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function openSave(scope: 'current' | 'all'): void {
  saveScope.value = scope
  sessionName.value = ''
  selectedSession.value = null
  dialogMode.value = 'save'
}

function openRename(session: SessionRecord): void {
  selectedSession.value = session
  sessionName.value = session.name
  dialogMode.value = 'rename'
}

function openDelete(session: SessionRecord): void {
  selectedSession.value = session
  dialogMode.value = 'delete'
}

function closeDialog(): void {
  dialogMode.value = null
  selectedSession.value = null
  sessionName.value = ''
  dialogError.value = ''
}

async function submitDialog(): Promise<void> {
  dialogError.value = ''
  try {
    if (dialogMode.value === 'save') {
      await store.save(saveScope.value, sessionName.value)
    } else if (dialogMode.value === 'rename' && selectedSession.value) {
      await store.rename(selectedSession.value, sessionName.value)
    } else if (dialogMode.value === 'delete' && selectedSession.value) {
      await store.remove(selectedSession.value)
    }
    closeDialog()
  } catch (cause) {
    dialogError.value = cause instanceof Error ? cause.message : '操作失败'
  }
}

async function restore(session: SessionRecord): Promise<void> {
  await store.restore(session)
}

function exportSession(session: SessionRecord): void {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = sessionExportFileName(session)
  anchor.click()
  URL.revokeObjectURL(url)
}

async function importSession(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    await store.importFromJson(await file.text())
  } catch {
    // 错误由 store.error 展示。
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <section class="view-content">
    <header class="page-header">
      <div>
        <p>窗口与任务现场</p>
        <h1>浏览会话</h1>
      </div>
      <div class="header-actions">
        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importSession" />
        <button class="ghost-button" @click="fileInput?.click()">导入 JSON</button>
        <button class="ghost-button" @click="openSave('current')">保存当前窗口</button>
        <button class="primary-button" @click="openSave('all')">保存全部窗口</button>
      </div>
    </header>

    <section class="snapshot-note surface">
      <div>
        <strong>自动快照已启用</strong>
        <p>每 30 分钟保存一次全部普通窗口，只保留最近 10 份，不覆盖当前窗口。</p>
      </div>
      <button class="ghost-button" @click="store.refresh">刷新列表</button>
    </section>

    <p v-if="store.error" class="error-banner">{{ store.error }}</p>
    <p v-if="store.lastRestore" class="result-banner">
      已新建 {{ store.lastRestore.createdWindows }} 个窗口，恢复 {{ store.lastRestore.restoredTabs }} 个标签，跳过 {{ store.lastRestore.skippedTabs }} 个标签。
    </p>

    <div v-if="store.loading" class="empty">正在读取会话…</div>
    <template v-else>
      <section class="session-section">
        <header>
          <div>
            <h2>手动保存</h2>
            <p>用于长期保留项目、学习和任务现场。</p>
          </div>
          <span>{{ store.manualSessions.length }}</span>
        </header>
        <div v-if="store.manualSessions.length === 0" class="empty small">还没有手动会话</div>
        <div v-else class="session-grid">
          <article v-for="session in store.manualSessions" :key="session.id" class="session-card surface">
            <div class="session-title">
              <span class="kind-badge">手动</span>
              <strong>{{ session.name }}</strong>
            </div>
            <p>{{ session.windows.length }} 个窗口 · {{ session.tabCount }} 个标签</p>
            <small>更新于 {{ formatTime(session.updatedAt) }}</small>
            <footer>
              <button class="primary-button" :disabled="store.mutating" @click="restore(session)">恢复</button>
              <button class="ghost-button" @click="exportSession(session)">导出</button>
              <button class="ghost-button" @click="openRename(session)">重命名</button>
              <button class="danger-button" @click="openDelete(session)">删除</button>
            </footer>
          </article>
        </div>
      </section>

      <section class="session-section">
        <header>
          <div>
            <h2>自动快照</h2>
            <p>用于浏览器崩溃、误关窗口或临时回退。</p>
          </div>
          <span>{{ store.autoSessions.length }}/10</span>
        </header>
        <div v-if="store.autoSessions.length === 0" class="empty small">自动快照将在后台生成</div>
        <div v-else class="session-grid compact">
          <article v-for="session in store.autoSessions" :key="session.id" class="session-card surface">
            <div class="session-title">
              <span class="kind-badge muted">自动</span>
              <strong>{{ session.name }}</strong>
            </div>
            <p>{{ session.windows.length }} 个窗口 · {{ session.tabCount }} 个标签</p>
            <small>{{ formatTime(session.updatedAt) }}</small>
            <footer>
              <button class="primary-button" :disabled="store.mutating" @click="restore(session)">恢复</button>
              <button class="ghost-button" @click="exportSession(session)">导出</button>
              <button class="danger-button" @click="openDelete(session)">删除</button>
            </footer>
          </article>
        </div>
      </section>
    </template>

    <div v-if="dialogMode" class="dialog-backdrop" @click.self="closeDialog">
      <section class="dialog surface" role="dialog" aria-modal="true">
        <template v-if="dialogMode === 'save'">
          <h2>{{ saveScope === 'current' ? '保存当前窗口' : '保存全部窗口' }}</h2>
          <p>仅保存 HTTP、HTTPS 和本地文件页面，浏览器内部页面会被跳过。</p>
          <label>会话名称<input v-model="sessionName" class="input" placeholder="留空将按时间自动命名" /></label>
        </template>

        <template v-else-if="dialogMode === 'rename' && selectedSession">
          <h2>重命名会话</h2>
          <label>会话名称<input v-model="sessionName" class="input" /></label>
        </template>

        <template v-else-if="dialogMode === 'delete' && selectedSession">
          <h2>删除会话</h2>
          <p>将删除“{{ selectedSession.name }}”的本地快照，不会关闭当前标签页，也不会删除书签。</p>
        </template>

        <p v-if="dialogError" class="dialog-error">{{ dialogError }}</p>
        <footer>
          <button class="ghost-button" :disabled="store.mutating" @click="closeDialog">取消</button>
          <button
            :class="dialogMode === 'delete' ? 'danger-button' : 'primary-button'"
            :disabled="store.mutating"
            @click="submitDialog"
          >
            {{ store.mutating ? '处理中…' : dialogMode === 'delete' ? '确认删除' : '保存' }}
          </button>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.view-content { width: min(1240px, 100%); margin: 0 auto; padding: 32px; }
.page-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 22px; }
.page-header p, .snapshot-note p, .session-section header p, .dialog p { margin: 0; color: var(--muted); }
h1 { margin: 2px 0 0; font-size: 32px; }
h2 { margin: 0; }
.header-actions, .session-card footer, .dialog footer { display: flex; gap: 8px; flex-wrap: wrap; }
.snapshot-note { padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
.snapshot-note div { display: grid; gap: 4px; }
.session-section { display: grid; gap: 14px; margin-bottom: 28px; }
.session-section > header { display: flex; align-items: end; justify-content: space-between; }
.session-section > header div { display: grid; gap: 4px; }
.session-section > header span { color: var(--muted); }
.session-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
.session-grid.compact { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.session-card { min-width: 0; padding: 18px; display: grid; gap: 10px; }
.session-title { min-width: 0; display: flex; align-items: center; gap: 9px; }
.session-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kind-badge { padding: 4px 8px; border-radius: 999px; background: var(--primary-soft); color: var(--primary); font-size: 12px; }
.kind-badge.muted { color: var(--muted); }
.session-card p, .session-card small { margin: 0; color: var(--muted); }
.session-card footer { margin-top: 6px; }
.session-card footer button { flex: 1; white-space: nowrap; }
.empty { padding: 80px 0; text-align: center; color: var(--muted); }
.empty.small { padding: 38px 0; border: 1px dashed var(--line); border-radius: 16px; }
.error-banner, .dialog-error { padding: 10px 14px; border-radius: 12px; background: rgba(217, 45, 32, 0.12); color: var(--danger); }
.result-banner { padding: 10px 14px; border-radius: 12px; background: var(--primary-soft); color: var(--text); }
.dialog-backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 20px; background: rgba(0, 0, 0, 0.42); }
.dialog { width: min(480px, 100%); padding: 22px; display: grid; gap: 16px; background: var(--surface-strong); }
.dialog h2 { margin: 0; }
.dialog label { display: grid; gap: 7px; color: var(--muted); }
.dialog footer { justify-content: flex-end; }
@media (max-width: 760px) {
  .view-content { padding: 18px; }
  .page-header, .snapshot-note { align-items: flex-start; flex-direction: column; }
}
</style>

<script setup lang="ts">
import { ref } from 'vue'
import TabsView from './TabsView.vue'
import SessionsView from './SessionsView.vue'
import BookmarksView from './BookmarksView.vue'
import CloudBookmarksView from './CloudBookmarksView.vue'
import HistoryView from './HistoryView.vue'
import SyncView from './SyncView.vue'

type WorkspaceView = 'tabs' | 'sessions' | 'bookmarks' | 'cloud-bookmarks' | 'history' | 'sync'

const activeView = ref<WorkspaceView>('tabs')
const optionsUrl = chrome.runtime.getURL('src/options/index.html')
</script>

<template>
  <main class="layout">
    <aside class="sidebar">
      <div class="brand">A</div>
      <nav>
        <button :class="{ active: activeView === 'tabs' }" @click="activeView = 'tabs'">标签页</button>
        <button :class="{ active: activeView === 'sessions' }" @click="activeView = 'sessions'">会话</button>
        <button :class="{ active: activeView === 'bookmarks' }" @click="activeView = 'bookmarks'">书签</button>
        <button :class="{ active: activeView === 'cloud-bookmarks' }" @click="activeView = 'cloud-bookmarks'">云收藏</button>
        <button :class="{ active: activeView === 'history' }" @click="activeView = 'history'">历史</button>
        <button :class="{ active: activeView === 'sync' }" @click="activeView = 'sync'">同步</button>
      </nav>
      <a :href="optionsUrl">设置</a>
    </aside>

    <TabsView v-if="activeView === 'tabs'" />
    <SessionsView v-else-if="activeView === 'sessions'" />
    <BookmarksView v-else-if="activeView === 'bookmarks'" />
    <CloudBookmarksView v-else-if="activeView === 'cloud-bookmarks'" />
    <HistoryView v-else-if="activeView === 'history'" />
    <SyncView v-else />
  </main>
</template>

<style scoped>
.layout { min-height: 100vh; display: grid; grid-template-columns: 92px minmax(0, 1fr); }
.sidebar { position: sticky; top: 0; height: 100vh; border-right: 1px solid var(--line); display: flex; flex-direction: column; align-items: center; padding: 22px 10px; gap: 26px; }
.brand { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 14px; background: var(--primary); color: white; font-weight: 800; font-size: 20px; }
nav { display: grid; gap: 8px; width: 100%; }
nav button, .sidebar a { border: 0; background: transparent; color: var(--muted); border-radius: 12px; padding: 10px 4px; text-align: center; text-decoration: none; }
nav button.active { background: var(--primary-soft); color: var(--primary); }
.sidebar a { margin-top: auto; }
@media (max-width: 760px) {
  .layout { grid-template-columns: 1fr; }
  .sidebar { position: sticky; z-index: 10; width: 100%; height: auto; padding: 8px 12px; flex-direction: row; background: var(--surface-strong); }
  .brand { width: 36px; height: 36px; border-radius: 11px; }
  nav { display: flex; width: auto; overflow-x: auto; }
  nav button { min-width: 60px; }
  .sidebar a { margin: 0 0 0 auto; }
}
</style>

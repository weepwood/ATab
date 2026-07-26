<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useTabsStore } from '@/stores/tabs'
import { browserGateway } from '@/shared/browser'
import type { TabView } from '@/shared/domain'

const store = useTabsStore()
const aiCommand = ref('把 GitHub 页面整理到开发分组')
const optionsUrl = chrome.runtime.getURL('src/options/index.html')

onMounted(() => void store.refresh())

async function focus(tab: TabView): Promise<void> {
  await browserGateway.focusTab(tab.id)
}

async function togglePinned(tab: TabView): Promise<void> {
  await browserGateway.togglePinned(tab)
  await store.refresh()
}

async function toggleMuted(tab: TabView): Promise<void> {
  await browserGateway.toggleMuted(tab)
  await store.refresh()
}
</script>

<template>
  <main class="layout">
    <aside class="sidebar">
      <div class="brand">A</div>
      <nav>
        <button class="active">标签页</button>
        <button disabled>会话</button>
        <button disabled>书签</button>
        <button disabled>历史</button>
      </nav>
      <a :href="optionsUrl">设置</a>
    </aside>

    <section class="content">
      <header>
        <div>
          <p>浏览器工作空间</p>
          <h1>标签页工作台</h1>
        </div>
        <button class="ghost-button" @click="store.refresh">刷新</button>
      </header>

      <section class="ai-panel surface">
        <div>
          <strong>AI 整理助手</strong>
          <p>当前使用本地规则生成操作计划，真实模型接入后仍沿用相同确认链路。</p>
        </div>
        <div class="ai-input">
          <input v-model="aiCommand" class="input" @keyup.enter="store.createPlan(aiCommand)" />
          <button class="primary-button" @click="store.createPlan(aiCommand)">生成计划</button>
        </div>
        <div v-if="store.currentPlan" class="plan">
          <div>
            <strong>{{ store.currentPlan.summary }}</strong>
            <p>{{ store.currentPlan.reason }}</p>
          </div>
          <div class="plan-actions">
            <button class="ghost-button" @click="store.currentPlan = null">取消</button>
            <button v-if="store.currentPlan.operations.length" class="primary-button" @click="store.executeCurrentPlan">确认执行</button>
          </div>
        </div>
      </section>

      <section class="toolbar">
        <input v-model="store.query" class="input" placeholder="搜索标题或网址" />
        <button class="ghost-button" @click="store.selectAllVisible">全选结果</button>
        <button v-if="store.selectedIds.length" class="danger-button" @click="store.closeSelected">
          关闭所选（{{ store.selectedIds.length }}）
        </button>
      </section>

      <div v-if="store.loading" class="empty">正在读取标签页…</div>
      <div v-else-if="store.groupedTabs.length === 0" class="empty">没有匹配的标签页</div>
      <section v-else class="groups">
        <article v-for="[domain, tabs] in store.groupedTabs" :key="domain" class="group surface">
          <header class="group-header">
            <strong>{{ domain }}</strong>
            <span>{{ tabs.length }} 个标签</span>
          </header>
          <div class="tab-list">
            <div v-for="tab in tabs" :key="tab.id" class="tab-row" :class="{ selected: store.selectedIds.includes(tab.id) }">
              <input type="checkbox" :checked="store.selectedIds.includes(tab.id)" @change="store.toggleSelected(tab.id)" />
              <img v-if="tab.faviconUrl" :src="tab.faviconUrl" alt="" />
              <span v-else class="fallback-icon">●</span>
              <button class="tab-main" @click="focus(tab)">
                <strong>{{ tab.title }}</strong>
                <small>{{ tab.url }}</small>
              </button>
              <button class="row-action" :title="tab.pinned ? '取消固定' : '固定'" @click="togglePinned(tab)">{{ tab.pinned ? '已固定' : '固定' }}</button>
              <button class="row-action" :title="tab.muted ? '取消静音' : '静音'" @click="toggleMuted(tab)">{{ tab.muted ? '已静音' : '静音' }}</button>
            </div>
          </div>
        </article>
      </section>
    </section>
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
.content { width: min(1240px, 100%); margin: 0 auto; padding: 32px; }
.content > header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; }
h1 { margin: 2px 0 0; font-size: 32px; }
header p, .ai-panel p, .plan p { margin: 0; color: var(--muted); }
.ai-panel { padding: 20px; display: grid; gap: 16px; }
.ai-input { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
.plan { border-top: 1px solid var(--line); padding-top: 16px; display: flex; justify-content: space-between; gap: 20px; }
.plan-actions { display: flex; gap: 8px; align-items: center; }
.toolbar { display: flex; gap: 10px; margin: 18px 0; }
.toolbar .input { flex: 1; }
.groups { display: grid; gap: 14px; }
.group { overflow: hidden; }
.group-header { padding: 14px 18px; display: flex; justify-content: space-between; border-bottom: 1px solid var(--line); }
.group-header span { color: var(--muted); }
.tab-row { display: grid; grid-template-columns: 24px 28px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.tab-row:last-child { border-bottom: 0; }
.tab-row.selected { background: var(--primary-soft); }
.tab-row img { width: 20px; height: 20px; }
.fallback-icon { color: var(--muted); }
.tab-main { min-width: 0; border: 0; background: transparent; color: var(--text); text-align: left; display: grid; gap: 3px; }
.tab-main strong, .tab-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab-main small { color: var(--muted); }
.row-action { border: 0; background: transparent; color: var(--muted); padding: 7px; }
.empty { padding: 80px 0; text-align: center; color: var(--muted); }
@media (max-width: 760px) { .layout { grid-template-columns: 1fr; } .sidebar { display: none; } .content { padding: 18px; } .toolbar { flex-wrap: wrap; } .ai-input { grid-template-columns: 1fr; } .tab-row { grid-template-columns: 22px 24px minmax(0, 1fr); } .row-action { display: none; } }
</style>

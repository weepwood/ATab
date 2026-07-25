<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useTabsStore } from '@/stores/tabs'
import { browserGateway } from '@/shared/browser'
import type { AiOperation, TabView } from '@/shared/domain'

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

function operationLabel(operation: AiOperation): string {
  if (operation.type === 'CREATE_GROUP') return `创建“${operation.name}”分组`
  if (operation.type === 'CLOSE_TABS') return '关闭标签页'
  return '静音标签页'
}

function riskLabel(risk: 'read-only' | 'reversible' | 'destructive'): string {
  if (risk === 'destructive') return '删除性操作'
  if (risk === 'reversible') return '可逆操作'
  return '只读建议'
}
</script>

<template>
  <section class="view-content">
    <header class="page-header">
      <div>
        <p>浏览器工作空间</p>
        <h1>标签页工作台</h1>
      </div>
      <button class="ghost-button" @click="store.refresh">刷新</button>
    </header>

    <section class="ai-panel surface">
      <div class="ai-heading">
        <div>
          <strong>AI 整理助手</strong>
          <p>根据设置使用本地规则或服务端模型；所有写操作仍需预览和确认。</p>
        </div>
        <a :href="optionsUrl">Provider 设置</a>
      </div>
      <div class="ai-input">
        <input
          v-model="aiCommand"
          class="input"
          :disabled="store.planning || store.executing"
          @keyup.enter="store.createPlan(aiCommand)"
        />
        <button
          class="primary-button"
          :disabled="store.planning || store.executing"
          @click="store.createPlan(aiCommand)"
        >
          {{ store.planning ? '正在生成…' : '生成计划' }}
        </button>
      </div>
      <p v-if="store.planError" class="plan-error">{{ store.planError }}</p>
      <div v-if="store.currentPlan" class="plan">
        <div class="plan-copy">
          <div class="plan-title">
            <strong>{{ store.currentPlan.summary }}</strong>
            <span :class="['risk-badge', store.currentPlan.risk]">
              {{ riskLabel(store.currentPlan.risk) }}
            </span>
          </div>
          <p>{{ store.currentPlan.reason }}</p>
          <ul v-if="store.currentPlan.operations.length">
            <li v-for="(operation, index) in store.currentPlan.operations" :key="index">
              {{ operationLabel(operation) }} · {{ operation.tabIds.length }} 个标签
            </li>
          </ul>
          <p v-else class="no-operation">该计划不会修改浏览器数据。</p>
        </div>
        <div class="plan-actions">
          <button class="ghost-button" :disabled="store.executing" @click="store.cancelPlan">关闭</button>
          <button
            v-if="store.currentPlan.operations.length"
            :class="store.currentPlan.risk === 'destructive' ? 'danger-button' : 'primary-button'"
            :disabled="store.executing"
            @click="store.executeCurrentPlan"
          >
            {{ store.executing ? '正在执行…' : '确认执行' }}
          </button>
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
          <div
            v-for="tab in tabs"
            :key="tab.id"
            class="tab-row"
            :class="{ selected: store.selectedIds.includes(tab.id) }"
          >
            <input
              type="checkbox"
              :checked="store.selectedIds.includes(tab.id)"
              @change="store.toggleSelected(tab.id)"
            />
            <img v-if="tab.faviconUrl" :src="tab.faviconUrl" alt="" />
            <span v-else class="fallback-icon">●</span>
            <button class="tab-main" @click="focus(tab)">
              <strong>{{ tab.title }}</strong>
              <small>{{ tab.url }}</small>
            </button>
            <button
              class="row-action"
              :title="tab.pinned ? '取消固定' : '固定'"
              @click="togglePinned(tab)"
            >
              {{ tab.pinned ? '已固定' : '固定' }}
            </button>
            <button
              class="row-action"
              :title="tab.muted ? '取消静音' : '静音'"
              @click="toggleMuted(tab)"
            >
              {{ tab.muted ? '已静音' : '静音' }}
            </button>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.view-content { width: min(1240px, 100%); margin: 0 auto; padding: 32px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; }
h1 { margin: 2px 0 0; font-size: 32px; }
.page-header p, .ai-panel p, .plan p { margin: 0; color: var(--muted); }
.ai-panel { padding: 20px; display: grid; gap: 16px; }
.ai-heading { display: flex; justify-content: space-between; gap: 20px; align-items: start; }
.ai-heading > div { display: grid; gap: 4px; }
.ai-heading a { color: var(--primary); text-decoration: none; white-space: nowrap; }
.ai-input { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
.plan { border-top: 1px solid var(--line); padding-top: 16px; display: flex; justify-content: space-between; gap: 20px; }
.plan-copy { display: grid; gap: 8px; }
.plan-title { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.risk-badge { padding: 4px 8px; border-radius: 999px; font-size: 12px; background: var(--primary-soft); }
.risk-badge.destructive { color: var(--danger); background: rgba(217, 45, 32, 0.12); }
.risk-badge.reversible { color: var(--primary); }
.risk-badge.read-only { color: var(--muted); }
.plan ul { margin: 2px 0 0; padding-left: 20px; color: var(--muted); }
.plan li + li { margin-top: 4px; }
.plan-actions { display: flex; gap: 8px; align-items: center; }
.plan-error { padding: 10px 12px; border-radius: 12px; color: var(--danger) !important; background: rgba(217, 45, 32, 0.12); }
.no-operation { font-style: italic; }
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
button:disabled, input:disabled { cursor: not-allowed; opacity: 0.65; }
@media (max-width: 760px) {
  .view-content { padding: 18px; }
  .toolbar { flex-wrap: wrap; }
  .ai-heading, .plan { flex-direction: column; }
  .ai-input { grid-template-columns: 1fr; }
  .tab-row { grid-template-columns: 22px 24px minmax(0, 1fr); }
  .row-action { display: none; }
}
</style>

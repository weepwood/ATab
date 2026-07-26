<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useTabsStore } from '@/stores/tabs'
import { browserGateway } from '@/shared/browser'
import type { TabView } from '@/shared/domain'

const store = useTabsStore()
const aiCommand = ref('把 GitHub 页面整理到开发分组')

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
  <section class="view-content">
    <header class="page-header">
      <div>
        <p>浏览器工作空间</p>
        <h1>标签页工作台</h1>
      </div>
      <button class="ghost-button" :disabled="store.loading || store.executing" @click="store.refresh">刷新</button>
    </header>

    <section class="ai-panel surface">
      <div>
        <strong>AI 整理助手</strong>
        <p>模型只生成结构化计划；扩展重新计算风险，并在执行前复核目标 URL、窗口和 5 分钟有效期。</p>
      </div>
      <div class="ai-input">
        <input v-model="aiCommand" class="input" :disabled="store.planning || store.executing" @keyup.enter="store.createPlan(aiCommand)" />
        <button class="primary-button" :disabled="store.planning || store.executing" @click="store.createPlan(aiCommand)">
          {{ store.planning ? '生成中…' : '生成计划' }}
        </button>
      </div>
      <p v-if="store.planError" class="plan-error">{{ store.planError }}</p>
      <div v-if="store.currentPlan" class="plan">
        <div>
          <div class="plan-heading">
            <strong>{{ store.currentPlan.summary }}</strong>
            <span :class="`risk ${store.currentPlan.risk}`">
              {{ store.currentPlan.risk === 'destructive' ? '删除预览' : store.currentPlan.risk === 'reversible' ? '可逆修改' : '只读' }}
            </span>
          </div>
          <p>{{ store.currentPlan.reason }}</p>
          <small v-if="store.currentPlan.risk === 'destructive'">删除计划暂不执行，等待可恢复记录与撤销入口完成。</small>
          <small v-else>计划有效期 5 分钟；标签网址或窗口变化后必须重新生成。</small>
        </div>
        <div class="plan-actions">
          <button class="ghost-button" :disabled="store.executing" @click="store.cancelPlan()">取消</button>
          <button
            v-if="store.currentPlan.operations.length"
            :class="store.currentPlan.risk === 'destructive' ? 'danger-button' : 'primary-button'"
            :disabled="store.executing || store.currentPlan.risk === 'destructive'"
            @click="store.executeCurrentPlan"
          >
            {{ store.currentPlan.risk === 'destructive' ? '暂未开放' : store.executing ? '执行中…' : '确认执行' }}
          </button>
        </div>
      </div>
    </section>

    <section class="toolbar">
      <input v-model="store.query" class="input" placeholder="搜索标题或网址" />
      <button class="ghost-button" @click="store.selectAllVisible">全选结果</button>
      <button v-if="store.selectedIds.length" class="danger-button" @click="store.closeSelected">关闭所选（{{ store.selectedIds.length }}）</button>
    </section>

    <div v-if="store.loading" class="empty">正在读取标签页…</div>
    <div v-else-if="store.groupedTabs.length === 0" class="empty">没有匹配的标签页</div>
    <section v-else class="groups">
      <article v-for="[domain, tabs] in store.groupedTabs" :key="domain" class="group surface">
        <header class="group-header"><strong>{{ domain }}</strong><span>{{ tabs.length }} 个标签</span></header>
        <div class="tab-list">
          <div v-for="tab in tabs" :key="tab.id" class="tab-row" :class="{ selected: store.selectedIds.includes(tab.id) }">
            <input type="checkbox" :checked="store.selectedIds.includes(tab.id)" @change="store.toggleSelected(tab.id)" />
            <img v-if="tab.faviconUrl" :src="tab.faviconUrl" alt="" />
            <span v-else class="fallback-icon">●</span>
            <button class="tab-main" @click="focus(tab)"><strong>{{ tab.title }}</strong><small>{{ tab.url }}</small></button>
            <button class="row-action" @click="togglePinned(tab)">{{ tab.pinned ? '已固定' : '固定' }}</button>
            <button class="row-action" @click="toggleMuted(tab)">{{ tab.muted ? '已静音' : '静音' }}</button>
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
.ai-input { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
.plan { border-top: 1px solid var(--line); padding-top: 16px; display: flex; justify-content: space-between; gap: 20px; }
.plan-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.plan small { color: var(--muted); }
.plan-actions { display: flex; gap: 8px; align-items: center; }
.risk { padding: 3px 8px; border-radius: 999px; font-size: 12px; background: var(--primary-soft); }
.risk.destructive { color: var(--danger); background: rgba(217, 45, 32, 0.12); }
.plan-error { padding: 10px 12px; border-radius: 12px; background: rgba(217, 45, 32, 0.12); color: var(--danger) !important; }
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
button:disabled { cursor: not-allowed; opacity: 0.65; }
@media (max-width: 760px) {
  .view-content { padding: 18px; }
  .toolbar { flex-wrap: wrap; }
  .ai-input { grid-template-columns: 1fr; }
  .plan { align-items: flex-start; flex-direction: column; }
  .tab-row { grid-template-columns: 22px 24px minmax(0, 1fr); }
  .row-action { display: none; }
}
</style>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  getAiProviderSettings,
  hasAiEndpointPermission,
  requestAiEndpointPermission,
  saveAiProviderSettings,
  testAiEndpoint,
  type AiProviderSettings,
} from '@/shared/ai/provider'
import {
  signInWithPassword,
  signOutSyncAccount,
} from '@/shared/sync/auth'
import {
  getSyncQueueSummary,
  runSyncOnce,
  type SyncQueueSummary,
} from '@/shared/sync/client'
import {
  getSyncAuthSession,
  getSyncSettings,
  requestSyncHostPermissions,
  saveSyncSettings,
  type SyncAuthSession,
  type SyncSettings,
} from '@/shared/sync/settings'

const saved = ref(false)
const busy = ref(false)
const aiStatus = ref('')
const syncStatus = ref('')
const permissionGranted = ref(false)
const syncEmail = ref('')
const syncPassword = ref('')
const syncAuth = ref<SyncAuthSession | null>(null)
const syncSummary = reactive<SyncQueueSummary>({ pending: 0, conflicts: 0 })

const privacy = reactive({
  syncHistory: false,
  syncPageContent: false,
  allowAiPageReading: false,
})

const ai = reactive<AiProviderSettings>({
  mode: 'local',
  endpoint: 'http://127.0.0.1:8787',
  fallbackToLocal: true,
})

const sync = reactive<SyncSettings>({
  enabled: false,
  apiEndpoint: 'http://127.0.0.1:8787',
  supabaseUrl: '',
  supabaseAnonKey: '',
  deviceId: '',
  deviceName: '',
  platform: 'browser',
})

onMounted(async () => {
  const [value, aiSettings, syncSettings, auth, summary] = await Promise.all([
    chrome.storage.local.get('privacy'),
    getAiProviderSettings(),
    getSyncSettings(),
    getSyncAuthSession(),
    getSyncQueueSummary(),
  ])
  Object.assign(privacy, value.privacy ?? {})
  Object.assign(ai, aiSettings)
  Object.assign(sync, syncSettings)
  Object.assign(syncSummary, summary)
  syncAuth.value = auth
  syncEmail.value = auth?.email ?? ''
  await refreshPermissionState()
})

async function refreshPermissionState(): Promise<void> {
  if (ai.mode !== 'remote') {
    permissionGranted.value = false
    return
  }
  try {
    permissionGranted.value = await hasAiEndpointPermission(ai.endpoint)
  } catch {
    permissionGranted.value = false
  }
}

async function save(): Promise<void> {
  busy.value = true
  saved.value = false
  aiStatus.value = ''
  try {
    if (ai.mode === 'remote') {
      const granted = await requestAiEndpointPermission(ai.endpoint)
      if (!granted) throw new Error('未授予该 AI 服务地址的访问权限')
      permissionGranted.value = true
    }

    await Promise.all([
      chrome.storage.local.set({ privacy: { ...privacy } }),
      saveAiProviderSettings({ ...ai }),
    ])
    saved.value = true
    window.setTimeout(() => (saved.value = false), 1_600)
  } catch (cause) {
    aiStatus.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    busy.value = false
  }
}

async function testConnection(): Promise<void> {
  busy.value = true
  aiStatus.value = ''
  try {
    const granted = await requestAiEndpointPermission(ai.endpoint)
    if (!granted) throw new Error('未授予该 AI 服务地址的访问权限')
    permissionGranted.value = true
    const health = await testAiEndpoint(ai.endpoint)
    aiStatus.value = `连接成功：${health.provider}（${health.status}）`
  } catch (cause) {
    aiStatus.value = cause instanceof Error ? cause.message : '连接测试失败'
  } finally {
    busy.value = false
  }
}

async function saveSyncConfiguration(): Promise<void> {
  busy.value = true
  syncStatus.value = ''
  try {
    if (sync.enabled) {
      const granted = await requestSyncHostPermissions({ ...sync })
      if (!granted) throw new Error('未授予同步 API 或 Supabase 的来源权限')
    }
    await saveSyncSettings({ ...sync })
    syncStatus.value = sync.enabled ? '同步配置已保存' : '云同步已关闭，本地 Outbox 会继续保留变更'
  } catch (cause) {
    syncStatus.value = cause instanceof Error ? cause.message : '保存同步配置失败'
  } finally {
    busy.value = false
  }
}

async function loginSyncAccount(): Promise<void> {
  busy.value = true
  syncStatus.value = ''
  try {
    sync.enabled = true
    const granted = await requestSyncHostPermissions({ ...sync })
    if (!granted) throw new Error('未授予同步 API 或 Supabase 的来源权限')
    await saveSyncSettings({ ...sync })
    syncAuth.value = await signInWithPassword({ ...sync }, syncEmail.value, syncPassword.value)
    syncPassword.value = ''
    syncStatus.value = `已登录 ${syncAuth.value.email ?? syncAuth.value.userId}`
    await syncNow()
  } catch (cause) {
    syncStatus.value = cause instanceof Error ? cause.message : '登录失败'
  } finally {
    busy.value = false
  }
}

async function logoutSyncAccount(): Promise<void> {
  busy.value = true
  syncStatus.value = ''
  try {
    await signOutSyncAccount({ ...sync })
    syncAuth.value = null
    syncStatus.value = '已退出同步账号，本地数据和 Outbox 未删除'
  } catch (cause) {
    syncStatus.value = cause instanceof Error ? cause.message : '退出失败'
  } finally {
    busy.value = false
  }
}

async function syncNow(): Promise<void> {
  busy.value = true
  syncStatus.value = ''
  try {
    const result = await runSyncOnce()
    syncStatus.value = `同步完成：推送 ${result.pushed}，拉取 ${result.pulled}，冲突 ${result.pushConflicts + result.pullConflicts}`
    Object.assign(syncSummary, await getSyncQueueSummary())
  } catch (cause) {
    syncStatus.value = cause instanceof Error ? cause.message : '同步失败'
    Object.assign(syncSummary, await getSyncQueueSummary())
  } finally {
    busy.value = false
  }
}

function formatTime(value?: string): string {
  if (!value) return '尚未同步'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
</script>

<template>
  <main class="settings">
    <header>
      <p>ATab</p>
      <h1>隐私、AI 与同步设置</h1>
    </header>

    <section class="surface panel">
      <div class="section-heading">
        <strong>AI Provider</strong>
        <small>模型密钥只保存在服务端，浏览器扩展仅保存服务地址。</small>
      </div>

      <label class="field-row">
        <span>
          <strong>Provider 模式</strong>
          <small>本地规则不联网；远程模式把当前标签元数据发送到已授权的 ATab API。</small>
        </span>
        <select v-model="ai.mode" class="input compact" @change="refreshPermissionState">
          <option value="local">本地规则</option>
          <option value="remote">远程 AI API</option>
        </select>
      </label>

      <label v-if="ai.mode === 'remote'" class="field-row endpoint-row">
        <span>
          <strong>AI 服务地址</strong>
          <small>只会申请该域名的访问权限，不会自动获得所有网站权限。</small>
        </span>
        <div class="endpoint-control">
          <input v-model="ai.endpoint" class="input" placeholder="http://127.0.0.1:8787" @blur="refreshPermissionState" />
          <button class="ghost-button" :disabled="busy" @click.prevent="testConnection">测试连接</button>
        </div>
      </label>

      <label v-if="ai.mode === 'remote'" class="field-row">
        <span>
          <strong>远程失败时回退到本地规则</strong>
          <small>网络或模型服务不可用时，仍可处理重复标签、GitHub 分组和静音任务。</small>
        </span>
        <input v-model="ai.fallbackToLocal" type="checkbox" />
      </label>

      <div v-if="ai.mode === 'remote'" class="permission-status">
        <span :class="permissionGranted ? 'ok' : 'pending'">
          {{ permissionGranted ? '已授权当前服务来源' : '尚未授权当前服务来源' }}
        </span>
        <small>授权发生在保存或测试连接时，可在浏览器扩展权限页面撤销。</small>
      </div>

      <p v-if="aiStatus" class="status-message">{{ aiStatus }}</p>
    </section>

    <section class="surface panel">
      <div class="section-heading">
        <strong>云同步</strong>
        <small>当前同步手动会话；原生浏览器书签和自动快照仍保留在本地。</small>
      </div>

      <label class="field-row">
        <span>
          <strong>启用增量同步</strong>
          <small>启用后每 15 分钟同步一次，也可以手动执行。</small>
        </span>
        <input v-model="sync.enabled" type="checkbox" />
      </label>

      <label class="field-row endpoint-row">
        <span>
          <strong>ATab 同步 API</strong>
          <small>通常与 AI API 使用同一 Fastify 服务。</small>
        </span>
        <input v-model="sync.apiEndpoint" class="input" placeholder="http://127.0.0.1:8787" />
      </label>

      <label class="field-row endpoint-row">
        <span>
          <strong>Supabase 项目地址</strong>
          <small>用于用户登录和刷新会话，不经过 ATab API 转发密码。</small>
        </span>
        <input v-model="sync.supabaseUrl" class="input" placeholder="https://project.supabase.co" />
      </label>

      <label class="field-row endpoint-row">
        <span>
          <strong>Supabase anon key</strong>
          <small>这是客户端公开密钥；数据权限由用户 JWT 和 RLS 控制。</small>
        </span>
        <input v-model="sync.supabaseAnonKey" class="input" type="password" autocomplete="off" />
      </label>

      <label class="field-row endpoint-row">
        <span>
          <strong>设备名称</strong>
          <small>用于设备列表、审计和后续撤销。</small>
        </span>
        <input v-model="sync.deviceName" class="input" />
      </label>

      <div class="sync-actions">
        <button class="ghost-button" :disabled="busy" @click="saveSyncConfiguration">授权并保存同步配置</button>
      </div>

      <div class="sync-summary">
        <div><strong>{{ syncSummary.pending }}</strong><small>待推送</small></div>
        <div><strong>{{ syncSummary.conflicts }}</strong><small>待处理冲突</small></div>
        <div><strong>{{ formatTime(syncSummary.lastSyncAt) }}</strong><small>最近同步</small></div>
      </div>

      <template v-if="!syncAuth">
        <div class="login-grid">
          <label>邮箱<input v-model="syncEmail" class="input" type="email" autocomplete="username" /></label>
          <label>密码<input v-model="syncPassword" class="input" type="password" autocomplete="current-password" /></label>
          <button class="primary-button" :disabled="busy" @click="loginSyncAccount">登录并同步</button>
        </div>
      </template>
      <div v-else class="account-row">
        <div>
          <strong>{{ syncAuth.email ?? syncAuth.userId }}</strong>
          <small>设备 ID：{{ sync.deviceId }}</small>
        </div>
        <div class="sync-actions">
          <button class="primary-button" :disabled="busy || !sync.enabled" @click="syncNow">立即同步</button>
          <button class="ghost-button" :disabled="busy" @click="logoutSyncAccount">退出账号</button>
        </div>
      </div>

      <p v-if="syncStatus" class="status-message">{{ syncStatus }}</p>
      <p v-if="syncSummary.lastError" class="error-message">上次错误：{{ syncSummary.lastError }}</p>
    </section>

    <section class="surface panel">
      <div class="section-heading">
        <strong>数据权限</strong>
        <small>不同数据类型独立授权，不使用一个总开关隐式扩大范围。</small>
      </div>
      <label class="field-row">
        <span>
          <strong>同步浏览历史</strong>
          <small>默认关闭，当前版本尚未上传历史数据。</small>
        </span>
        <input v-model="privacy.syncHistory" type="checkbox" />
      </label>
      <label class="field-row">
        <span>
          <strong>同步网页正文</strong>
          <small>默认关闭；登录、支付、邮箱和内网页面仍应被禁止。</small>
        </span>
        <input v-model="privacy.syncPageContent" type="checkbox" />
      </label>
      <label class="field-row">
        <span>
          <strong>允许 AI 读取网页正文</strong>
          <small>当前 AI 计划只发送标签元数据，正文提取仍未启用。</small>
        </span>
        <input v-model="privacy.allowAiPageReading" type="checkbox" />
      </label>
    </section>

    <footer class="save-bar">
      <span v-if="saved">已保存</span>
      <button class="primary-button" :disabled="busy" @click="save">
        {{ busy ? '处理中…' : '保存 AI 与隐私设置' }}
      </button>
    </footer>
  </main>
</template>

<style scoped>
.settings { width: min(860px, calc(100% - 32px)); margin: 56px auto; display: grid; gap: 18px; }
header { margin-bottom: 4px; }
header p { color: var(--primary); font-weight: 700; }
h1 { margin: 6px 0; }
.panel { padding: 8px 24px; }
.section-heading { display: grid; gap: 5px; padding: 20px 0 14px; border-bottom: 1px solid var(--line); }
.field-row { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 20px 0; border-bottom: 1px solid var(--line); }
.field-row > span { display: grid; gap: 5px; }
small { color: var(--muted); }
input[type='checkbox'] { width: 20px; height: 20px; accent-color: var(--primary); flex: 0 0 auto; }
.input.compact { width: min(220px, 100%); }
.endpoint-row { align-items: flex-start; flex-direction: column; }
.endpoint-row > .input { width: 100%; }
.endpoint-control { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 10px; }
.permission-status { padding: 16px 0; display: grid; gap: 5px; }
.permission-status .ok { color: var(--primary); }
.permission-status .pending { color: var(--danger); }
.status-message { margin: 14px 0 16px; padding: 10px 12px; border-radius: 12px; background: var(--primary-soft); }
.error-message { color: var(--danger); }
.sync-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 0; }
.sync-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 4px 0 18px; }
.sync-summary > div { min-width: 0; padding: 14px; border: 1px solid var(--line); border-radius: 14px; display: grid; gap: 5px; }
.sync-summary strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.login-grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; padding: 18px 0; }
.login-grid label { display: grid; gap: 7px; color: var(--muted); }
.account-row { display: flex; justify-content: space-between; gap: 20px; align-items: center; padding: 18px 0; border-top: 1px solid var(--line); }
.account-row > div:first-child { min-width: 0; display: grid; gap: 5px; }
.account-row small { overflow: hidden; text-overflow: ellipsis; }
.save-bar { position: sticky; bottom: 16px; display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface-strong); box-shadow: var(--shadow); color: var(--muted); }
button:disabled { cursor: not-allowed; opacity: 0.65; }
@media (max-width: 700px) {
  .settings { margin: 24px auto; }
  .panel { padding-inline: 16px; }
  .field-row { align-items: flex-start; flex-direction: column; }
  .endpoint-control, .login-grid { grid-template-columns: 1fr; }
  .sync-summary { grid-template-columns: 1fr; }
  .account-row { align-items: flex-start; flex-direction: column; }
}
</style>

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

const saved = ref(false)
const busy = ref(false)
const aiStatus = ref('')
const permissionGranted = ref(false)

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

onMounted(async () => {
  const [value, aiSettings] = await Promise.all([
    chrome.storage.local.get('privacy'),
    getAiProviderSettings(),
  ])
  Object.assign(privacy, value.privacy ?? {})
  Object.assign(ai, aiSettings)
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
</script>

<template>
  <main class="settings">
    <header>
      <p>ATab</p>
      <h1>隐私与 AI 设置</h1>
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
        <strong>数据权限</strong>
        <small>不同数据类型独立授权，不使用一个总开关隐式扩大范围。</small>
      </div>
      <label class="field-row">
        <span>
          <strong>同步浏览历史</strong>
          <small>默认关闭，启用后才允许跨设备检索历史。</small>
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
        {{ busy ? '处理中…' : '保存设置' }}
      </button>
    </footer>
  </main>
</template>

<style scoped>
.settings { width: min(820px, calc(100% - 32px)); margin: 56px auto; display: grid; gap: 18px; }
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
.endpoint-control { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 10px; }
.permission-status { padding: 16px 0; display: grid; gap: 5px; }
.permission-status .ok { color: var(--primary); }
.permission-status .pending { color: var(--danger); }
.status-message { margin: 0 0 16px; padding: 10px 12px; border-radius: 12px; background: var(--primary-soft); }
.save-bar { position: sticky; bottom: 16px; display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface-strong); box-shadow: var(--shadow); color: var(--muted); }
button:disabled { cursor: not-allowed; opacity: 0.65; }
@media (max-width: 640px) {
  .settings { margin: 24px auto; }
  .panel { padding-inline: 16px; }
  .field-row { align-items: flex-start; flex-direction: column; }
  .endpoint-control { grid-template-columns: 1fr; }
}
</style>

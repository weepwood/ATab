<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  getAiProviderSettings,
  hasAiEndpointPermission,
  normalizeEndpoint,
  removeAiEndpointPermission,
  requestAiEndpointPermission,
  saveAiProviderSettings,
  testAiEndpoint,
  type AiProviderSettings,
} from '@/shared/ai/provider'

const saved = ref(false)
const saving = ref(false)
const testing = ref(false)
const statusMessage = ref('')
const statusError = ref('')
let previousAi: AiProviderSettings = {
  mode: 'local',
  endpoint: 'http://127.0.0.1:8787',
  fallbackToLocal: true,
}

const privacy = reactive({
  syncHistory: false,
  syncPageContent: false,
  allowAiPageReading: false,
})
const ai = reactive<AiProviderSettings>({ ...previousAi })

onMounted(async () => {
  const [value, settings] = await Promise.all([
    chrome.storage.local.get('privacy'),
    getAiProviderSettings(),
  ])
  Object.assign(privacy, value.privacy ?? {})
  Object.assign(ai, settings)
  previousAi = { ...settings }
})

async function save(): Promise<void> {
  saving.value = true
  statusMessage.value = ''
  statusError.value = ''
  try {
    const normalizedEndpoint = normalizeEndpoint(ai.endpoint)
    if (ai.mode === 'remote') {
      const hasPermission = await hasAiEndpointPermission(normalizedEndpoint)
      if (!hasPermission && !await requestAiEndpointPermission(normalizedEndpoint)) {
        throw new Error('未授予该 AI 服务来源权限')
      }
    }

    await Promise.all([
      chrome.storage.local.set({ privacy: { ...privacy } }),
      saveAiProviderSettings({ ...ai, endpoint: normalizedEndpoint }),
    ])

    if (previousAi.mode === 'remote'
      && (ai.mode !== 'remote' || normalizeEndpoint(previousAi.endpoint) !== normalizedEndpoint)) {
      await removeAiEndpointPermission(previousAi.endpoint)
    }
    previousAi = { ...ai, endpoint: normalizedEndpoint }
    ai.endpoint = normalizedEndpoint
    saved.value = true
    window.setTimeout(() => (saved.value = false), 1600)
  } catch (cause) {
    statusError.value = cause instanceof Error ? cause.message : '保存设置失败'
  } finally {
    saving.value = false
  }
}

async function testConnection(): Promise<void> {
  testing.value = true
  statusMessage.value = ''
  statusError.value = ''
  try {
    const endpoint = normalizeEndpoint(ai.endpoint)
    const hasPermission = await hasAiEndpointPermission(endpoint)
    if (!hasPermission && !await requestAiEndpointPermission(endpoint)) {
      throw new Error('未授予该 AI 服务来源权限')
    }
    const result = await testAiEndpoint(endpoint)
    statusMessage.value = `连接成功：${result.provider} / ${result.status}`
  } catch (cause) {
    statusError.value = cause instanceof Error ? cause.message : '连接测试失败'
  } finally {
    testing.value = false
  }
}

async function revokePermission(): Promise<void> {
  statusMessage.value = ''
  statusError.value = ''
  try {
    const removed = await removeAiEndpointPermission(ai.endpoint)
    statusMessage.value = removed ? '已撤销该 AI 服务来源权限' : '当前没有该来源权限'
    ai.mode = 'local'
    await saveAiProviderSettings({ ...ai })
    previousAi = { ...ai }
  } catch (cause) {
    statusError.value = cause instanceof Error ? cause.message : '撤销权限失败'
  }
}
</script>

<template>
  <main class="settings">
    <header>
      <p>ATab</p>
      <h1>隐私与 AI 设置</h1>
    </header>

    <section class="surface panel provider-panel">
      <div class="section-heading">
        <div>
          <strong>AI Provider</strong>
          <small>模型密钥只保存在本机 API 服务端，扩展只连接你授权的单一 Origin。</small>
        </div>
      </div>
      <label>
        <span><strong>Provider 模式</strong><small>本地规则不联网；远程模式调用 ATab 本机 API。</small></span>
        <select v-model="ai.mode" class="input">
          <option value="local">本地规则</option>
          <option value="remote">远程 ATab API</option>
        </select>
      </label>
      <label>
        <span><strong>API 地址</strong><small>本机可用 HTTP；非本机地址必须使用 HTTPS，且不得包含账号或密码。</small></span>
        <input v-model="ai.endpoint" class="input" placeholder="http://127.0.0.1:8787" />
      </label>
      <label>
        <span><strong>失败时回退本地规则</strong><small>远程服务不可用时，仅执行本地规则能够安全识别的任务。</small></span>
        <input v-model="ai.fallbackToLocal" type="checkbox" />
      </label>
      <div class="provider-actions">
        <button class="ghost-button" :disabled="testing || saving" @click="testConnection">
          {{ testing ? '测试中…' : '测试连接' }}
        </button>
        <button class="ghost-button" :disabled="testing || saving" @click="revokePermission">撤销来源权限</button>
        <span v-if="statusMessage" class="success">{{ statusMessage }}</span>
        <span v-if="statusError" class="error">{{ statusError }}</span>
      </div>
    </section>

    <section class="surface panel">
      <label><span><strong>同步浏览历史</strong><small>默认关闭，启用后才允许跨设备检索历史。</small></span><input v-model="privacy.syncHistory" type="checkbox" /></label>
      <label><span><strong>同步网页正文</strong><small>默认关闭；登录、支付、邮箱和内网页面仍应被禁止。</small></span><input v-model="privacy.syncPageContent" type="checkbox" /></label>
      <label><span><strong>允许 AI 读取网页正文</strong><small>当前远程 AI 只发送 HTTP/HTTPS 标签标题与 URL，不发送网页正文和本地文件路径。</small></span><input v-model="privacy.allowAiPageReading" type="checkbox" /></label>
      <footer><span v-if="saved">已保存</span><button class="primary-button" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存设置' }}</button></footer>
    </section>
  </main>
</template>

<style scoped>
.settings { width: min(820px, calc(100% - 32px)); margin: 56px auto; display: grid; gap: 18px; }
header { margin-bottom: 4px; }
header p { color: var(--primary); font-weight: 700; }
h1 { margin: 6px 0; }
.panel { padding: 8px 24px; }
.provider-panel { margin-bottom: 4px; }
.section-heading { padding: 20px 0 12px; border-bottom: 1px solid var(--line); }
.section-heading div { display: grid; gap: 5px; }
label { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 20px 0; border-bottom: 1px solid var(--line); }
label span { display: grid; gap: 5px; }
label .input { width: min(360px, 48%); }
small { color: var(--muted); }
input[type='checkbox'] { width: 20px; height: 20px; accent-color: var(--primary); }
.provider-actions, footer { display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 20px 0 12px; color: var(--muted); flex-wrap: wrap; }
.success { color: var(--primary); }
.error { color: var(--danger); }
button:disabled { cursor: not-allowed; opacity: 0.65; }
@media (max-width: 640px) {
  label { align-items: flex-start; flex-direction: column; }
  label .input { width: 100%; }
  .provider-actions, footer { justify-content: flex-start; }
}
</style>

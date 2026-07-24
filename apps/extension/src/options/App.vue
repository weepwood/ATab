<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

const saved = ref(false)
const privacy = reactive({
  syncHistory: false,
  syncPageContent: false,
  allowAiPageReading: false,
})

onMounted(async () => {
  const value = await chrome.storage.local.get('privacy')
  Object.assign(privacy, value.privacy ?? {})
})

async function save(): Promise<void> {
  await chrome.storage.local.set({ privacy: { ...privacy } })
  saved.value = true
  window.setTimeout(() => (saved.value = false), 1600)
}
</script>

<template>
  <main class="settings">
    <header>
      <p>ATab</p>
      <h1>隐私与 AI 设置</h1>
    </header>
    <section class="surface panel">
      <label><span><strong>同步浏览历史</strong><small>默认关闭，启用后才允许跨设备检索历史。</small></span><input v-model="privacy.syncHistory" type="checkbox" /></label>
      <label><span><strong>同步网页正文</strong><small>默认关闭；登录、支付、邮箱和内网页面仍应被禁止。</small></span><input v-model="privacy.syncPageContent" type="checkbox" /></label>
      <label><span><strong>允许 AI 读取网页正文</strong><small>当前仅保存授权状态，正文提取将在后续阶段实现。</small></span><input v-model="privacy.allowAiPageReading" type="checkbox" /></label>
      <footer><span v-if="saved">已保存</span><button class="primary-button" @click="save">保存设置</button></footer>
    </section>
  </main>
</template>

<style scoped>
.settings { width: min(760px, calc(100% - 32px)); margin: 56px auto; }
header { margin-bottom: 22px; }
header p { color: var(--primary); font-weight: 700; }
h1 { margin: 6px 0; }
.panel { padding: 8px 24px; }
label { display: flex; justify-content: space-between; gap: 24px; padding: 20px 0; border-bottom: 1px solid var(--line); }
label span { display: grid; gap: 5px; }
small { color: var(--muted); }
input[type='checkbox'] { width: 20px; height: 20px; accent-color: var(--primary); }
footer { display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 20px 0 12px; color: var(--muted); }
</style>

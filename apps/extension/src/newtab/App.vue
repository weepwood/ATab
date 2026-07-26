<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const search = ref('')
const now = ref(new Date())
const timer = window.setInterval(() => (now.value = new Date()), 1000)
onBeforeUnmount(() => window.clearInterval(timer))

const timeText = computed(() => now.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
const dateText = computed(() => now.value.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }))

const shortcuts = [
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'MDN', url: 'https://developer.mozilla.org' },
  { name: 'Vue', url: 'https://vuejs.org' },
  { name: '工作台', url: chrome.runtime.getURL('src/dashboard/index.html') },
]

function submitSearch(): void {
  const value = search.value.trim()
  if (!value) return
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    if (url.hostname.includes('.')) {
      window.location.href = url.toString()
      return
    }
  } catch {
    // 使用搜索引擎兜底。
  }
  window.location.href = `https://www.google.com/search?q=${encodeURIComponent(value)}`
}
</script>

<template>
  <main class="page">
    <section class="hero">
      <p class="date">{{ dateText }}</p>
      <h1>{{ timeText }}</h1>
      <form class="search surface" @submit.prevent="submitSearch">
        <span>⌕</span>
        <input v-model="search" aria-label="搜索或输入网址" placeholder="搜索网页、标签页或输入网址" />
      </form>
      <div class="shortcuts">
        <a v-for="item in shortcuts" :key="item.name" class="shortcut surface" :href="item.url">
          <span>{{ item.name.slice(0, 1) }}</span>
          <strong>{{ item.name }}</strong>
        </a>
      </div>
    </section>
  </main>
</template>

<style scoped>
.page { min-height: 100vh; display: grid; place-items: center; padding: 32px; background: radial-gradient(circle at 20% 10%, var(--primary-soft), transparent 38%), var(--bg); }
.hero { width: min(760px, 100%); text-align: center; }
h1 { font-size: clamp(64px, 12vw, 112px); line-height: 1; margin: 8px 0 28px; letter-spacing: -0.07em; }
.date { color: var(--muted); margin: 0; }
.search { display: flex; align-items: center; gap: 12px; padding: 6px 18px; }
.search input { flex: 1; border: 0; background: transparent; color: var(--text); padding: 14px 0; outline: none; font-size: 17px; }
.shortcuts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 22px; }
.shortcut { display: grid; gap: 8px; padding: 18px 12px; text-decoration: none; color: var(--text); transition: transform 180ms ease; }
.shortcut:hover { transform: translateY(-3px); }
.shortcut span { display: grid; place-items: center; width: 42px; height: 42px; margin: auto; border-radius: 13px; background: var(--primary-soft); color: var(--primary); font-weight: 800; }
@media (max-width: 620px) { .shortcuts { grid-template-columns: repeat(2, 1fr); } }
</style>

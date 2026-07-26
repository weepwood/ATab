const datasets = {
  tabs: [
    { icon: 'G', title: 'weepwood / ATab · GitHub', detail: 'github.com/weepwood/ATab', tag: '开发', action: '固定' },
    { icon: 'V', title: 'Vue 3 Composition API', detail: 'vuejs.org/guide/extras/composition-api-faq', tag: '文档', action: '关闭' },
    { icon: 'F', title: 'Fastify Documentation', detail: 'fastify.dev/docs/latest', tag: '开发', action: '静音' },
    { icon: 'S', title: 'Supabase Auth & RLS', detail: 'supabase.com/docs/guides/auth', tag: '后端', action: '关闭' },
    { icon: 'A', title: 'AI Browser Workspace Research', detail: 'example.invalid/research/ai-browser-workspace', tag: '研究', action: '固定' },
    { icon: 'D', title: 'GitHub Pages Deployment', detail: 'docs.github.com/pages', tag: '部署', action: '关闭' },
  ],
  sessions: [
    { icon: '◫', title: 'ATab 发布准备', detail: '8 个标签页 · 12 分钟前', tag: '自动快照', action: '恢复' },
    { icon: '◫', title: 'AI 浏览器研究', detail: '14 个标签页 · 昨天', tag: '手动保存', action: '恢复' },
    { icon: '◫', title: 'Supabase 同步实现', detail: '6 个标签页 · 3 天前', tag: '手动保存', action: '恢复' },
  ],
  bookmarks: [
    { icon: '◇', title: 'ATab 项目仓库', detail: 'github.com/weepwood/ATab', tag: '项目', action: '打开' },
    { icon: '◇', title: 'Chrome Extensions MV3', detail: 'developer.chrome.com/docs/extensions', tag: '文档', action: '打开' },
    { icon: '◇', title: 'Dexie IndexedDB', detail: 'dexie.org/docs', tag: '本地优先', action: '打开' },
    { icon: '◇', title: 'OpenAI-compatible API', detail: 'example.invalid/provider-guide', tag: 'AI', action: '打开' },
  ],
  resources: [
    { icon: '▤', title: '本地优先浏览器工作台架构', detail: '已采集 8,421 字 · 摘要已生成', tag: '架构', action: '查看' },
    { icon: '▤', title: 'Manifest V3 安全边界', detail: '已采集 5,203 字 · 语义索引已建立', tag: '安全', action: '查看' },
    { icon: '▤', title: '浏览器数据统一资源模型', detail: '已采集 6,880 字 · 摘要需更新', tag: '数据模型', action: '查看' },
    { icon: '▤', title: 'AI 结构化操作计划', detail: '已采集 4,126 字 · 摘要已生成', tag: 'AI', action: '查看' },
  ],
}

const viewMeta = {
  search: { title: '统一搜索', subtitle: '跨标签页、会话、书签和网页资料进行本地检索' },
  tabs: { title: '标签页工作台', subtitle: '按领域整理当前窗口，并执行可预览的批量操作' },
  sessions: { title: '浏览会话', subtitle: '保存、恢复与管理跨窗口工作状态' },
  bookmarks: { title: '书签与云收藏', subtitle: '统一浏览原生书签与本地云收藏演示数据' },
  resources: { title: '网页资料', subtitle: '管理用户主动采集、摘要与语义索引的网页内容' },
  sync: { title: '同步中心', subtitle: '查看设备状态、Outbox 与冲突处理边界' },
}

const state = {
  view: 'tabs',
  query: '',
  theme: localStorage.getItem('atab-demo-theme') || 'light',
  tabs: structuredClone(datasets.tabs),
}

const elements = {
  title: document.querySelector('#page-title'),
  content: document.querySelector('#content'),
  summary: document.querySelector('#summary-grid'),
  search: document.querySelector('#global-search'),
  dialog: document.querySelector('#ai-dialog'),
  toast: document.querySelector('#toast'),
  theme: document.querySelector('#theme-toggle'),
}

applyTheme()
render()

for (const button of document.querySelectorAll('.nav-item')) {
  button.addEventListener('click', () => {
    state.view = button.dataset.view
    state.query = ''
    elements.search.value = ''
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button))
    render()
  })
}

elements.search.addEventListener('input', (event) => {
  state.query = event.target.value.trim().toLowerCase()
  if (state.query && state.view !== 'search') {
    state.view = 'search'
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === 'search'))
  }
  render()
})

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    elements.search.focus()
  }
})

document.querySelector('#ai-organize').addEventListener('click', () => elements.dialog.showModal())
document.querySelector('#confirm-plan').addEventListener('click', () => {
  showToast('演示计划已确认：4 个标签页将归入“开发”分组')
})

elements.theme.addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark'
  localStorage.setItem('atab-demo-theme', state.theme)
  applyTheme()
})

function render() {
  const meta = viewMeta[state.view]
  elements.title.textContent = meta.title
  renderSummary()

  if (state.view === 'search') return renderSearch(meta)
  if (state.view === 'sync') return renderSync(meta)
  renderListView(meta, state.view)
}

function renderSummary() {
  const summaries = [
    ['打开标签页', String(state.tabs.length), '2 个窗口'],
    ['已保存会话', '12', '3 个自动快照'],
    ['网页资料', '38', '24 个已建立索引'],
    ['待同步操作', '3', '本地 Outbox'],
  ]
  elements.summary.innerHTML = summaries.map(([label, value, hint]) => `
    <article class="summary-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${hint}</small>
    </article>
  `).join('')
}

function renderListView(meta, view) {
  const source = view === 'tabs' ? state.tabs : datasets[view] || []
  const filtered = filterItems(source, state.query)
  elements.content.innerHTML = `
    ${sectionHead(meta, view === 'tabs' ? '<button class="pill-button active" data-filter="all">全部</button><button class="pill-button" data-filter="开发">开发</button><button class="pill-button" data-filter="研究">研究</button>' : '')}
    <div class="item-list">
      ${filtered.length ? filtered.map((item, index) => itemRow(item, index, view)).join('') : emptyState('没有匹配的数据', '调整搜索词或切换其他数据源。')}
    </div>
  `

  elements.content.querySelectorAll('.pill-button[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      elements.content.querySelectorAll('.pill-button').forEach((item) => item.classList.remove('active'))
      button.classList.add('active')
      const filter = button.dataset.filter
      const items = filter === 'all' ? source : source.filter((item) => item.tag === filter)
      elements.content.querySelector('.item-list').innerHTML = items.map((item, index) => itemRow(item, index, view)).join('')
      bindRowActions(view)
    })
  })
  bindRowActions(view)
}

function renderSearch(meta) {
  const all = [
    ...state.tabs.map((item) => ({ ...item, source: '标签页' })),
    ...datasets.sessions.map((item) => ({ ...item, source: '会话' })),
    ...datasets.bookmarks.map((item) => ({ ...item, source: '书签' })),
    ...datasets.resources.map((item) => ({ ...item, source: '资料' })),
  ]
  const results = state.query ? filterItems(all, state.query) : all.slice(0, 8)
  elements.content.innerHTML = `
    ${sectionHead(meta, `<span class="tag">${results.length} 条结果</span>`)}
    <div class="item-list">
      ${results.length ? results.map((item) => `
        <article class="item-row">
          <div class="favicon">${escapeHtml(item.icon)}</div>
          <div class="item-copy">
            <h3>${highlight(item.title, state.query)}</h3>
            <p>${highlight(item.detail, state.query)}</p>
          </div>
          <div class="item-meta"><span class="tag">${item.source}</span><button class="row-action" data-generic-action="打开">→</button></div>
        </article>
      `).join('') : emptyState('没有搜索结果', '尝试输入 GitHub、AI、同步或部署。')}
    </div>
  `
  elements.content.querySelectorAll('[data-generic-action]').forEach((button) => button.addEventListener('click', () => showToast('演示模式：已定位对应资源')))
}

function renderSync(meta) {
  const cards = [
    ['设备状态', 'Mac mini · 当前设备', '最近同步 2 分钟前', 92],
    ['同步 Outbox', '3 个待处理操作', '会话 1 · 云收藏 2', 38],
    ['冲突队列', '1 个待确认冲突', '本地版本与云端版本需要人工选择', 18],
    ['服务状态', 'API 配置就绪', 'Mock Provider · 本地回环地址', 100],
    ['认证状态', '演示账户', '真实部署需要 Supabase 用户 Token', 76],
    ['隐私边界', '本地优先', '正文、向量与历史不会在演示页上传', 100],
  ]
  elements.content.innerHTML = `
    ${sectionHead(meta, '<button class="pill-button active" id="sync-now">立即同步</button>')}
    <div class="card-grid">
      ${cards.map(([title, value, detail, progress]) => `
        <article class="data-card">
          <div class="card-icon">↻</div>
          <h3>${title}</h3>
          <strong>${value}</strong>
          <div class="progress"><span style="width:${progress}%"></span></div>
          <p>${detail}</p>
          <div class="card-footer"><span>本地演示数据</span><span>${progress}%</span></div>
        </article>
      `).join('')}
    </div>
  `
  document.querySelector('#sync-now').addEventListener('click', () => showToast('演示同步完成：未发送任何网络请求'))
}

function sectionHead(meta, actions = '') {
  return `
    <div class="section-head">
      <div><h2>${meta.title}</h2><p>${meta.subtitle}</p></div>
      <div class="section-actions">${actions}</div>
    </div>
  `
}

function itemRow(item, index, view) {
  return `
    <article class="item-row" data-index="${index}">
      <div class="favicon">${escapeHtml(item.icon)}</div>
      <div class="item-copy">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail)}</p>
      </div>
      <div class="item-meta">
        <span class="tag">${escapeHtml(item.tag)}</span>
        <button class="row-action" data-row-action="${escapeHtml(item.action)}" data-index="${index}" data-view="${view}" aria-label="${escapeHtml(item.action)}">⋯</button>
      </div>
    </article>
  `
}

function bindRowActions(view) {
  elements.content.querySelectorAll('[data-row-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index)
      const action = button.dataset.rowAction
      if (view === 'tabs' && action === '关闭') {
        const removed = state.tabs.splice(index, 1)[0]
        showToast(`已从演示列表关闭：${removed.title}`)
        render()
        return
      }
      showToast(`演示操作：${action}`)
    })
  })
}

function filterItems(items, query) {
  if (!query) return items
  return items.filter((item) => `${item.title} ${item.detail} ${item.tag}`.toLowerCase().includes(query))
}

function emptyState(title, detail) {
  return `<div class="empty-state"><div><div class="empty-icon">⌕</div><h3>${title}</h3><p>${detail}</p></div></div>`
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme
  elements.theme.textContent = state.theme === 'dark' ? '☀' : '◐'
}

function showToast(message) {
  elements.toast.textContent = message
  elements.toast.classList.add('show')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2400)
}

function highlight(value, query) {
  const safe = escapeHtml(value)
  if (!query) return safe
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safe.replace(new RegExp(`(${escapedQuery})`, 'ig'), '<mark>$1</mark>')
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character])
}

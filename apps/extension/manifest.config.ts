import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'ATab',
  description: '本地优先的 AI 标签页、书签与浏览会话工作台',
  version: '0.1.0',
  minimum_chrome_version: '109',
  permissions: [
    'activeTab',
    'scripting',
    'tabs',
    'tabGroups',
    'bookmarks',
    'sessions',
    'storage',
    'alarms',
  ],
  optional_permissions: ['history'],
  optional_host_permissions: ['http://*/*', 'https://*/*'],
  chrome_url_overrides: {
    newtab: 'src/newtab/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  action: {
    default_title: '打开 ATab 工作台',
  },
  options_page: 'src/options/index.html',
  commands: {
    'open-dashboard': {
      suggested_key: {
        default: 'Ctrl+Shift+Space',
        mac: 'Command+Shift+Space',
      },
      description: '打开 ATab 工作台',
    },
  },
})

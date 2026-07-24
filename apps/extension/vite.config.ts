import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [vue(), crx({ manifest })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        newtab: fileURLToPath(new URL('./src/newtab/index.html', import.meta.url)),
        dashboard: fileURLToPath(new URL('./src/dashboard/index.html', import.meta.url)),
        options: fileURLToPath(new URL('./src/options/index.html', import.meta.url)),
      },
    },
  },
})

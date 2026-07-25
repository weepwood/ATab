import { createAutoSnapshot } from '@/shared/sessionService'
import { runSyncOnce } from '@/shared/sync/client'
import { getSyncAuthSession, getSyncSettings } from '@/shared/sync/settings'

const dashboardUrl = chrome.runtime.getURL('src/dashboard/index.html')
const AUTO_SNAPSHOT_ALARM = 'atab-auto-session-snapshot'
const CLOUD_SYNC_ALARM = 'atab-cloud-sync'

async function openDashboard(): Promise<void> {
  const existing = await chrome.tabs.query({ url: dashboardUrl })
  if (existing[0]?.id !== undefined) {
    await chrome.tabs.update(existing[0].id, { active: true })
    await chrome.windows.update(existing[0].windowId, { focused: true })
    return
  }
  await chrome.tabs.create({ url: dashboardUrl })
}

function ensureBackgroundAlarms(): void {
  chrome.alarms.create(AUTO_SNAPSHOT_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: 30,
  })
  chrome.alarms.create(CLOUD_SYNC_ALARM, {
    delayInMinutes: 2,
    periodInMinutes: 15,
  })
}

async function runBackgroundSync(): Promise<void> {
  const [settings, auth] = await Promise.all([
    getSyncSettings(),
    getSyncAuthSession(),
  ])
  if (!settings.enabled || !auth) return
  try {
    await runSyncOnce()
  } catch {
    // 错误由同步客户端写入本地状态，后台任务不打断其他扩展事件。
  }
}

chrome.action.onClicked.addListener(() => {
  void openDashboard()
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-dashboard') void openDashboard()
})

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({
    installedAt: new Date().toISOString(),
    privacy: {
      syncHistory: false,
      syncPageContent: false,
      allowAiPageReading: false,
    },
  })
  ensureBackgroundAlarms()
  void createAutoSnapshot()
})

chrome.runtime.onStartup.addListener(() => {
  ensureBackgroundAlarms()
  void runBackgroundSync()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_SNAPSHOT_ALARM) void createAutoSnapshot()
  if (alarm.name === CLOUD_SYNC_ALARM) void runBackgroundSync()
})

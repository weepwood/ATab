import { createAutoSnapshot } from '@/shared/sessionService'

const dashboardUrl = chrome.runtime.getURL('src/dashboard/index.html')
const AUTO_SNAPSHOT_ALARM = 'atab-auto-session-snapshot'

async function openDashboard(): Promise<void> {
  const existing = await chrome.tabs.query({ url: dashboardUrl })
  if (existing[0]?.id !== undefined) {
    await chrome.tabs.update(existing[0].id, { active: true })
    await chrome.windows.update(existing[0].windowId, { focused: true })
    return
  }
  await chrome.tabs.create({ url: dashboardUrl })
}

function ensureAutoSnapshotAlarm(): void {
  chrome.alarms.create(AUTO_SNAPSHOT_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: 30,
  })
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
  ensureAutoSnapshotAlarm()
  void createAutoSnapshot()
})

chrome.runtime.onStartup.addListener(() => {
  ensureAutoSnapshotAlarm()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_SNAPSHOT_ALARM) void createAutoSnapshot()
})

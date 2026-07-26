const dashboardUrl = chrome.runtime.getURL('src/dashboard/index.html')

async function openDashboard(): Promise<void> {
  const existing = await chrome.tabs.query({ url: dashboardUrl })
  if (existing[0]?.id !== undefined) {
    await chrome.tabs.update(existing[0].id, { active: true })
    await chrome.windows.update(existing[0].windowId, { focused: true })
    return
  }
  await chrome.tabs.create({ url: dashboardUrl })
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
})

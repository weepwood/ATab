import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test'

interface ExtensionManifest {
  chrome_url_overrides?: { newtab?: string }
  options_ui?: { page?: string }
  options_page?: string
}

const extensionDir = resolve(
  process.env.ATAB_EXTENSION_DIR
    || fileURLToPath(new URL('../../extension/dist', import.meta.url)),
)

test('ATab 生产扩展可以加载并打开核心页面', async () => {
  expect(existsSync(resolve(extensionDir, 'manifest.json'))).toBe(true)
  const manifest = JSON.parse(
    await readFile(resolve(extensionDir, 'manifest.json'), 'utf8'),
  ) as ExtensionManifest

  const userDataDir = test.info().outputPath('chromium-profile')
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-component-update',
    ],
  })

  const errors: string[] = []
  context.on('page', (page) => watchPageErrors(page, errors))
  for (const page of context.pages()) watchPageErrors(page, errors)

  try {
    const worker = context.serviceWorkers()[0]
      ?? await context.waitForEvent('serviceworker', { timeout: 20_000 })
    const extensionId = new URL(worker.url()).host
    expect(extensionId).toMatch(/^[a-p]{32}$/)

    const newtabPath = manifest.chrome_url_overrides?.newtab
    expect(newtabPath, 'Manifest 应声明新标签页入口').toBeTruthy()
    const newtab = await openExtensionPage(context, extensionId, newtabPath!)
    await expect(newtab.getByRole('textbox', { name: '搜索或输入网址' })).toBeVisible()
    await expect(newtab.getByRole('link', { name: /工作台/ })).toBeVisible()

    const dashboard = await openExtensionPage(
      context,
      extensionId,
      'src/dashboard/index.html',
    )
    await expect(dashboard.getByRole('button', { name: '标签页', exact: true })).toBeVisible()
    await expect(dashboard.getByRole('button', { name: '搜索', exact: true })).toBeVisible()
    await expect(dashboard.getByRole('button', { name: '资料', exact: true })).toBeVisible()

    await dashboard.getByRole('button', { name: '资料', exact: true }).click()
    await expect(dashboard.getByRole('heading', { name: '网页资料' })).toBeVisible()
    await expect(dashboard.locator('body')).toContainText('正文')

    const databases = await dashboard.evaluate(async () => {
      const values = await indexedDB.databases()
      return values.map((item) => item.name).filter(Boolean)
    })
    expect(databases).toContain('atab')

    await dashboard.getByRole('button', { name: '搜索', exact: true }).click()
    await expect(dashboard.getByRole('heading', { name: '统一搜索' })).toBeVisible()
    await expect(dashboard.locator('body')).toContainText('语义搜索默认关闭')

    const optionsPath = manifest.options_ui?.page ?? manifest.options_page
    expect(optionsPath, 'Manifest 应声明设置页入口').toBeTruthy()
    const options = await openExtensionPage(context, extensionId, optionsPath!)
    await expect(options.locator('body')).toContainText('AI')
    await expect(options.locator('body')).toContainText('同步')

    await expect.poll(() => [...errors], { timeout: 2_000 }).toEqual([])
  } finally {
    await context.close()
  }
})

async function openExtensionPage(
  context: BrowserContext,
  extensionId: string,
  path: string,
): Promise<Page> {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/${path.replace(/^\//, '')}`)
  await page.waitForLoadState('domcontentloaded')
  return page
}

function watchPageErrors(page: Page, errors: string[]): void {
  page.on('pageerror', (error) => {
    errors.push(`${page.url()}: ${error.message}`)
  })
}

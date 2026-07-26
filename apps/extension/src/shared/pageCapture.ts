import type { TabView } from './domain'

export const MAX_CAPTURE_CHARACTERS = 200_000
export const MIN_CAPTURE_CHARACTERS = 80

export interface CapturedPageSnapshot {
  originalUrl: string
  canonicalUrl?: string
  title: string
  description?: string
  language?: string
  text: string
  truncated: boolean
}

const SENSITIVE_HINTS = [
  'login',
  'signin',
  'sign-in',
  'auth',
  'checkout',
  'payment',
  'bank',
  'mail',
  'inbox',
  'patient',
  'medical',
  'hospital',
  'health-record',
  '登录',
  '支付',
  '邮箱',
  '病案',
  '患者',
  '医疗',
]

export function isCapturablePageUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function hostPermissionPattern(input: string): string {
  const url = new URL(input)
  if (!isCapturablePageUrl(url.toString())) throw new Error('仅支持采集 HTTP 或 HTTPS 页面')
  return `${url.protocol}//${url.host}/*`
}

export function normalizeCapturedText(input: string, limit = MAX_CAPTURE_CHARACTERS): string {
  const safeLimit = Math.max(1, Math.min(limit, MAX_CAPTURE_CHARACTERS))
  return input
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, safeLimit)
}

export function isPotentiallySensitivePage(url: string, title = ''): boolean {
  const target = `${url} ${title}`.toLocaleLowerCase('zh-CN')
  return SENSITIVE_HINTS.some((hint) => target.includes(hint))
}

export async function capturePageFromTab(
  tab: Pick<TabView, 'id' | 'url'>,
): Promise<CapturedPageSnapshot> {
  if (!isCapturablePageUrl(tab.url)) throw new Error('该标签页不是可采集的网页')

  const originPattern = hostPermissionPattern(tab.url)
  const granted = await chrome.permissions.request({ origins: [originPattern] })
  if (!granted) throw new Error('未获得当前网站的临时读取权限')

  const current = await chrome.tabs.get(tab.id)
  if (!current.url || current.url !== tab.url) {
    throw new Error('标签页地址已经变化，请刷新列表后重新保存')
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageSnapshot,
    args: [MAX_CAPTURE_CHARACTERS],
  })
  const value = results[0]?.result
  if (!isRecord(value)) throw new Error('页面没有返回可用的正文数据')

  const text = normalizeCapturedText(readString(value.text))
  if (text.length < MIN_CAPTURE_CHARACTERS) {
    throw new Error('页面正文过短，可能是登录页、空白页或不支持读取的应用页面')
  }

  const originalUrl = readString(value.originalUrl) || tab.url
  if (!isCapturablePageUrl(originalUrl)) throw new Error('页面返回的网址无效')

  const canonicalUrl = readString(value.canonicalUrl)
  return {
    originalUrl,
    canonicalUrl: isCapturablePageUrl(canonicalUrl) ? canonicalUrl : undefined,
    title: readString(value.title) || current.title || originalUrl,
    description: readOptionalString(value.description),
    language: readOptionalString(value.language),
    text,
    truncated: Boolean(value.truncated) || text.length >= MAX_CAPTURE_CHARACTERS,
  }
}

function extractPageSnapshot(maxCharacters: number): Record<string, unknown> {
  const ignoredSelector = [
    'script',
    'style',
    'noscript',
    'svg',
    'canvas',
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    'button',
    'input',
    'textarea',
    'select',
    'option',
    '[hidden]',
    '[aria-hidden="true"]',
  ].join(',')
  const root = document.querySelector('article, main, [role="main"]') ?? document.body
  const parts: string[] = []
  let length = 0

  if (root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      const parent = node.parentElement
      if (!parent || parent.closest(ignoredSelector)) continue
      const value = node.data.replace(/\s+/g, ' ').trim()
      if (!value) continue
      parts.push(value)
      length += value.length + 1
      if (length >= maxCharacters) break
    }
  }

  const rawText = parts.join('\n')
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
  const description = document.querySelector<HTMLMetaElement>(
    'meta[name="description"], meta[property="og:description"]',
  )?.content

  return {
    originalUrl: location.href,
    canonicalUrl: canonical,
    title: document.title,
    description,
    language: document.documentElement.lang,
    text: rawText.slice(0, maxCharacters),
    truncated: rawText.length > maxCharacters || length >= maxCharacters,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOptionalString(value: unknown): string | undefined {
  const text = readString(value)
  return text || undefined
}

import { lstat, readFile, readdir, stat } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.cwd())
const distDir = resolve(root, process.env.ATAB_EXTENSION_DIR || 'apps/extension/dist')
const manifestPath = join(distDir, 'manifest.json')

await ensureDirectory(distDir, `扩展构建目录不存在：${distDir}`)
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
validateManifest(manifest)

const entryFiles = collectEntryFiles(manifest)
for (const entry of entryFiles) {
  const safeEntry = validateRelativeEntry(entry)
  await ensureFile(join(distDir, safeEntry), `Manifest 入口不存在：${safeEntry}`)
}

const files = await walk(distDir)
const scannable = files.filter((file) => ['.js', '.mjs', '.cjs', '.html', '.json', '.css'].includes(extname(file)))
const findings = []

const secretPatterns = [
  ['private-key', /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/g],
  ['openai-style-key', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ['supabase-service-role', /\b(?:SUPABASE_)?SERVICE[_-]?ROLE\b/gi],
  ['explicit-api-key', /\b(?:AI|OPENAI|ANTHROPIC|GEMINI)_API_KEY\s*[=:]\s*['"]?[^\s'"]{8,}/gi],
]

const unsafeCodePatterns = [
  ['eval', /\beval\s*\(/g],
  ['new-function', /\bnew\s+Function\s*\(/g],
  ['remote-static-import', /\b(?:import|export)\s+(?:[^'"]+?\s+from\s+)?['"]https?:\/\//g],
  ['remote-dynamic-import', /\bimport\s*\(\s*['"]https?:\/\//g],
]

for (const file of scannable) {
  const text = await readFile(file, 'utf8')
  for (const [name, pattern] of [...secretPatterns, ...unsafeCodePatterns]) {
    pattern.lastIndex = 0
    if (pattern.test(text)) findings.push({ file: relative(distDir, file), rule: name })
  }
  if (extname(file) === '.html') {
    const remoteScript = /<script\b[^>]*\bsrc\s*=\s*['"]https?:\/\//i.test(text)
    if (remoteScript) findings.push({ file: relative(distDir, file), rule: 'remote-script-src' })
  }
}

if (findings.length > 0) {
  console.error('扩展产物安全校验失败：')
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.rule}`)
  process.exit(1)
}

const totalBytes = (await Promise.all(files.map(async (file) => (await stat(file)).size)))
  .reduce((sum, size) => sum + size, 0)

console.log(JSON.stringify({
  status: 'ok',
  manifestVersion: manifest.manifest_version,
  extensionVersion: manifest.version,
  minimumChromeVersion: manifest.minimum_chrome_version,
  files: files.length,
  bytes: totalBytes,
  requiredPermissions: manifest.permissions ?? [],
  optionalPermissions: manifest.optional_permissions ?? [],
  optionalHostPermissions: manifest.optional_host_permissions ?? [],
}, null, 2))

function validateManifest(value) {
  if (value.manifest_version !== 3) throw new Error('扩展必须使用 Manifest V3')
  if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('Manifest 缺少 name')
  if (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(value.version)) {
    throw new Error('Manifest version 必须是 Chrome 支持的数字版本')
  }

  const minimumChrome = Number.parseInt(value.minimum_chrome_version, 10)
  if (!Number.isInteger(minimumChrome) || minimumChrome > 109) {
    throw new Error('Manifest minimum_chrome_version 不得高于项目兼容目标 Chrome 109')
  }

  const permissions = new Set(value.permissions ?? [])
  for (const permission of [
    'activeTab',
    'scripting',
    'tabs',
    'tabGroups',
    'bookmarks',
    'sessions',
    'storage',
    'alarms',
  ]) {
    if (!permissions.has(permission)) throw new Error(`Manifest 缺少必要权限：${permission}`)
  }

  const requiredHosts = [...(value.host_permissions ?? [])]
  if (requiredHosts.includes('<all_urls>') || requiredHosts.some((host) => host === 'http://*/*' || host === 'https://*/*')) {
    throw new Error('扩展不得在安装时申请全部网站访问权限')
  }

  const optionalHosts = new Set(value.optional_host_permissions ?? [])
  if (!optionalHosts.has('http://*/*') || !optionalHosts.has('https://*/*')) {
    throw new Error('网页正文与远程 API 访问应通过 HTTP/HTTPS 可选主机权限申请')
  }

  const optionalPermissions = new Set(value.optional_permissions ?? [])
  if (!optionalPermissions.has('history')) throw new Error('浏览历史必须保持可选权限')

  if (value.background?.type !== 'module') {
    throw new Error('Manifest V3 后台 Service Worker 必须使用 module 类型')
  }

  const extensionCsp = value.content_security_policy?.extension_pages
  if (typeof extensionCsp === 'string') {
    if (!/\bscript-src\b[^;]*'self'/i.test(extensionCsp)) {
      throw new Error("扩展页面 CSP 的 script-src 必须包含 'self'")
    }
    if (/'unsafe-eval'|\bhttps?:|\bdata:/i.test(extensionCsp)) {
      throw new Error('扩展页面 CSP 不得允许 unsafe-eval、远程脚本或 data: 脚本')
    }
  }
}

function collectEntryFiles(value) {
  const entries = new Set()
  const newtab = value.chrome_url_overrides?.newtab
  if (typeof newtab === 'string') entries.add(newtab)
  const options = value.options_ui?.page ?? value.options_page
  if (typeof options === 'string') entries.add(options)
  const popup = value.action?.default_popup
  if (typeof popup === 'string') entries.add(popup)
  const serviceWorker = value.background?.service_worker
  if (typeof serviceWorker === 'string') entries.add(serviceWorker)
  for (const resource of value.web_accessible_resources ?? []) {
    for (const path of resource.resources ?? []) {
      if (typeof path === 'string' && !path.includes('*')) entries.add(path)
    }
  }
  entries.add('src/dashboard/index.html')
  return [...entries]
}

function validateRelativeEntry(entry) {
  const normalized = entry.replaceAll('\\', '/')
  const parts = normalized.split('/')
  if (!normalized || normalized.startsWith('/') || parts.includes('..')) {
    throw new Error(`Manifest 包含不安全入口路径：${entry}`)
  }
  return normalized
}

async function ensureDirectory(path, message) {
  try {
    const info = await stat(path)
    if (!info.isDirectory()) throw new Error(message)
  } catch {
    throw new Error(message)
  }
}

async function ensureFile(path, message) {
  try {
    const info = await stat(path)
    if (!info.isFile()) throw new Error(message)
  } catch {
    throw new Error(message)
  }
}

async function walk(directory) {
  const results = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error(`扩展产物不得包含符号链接：${relative(distDir, path)}`)
    if (info.isDirectory()) results.push(...await walk(path))
    else if (info.isFile()) results.push(path)
  }
  return results.sort()
}

import { readFile } from 'node:fs/promises'
import process from 'node:process'

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || ''
if (!/^v\d+\.\d+\.\d+(?:\.\d+)?$/.test(tag)) {
  throw new Error(`发布标签格式无效：${tag || '(empty)'}`)
}

const [rootPackage, extensionPackage, manifest] = await Promise.all([
  readJson('package.json'),
  readJson('apps/extension/package.json'),
  readJson('apps/extension/dist/manifest.json'),
])

const versions = {
  rootPackage: readVersion(rootPackage, '根 package.json'),
  extensionPackage: readVersion(extensionPackage, '扩展 package.json'),
  manifest: readVersion(manifest, '扩展 Manifest'),
}
const distinct = new Set(Object.values(versions))
if (distinct.size !== 1) {
  throw new Error(
    `项目版本不一致：root=${versions.rootPackage}, extension=${versions.extensionPackage}, manifest=${versions.manifest}`,
  )
}

const expected = `v${versions.manifest}`
if (tag !== expected) {
  throw new Error(`发布标签 ${tag} 与项目版本 ${expected} 不一致`)
}

console.log(JSON.stringify({
  status: 'ok',
  tag,
  version: versions.manifest,
  sources: versions,
}, null, 2))

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`无法读取 ${path}：${message}`)
  }
}

function readVersion(value, label) {
  const version = value?.version
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
    throw new Error(`${label} 缺少有效数字版本`)
  }
  return version
}

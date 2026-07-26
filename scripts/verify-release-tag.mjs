import { readFile } from 'node:fs/promises'
import process from 'node:process'

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || ''
if (!/^v\d+\.\d+\.\d+(?:\.\d+)?$/.test(tag)) {
  throw new Error(`发布标签格式无效：${tag || '(empty)'}`)
}

const manifest = JSON.parse(
  await readFile('apps/extension/dist/manifest.json', 'utf8'),
)
const expected = `v${manifest.version}`
if (tag !== expected) {
  throw new Error(`发布标签 ${tag} 与扩展 Manifest 版本 ${expected} 不一致`)
}

console.log(`发布版本校验通过：${tag}`)

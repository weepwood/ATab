import { describe, expect, it } from 'vitest'
import {
  aiEndpointPermissionPattern,
  normalizeEndpoint,
} from '../src/shared/ai/provider'

describe('AI Provider 地址', () => {
  it('接受本机 HTTP 与远程 HTTPS', () => {
    expect(normalizeEndpoint('http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787')
    expect(normalizeEndpoint('https://ai.example.com/base?token=ignored#fragment')).toBe('https://ai.example.com/base')
  })

  it('拒绝公网 HTTP 与地址内凭据', () => {
    expect(() => normalizeEndpoint('http://ai.example.com')).toThrow('必须使用 HTTPS')
    expect(() => normalizeEndpoint('https://user:pass@ai.example.com')).toThrow('账号或密码')
  })

  it('只生成单一 Origin 的可撤销权限模式', () => {
    expect(aiEndpointPermissionPattern('https://ai.example.com/base')).toBe('https://ai.example.com/*')
    expect(aiEndpointPermissionPattern('http://localhost:8787')).toBe('http://localhost:8787/*')
  })
})

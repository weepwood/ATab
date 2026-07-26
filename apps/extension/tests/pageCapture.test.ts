import { describe, expect, it } from 'vitest'
import {
  hostPermissionPattern,
  isCapturablePageUrl,
  isPotentiallySensitivePage,
  normalizeCapturedText,
} from '../src/shared/pageCapture'

describe('网页正文采集辅助函数', () => {
  it('只允许 HTTP 和 HTTPS 页面', () => {
    expect(isCapturablePageUrl('https://example.com/article')).toBe(true)
    expect(isCapturablePageUrl('http://localhost:5173/')).toBe(true)
    expect(isCapturablePageUrl('chrome://settings/')).toBe(false)
    expect(isCapturablePageUrl('file:///tmp/note.html')).toBe(false)
    expect(isCapturablePageUrl('not a url')).toBe(false)
  })

  it('主机权限范围只包含当前来源', () => {
    expect(hostPermissionPattern('https://example.com:8443/path?q=1'))
      .toBe('https://example.com:8443/*')
    expect(() => hostPermissionPattern('chrome://history/')).toThrow('仅支持采集')
  })

  it('清理重复空白并限制正文长度', () => {
    expect(normalizeCapturedText('  第一段\n\n\n   第二段   内容  ', 12))
      .toBe('第一段\n\n第二段 内容')
  })

  it('提示可能包含敏感内容的页面', () => {
    expect(isPotentiallySensitivePage('https://example.com/login', '账户登录')).toBe(true)
    expect(isPotentiallySensitivePage('https://hospital.example.com/patient/1', '患者信息')).toBe(true)
    expect(isPotentiallySensitivePage('https://example.com/docs', '公开技术文档')).toBe(false)
  })
})

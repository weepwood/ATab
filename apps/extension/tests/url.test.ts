import { describe, expect, it } from 'vitest'
import { getDomain, normalizeUrl } from '../src/shared/url'

describe('normalizeUrl', () => {
  it('removes known tracking parameters and fragments', () => {
    expect(normalizeUrl('https://Example.com/path/?id=12&utm_source=test#section')).toBe('https://example.com/path?id=12')
  })

  it('keeps business parameters', () => {
    expect(normalizeUrl('https://example.com/view?issue=226&page=2')).toBe('https://example.com/view?issue=226&page=2')
  })
})

describe('getDomain', () => {
  it('removes www prefix', () => {
    expect(getDomain('https://www.github.com/weepwood/ATab')).toBe('github.com')
  })
})

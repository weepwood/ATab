import { describe, expect, it } from 'vitest'
import {
  normalizeEmbeddingDraft,
  parseEmbeddingApiResponse,
  validateEmbeddingRequest,
} from '../src/embedding'

describe('语义嵌入共享协议', () => {
  it('校验批量嵌入请求', () => {
    expect(validateEmbeddingRequest({
      purpose: 'resource-index',
      inputs: [
        { id: 'resource-1', text: '复杂系统与反馈回路' },
        { id: 'resource-2', text: '浏览器标签页管理' },
      ],
    })).toMatchObject({
      purpose: 'resource-index',
      inputs: [{ id: 'resource-1' }, { id: 'resource-2' }],
    })
  })

  it('拒绝重复 ID 和未声明字段', () => {
    expect(() => validateEmbeddingRequest({
      purpose: 'resource-index',
      inputs: [
        { id: 'same', text: '第一个文本' },
        { id: 'same', text: '第二个文本' },
      ],
    })).toThrow('重复 ID')
    expect(() => validateEmbeddingRequest({
      purpose: 'search-query',
      inputs: [{ id: 'query', text: '复杂系统', secret: true }],
    })).toThrow('未声明字段')
  })

  it('要求响应 ID 与请求完全一致且维度相同', () => {
    expect(normalizeEmbeddingDraft({
      embeddings: [
        { id: 'a', vector: Array(8).fill(0.1) },
        { id: 'b', vector: Array(8).fill(0.2) },
      ],
    }, ['a', 'b'])).toMatchObject({ dimensions: 8 })

    expect(() => normalizeEmbeddingDraft({
      embeddings: [{ id: 'outside', vector: Array(8).fill(0.1) }],
    }, ['a'])).toThrow('请求范围外')
    expect(() => normalizeEmbeddingDraft({
      embeddings: [
        { id: 'a', vector: Array(8).fill(0.1) },
        { id: 'b', vector: Array(9).fill(0.2) },
      ],
    }, ['a', 'b'])).toThrow('维度必须一致')
  })

  it('校验完整嵌入 API 响应', () => {
    expect(parseEmbeddingApiResponse({
      provider: 'mock',
      model: 'atab-mock-embedding-v1',
      dimensions: 8,
      embeddings: [{ id: 'query', vector: Array(8).fill(0.25) }],
    }, ['query'])).toMatchObject({
      provider: 'mock',
      dimensions: 8,
      embeddings: [{ id: 'query' }],
    })
  })
})

import type { ApiConfig } from '../config'
import { MockAgentProvider } from './mock'
import { OpenAiCompatibleProvider } from './openaiCompatible'
import type { AgentProvider } from './types'

export function createAgentProvider(config: ApiConfig): AgentProvider {
  if (config.provider === 'openai-compatible') {
    return new OpenAiCompatibleProvider(config)
  }
  return new MockAgentProvider()
}

export type { AgentProvider } from './types'

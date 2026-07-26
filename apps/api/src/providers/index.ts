import type { ApiConfig } from '../config'
import { MockAgentProvider } from './mock'
import { OpenAiCompatibleProvider } from './openaiCompatible'
import type { AgentProvider } from './types'

export function createAgentProvider(config: ApiConfig): AgentProvider {
  return config.provider === 'openai-compatible'
    ? new OpenAiCompatibleProvider(config)
    : new MockAgentProvider()
}

export type { AgentProvider } from './types'

import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  normalizeAgentPlanDraft,
  validateAgentPlanRequest,
} from '@atab/contracts'
import { loadConfig, type ApiConfig } from './config'
import { createAgentProvider, type AgentProvider } from './providers'

export interface BuildAppOptions {
  config?: ApiConfig
  provider?: AgentProvider
  logger?: boolean
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig()
  const provider = options.provider ?? createAgentProvider(config)
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1_048_576,
  })

  await app.register(cors, {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin, config)),
    methods: ['GET', 'POST', 'OPTIONS'],
  })

  app.get('/health', async () => ({ status: 'ok', provider: provider.name }))

  app.post('/v1/agent/plan', async (request, reply) => {
    let input
    try {
      input = validateAgentPlanRequest(request.body)
    } catch (cause) {
      return reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: errorMessage(cause) },
      })
    }

    try {
      const draft = await provider.generatePlan(input)
      const plan = normalizeAgentPlanDraft(draft, input.tabs.map((tab) => tab.id))
      return reply.send({ plan, provider: provider.name })
    } catch (cause) {
      request.log.error({ err: cause }, 'AI 计划生成失败')
      return reply.code(502).send({
        error: {
          code: 'PLAN_GENERATION_FAILED',
          message: errorMessage(cause).slice(0, 500),
        },
      })
    }
  })

  return app
}

export function isOriginAllowed(origin: string | undefined, config: ApiConfig): boolean {
  if (!origin) return true
  const normalized = origin.replace(/\/$/, '')
  if (config.allowedOrigins.length > 0) return config.allowedOrigins.includes(normalized)
  return config.provider === 'mock' && (
    normalized.startsWith('chrome-extension://')
    || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)
  )
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '未知错误'
}

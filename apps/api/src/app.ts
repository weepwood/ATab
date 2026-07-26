import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  normalizeAgentPlanDraft,
  normalizeResourceSummaryDraft,
  validateAgentPlanRequest,
  validateResourceSummaryRequest,
} from '@atab/contracts'
import {
  normalizeEmbeddingDraft,
  validateEmbeddingRequest,
} from '@atab/contracts/embedding'
import { loadConfig, type ApiConfig } from './config'
import { createAgentProvider, type AgentProvider } from './providers'
import { SupabaseSyncGateway, type SyncGateway } from './sync/gateway'
import { registerSyncRoutes } from './sync/routes'

export interface BuildAppOptions {
  config?: ApiConfig
  provider?: AgentProvider
  syncGateway?: SyncGateway
  logger?: boolean
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig()
  const provider = options.provider ?? createAgentProvider(config)
  const syncGateway = options.syncGateway ?? new SupabaseSyncGateway(config)
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1_048_576,
  })

  await app.register(cors, {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow: boolean) => void,
    ) => callback(null, isOriginAllowed(origin, config)),
    methods: ['GET', 'POST', 'OPTIONS'],
  })

  app.get('/health', async () => ({
    status: 'ok',
    provider: provider.name,
    model: provider.model ?? null,
    embeddingModel: provider.embeddingModel ?? null,
    syncConfigured: syncGateway.configured,
  }))

  app.post('/v1/agent/plan', async (request, reply) => {
    let input
    try {
      input = validateAgentPlanRequest(request.body)
    } catch (cause) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: errorMessage(cause),
        },
      })
    }

    try {
      const draft = await provider.generatePlan(input)
      const plan = normalizeAgentPlanDraft(
        draft,
        input.tabs.map((tab) => tab.id),
      )
      return reply.send({
        plan,
        provider: provider.name,
      })
    } catch (cause) {
      request.log.error({ err: cause }, 'AI 计划生成失败')
      return reply.code(502).send({
        error: {
          code: 'PLAN_GENERATION_FAILED',
          message: errorMessage(cause),
        },
      })
    }
  })

  app.post('/v1/ai/resources/summarize', async (request, reply) => {
    let input
    try {
      input = validateResourceSummaryRequest(request.body)
    } catch (cause) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_SUMMARY_REQUEST',
          message: errorMessage(cause),
        },
      })
    }

    try {
      const draft = await provider.summarizeResource(input)
      const summary = normalizeResourceSummaryDraft(draft)
      return reply.send({
        summary,
        provider: provider.name,
        model: provider.model ?? null,
      })
    } catch (cause) {
      request.log.error({ err: cause }, 'AI 网页摘要生成失败')
      return reply.code(502).send({
        error: {
          code: 'SUMMARY_GENERATION_FAILED',
          message: errorMessage(cause),
        },
      })
    }
  })

  app.post('/v1/ai/embeddings', async (request, reply) => {
    let input
    try {
      input = validateEmbeddingRequest(request.body)
    } catch (cause) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_EMBEDDING_REQUEST',
          message: errorMessage(cause),
        },
      })
    }

    try {
      const draft = await provider.embedTexts(input)
      const normalized = normalizeEmbeddingDraft(
        draft,
        input.inputs.map((item) => item.id),
      )
      if (!provider.embeddingModel) throw new Error('Provider 未声明嵌入模型')
      return reply.send({
        embeddings: normalized.embeddings,
        provider: provider.name,
        model: provider.embeddingModel,
        dimensions: normalized.dimensions,
      })
    } catch (cause) {
      request.log.error({ err: cause }, 'AI 嵌入生成失败')
      return reply.code(502).send({
        error: {
          code: 'EMBEDDING_GENERATION_FAILED',
          message: errorMessage(cause),
        },
      })
    }
  })

  await registerSyncRoutes(app, syncGateway)
  return app
}

export function isOriginAllowed(origin: string | undefined, config: ApiConfig): boolean {
  if (!origin) return true
  const normalized = origin.replace(/\/$/, '')

  if (config.allowedOrigins.length > 0) {
    return config.allowedOrigins.includes(normalized)
  }

  return normalized.startsWith('chrome-extension://')
    || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '未知错误'
}

import cors from '@fastify/cors'
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
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
import {
  createAiAuditEvent,
  type AiAuditRoute,
  type AiAuditSink,
} from './auth/audit'
import {
  AiRateLimitError,
  InMemoryAiRateLimiter,
  type AiRateLimiter,
} from './auth/rateLimiter'
import {
  AiAuthError,
  ConfiguredAiAuthVerifier,
  type AiAuthVerifier,
  type AiRequestIdentity,
} from './auth/user'
import { loadConfig, type ApiConfig } from './config'
import { createAgentProvider, type AgentProvider } from './providers'
import { SupabaseSyncGateway, type SyncGateway } from './sync/gateway'
import { registerSyncRoutes } from './sync/routes'

export interface BuildAppOptions {
  config?: ApiConfig
  provider?: AgentProvider
  syncGateway?: SyncGateway
  authVerifier?: AiAuthVerifier
  rateLimiter?: AiRateLimiter
  auditSink?: AiAuditSink
  logger?: boolean
}

interface AiRequestContext {
  identity: AiRequestIdentity
  startedAt: number
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig()
  const provider = options.provider ?? createAgentProvider(config)
  const syncGateway = options.syncGateway ?? new SupabaseSyncGateway(config)
  const authVerifier = options.authVerifier ?? new ConfiguredAiAuthVerifier(config)
  const rateLimiter = options.rateLimiter ?? new InMemoryAiRateLimiter(config.rateLimitPerMinute)
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
    authMode: config.authMode,
    rateLimitPerMinute: config.rateLimitPerMinute,
    syncConfigured: syncGateway.configured,
  }))

  async function safeAudit(
    request: FastifyRequest,
    input: Parameters<typeof createAiAuditEvent>[0],
  ): Promise<void> {
    const event = createAiAuditEvent(input)
    try {
      if (options.auditSink) {
        await options.auditSink.write(event)
      } else {
        request.log.info({ aiAudit: event }, 'AI request audit')
      }
    } catch (cause) {
      request.log.error({ err: cause }, 'AI audit write failed')
    }
  }

  async function authorizeAiRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    route: AiAuditRoute,
    model?: string,
  ): Promise<AiRequestContext | null> {
    const startedAt = Date.now()
    let identity: AiRequestIdentity
    try {
      identity = await authVerifier.authenticate(request.headers.authorization)
    } catch (cause) {
      const error = cause instanceof AiAuthError
        ? cause
        : new AiAuthError(502, 'AUTH_VERIFICATION_FAILED', errorMessage(cause))
      await safeAudit(request, {
        requestId: request.id,
        userId: 'anonymous',
        route,
        provider: provider.name,
        model,
        inputCount: 0,
        characterCount: 0,
        status: 'unauthorized',
        startedAt,
        errorCode: error.code,
      })
      await reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
      })
      return null
    }

    try {
      const rate = rateLimiter.consume(identity.userId)
      reply.header('x-ratelimit-limit', String(rate.limit))
      reply.header('x-ratelimit-remaining', String(rate.remaining))
      reply.header('x-ratelimit-reset', String(Math.ceil(rate.resetAt / 1_000)))
    } catch (cause) {
      if (!(cause instanceof AiRateLimitError)) throw cause
      const retryAfter = Math.max(1, Math.ceil((cause.resetAt - Date.now()) / 1_000))
      reply.header('retry-after', String(retryAfter))
      await safeAudit(request, {
        requestId: request.id,
        userId: identity.userId,
        route,
        provider: provider.name,
        model,
        inputCount: 0,
        characterCount: 0,
        status: 'rate-limited',
        startedAt,
        errorCode: 'RATE_LIMITED',
      })
      await reply.code(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: cause.message,
          retryAfterSeconds: retryAfter,
        },
      })
      return null
    }

    return { identity, startedAt }
  }

  app.post('/v1/agent/plan', async (request, reply) => {
    const context = await authorizeAiRequest(request, reply, 'agent-plan', provider.model)
    if (!context) return

    let input
    try {
      input = validateAgentPlanRequest(request.body)
    } catch (cause) {
      await safeAudit(request, {
        requestId: request.id,
        userId: context.identity.userId,
        route: 'agent-plan',
        provider: provider.name,
        model: provider.model,
        inputCount: 0,
        characterCount: 0,
        status: 'error',
        startedAt: context.startedAt,
        errorCode: 'INVALID_REQUEST',
      })
      return reply.code(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: errorMessage(cause),
        },
      })
    }

    const characterCount = input.command.length + input.tabs.reduce(
      (total, tab) => total + tab.title.length + tab.url.length,
      0,
    )
    try {
      const draft = await provider.generatePlan(input)
      const plan = normalizeAgentPlanDraft(
        draft,
        input.tabs.map((tab) => tab.id),
      )
      await safeAudit(request, {
        requestId: request.id,
        userId: context.identity.userId,
        route: 'agent-plan',
        provider: provider.name,
        model: provider.model,
        inputCount: input.tabs.length,
        characterCount,
        status: 'success',
        startedAt: context.startedAt,
      })
      return reply.send({
        plan,
        provider: provider.name,
      })
    } catch (cause) {
      request.log.error({ err: cause }, 'AI 计划生成失败')
      await safeAudit(request, {
        requestId: request.id,
        userId: context.identity.userId,
        route: 'agent-plan',
        provider: provider.name,
        model: provider.model,
        inputCount: input.tabs.length,
        characterCount,
        status: 'error',
        startedAt: context.startedAt,
        errorCode: 'PLAN_GENERATION_FAILED',
      })
      return reply.code(502).send({
        error: {
          code: 'PLAN_GENERATION_FAILED',
          message: errorMessage(cause),
        },
      })
    }
  })

  app.post('/v1/ai/resources/summarize', async (request, reply) => {
    const context = await authorizeAiRequest(request, reply, 'resource-summary', provider.model)
    if (!context) return

    let input
    try {
      input = validateResourceSummaryRequest(request.body)
    } catch (cause) {
      await safeAudit(request, {
        requestId: request.id,
        userId: context.identity.userId,
        route: 'resource-summary',
        provider: provider.name,
        model: provider.model,
        inputCount: 0,
        characterCount: 0,
        status: 'error',
        startedAt: context.startedAt,
        errorCode: 'INVALID_SUMMARY_REQUEST',
      })
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
      await safeAudit(request, {
        requestId: request.id,
        userId: context.identity.userId,
        route: 'resource-summary',
        provider: provider.name,
        model: provider.model,
        inputCount: 1,
        characterCount: input.content.length,
        status: 'success',
        startedAt: context.startedAt,
      })
      return reply.send({
        summary,
        provider: provider.name,
        model: provider.model ?? null,
      })
    } catch (cause) {
      request.log.error({ err: cause }, 'AI 网页摘要生成失败')
      await safeAudit(request, {
        requestId: request.id,
        userId: context.identity.userId,
        route: 'resource-summary',
        provider: provider.name,
        model: provider.model,
        inputCount: 1,
        characterCount: input.content.length,
        status: 'error',
        startedAt: context.startedAt,
        errorCode: 'SUMMARY_GENERATION_FAILED',
      })
      return reply.code(502).send({
        error: {
          code: 'SUMMARY_GENERATION_FAILED',
          message: errorMessage(cause),
        },
      })
    }
  })

  app.post('/v1/ai/embeddings', async (request, reply) => {
    const context = await authorizeAiRequest(
      request,
      reply,
      'embeddings',
      provider.embeddingModel,
    )
    if (!context) return

    let input
    try {
      input = validateEmbeddingRequest(request.body)
    } catch (cause) {
      await safeAudit(request, {
        requestId: request.id,
        userId: context.identity.userId,
        route: 'embeddings',
        provider: provider.name,
        model: provider.embeddingModel,
        inputCount: 0,
        characterCount: 0,
        status: 'error',
        startedAt: context.startedAt,
        errorCode: 'INVALID_EMBEDDING_REQUEST',
      })
      return reply.code(400).send({
        error: {
          code: 'INVALID_EMBEDDING_REQUEST',
          message: errorMessage(cause),
        },
      })
    }

    const characterCount = input.inputs.reduce((total, item) => total + item.text.length, 0)
    try {
      const draft = await provider.embedTexts(input)
      const normalized = normalizeEmbeddingDraft(
        draft,
        input.inputs.map((item) => item.id),
      )
      if (!provider.embeddingModel) throw new Error('Provider 未声明嵌入模型')
      await safeAudit(request, {
        requestId: request.id,
        userId: context.identity.userId,
        route: 'embeddings',
        provider: provider.name,
        model: provider.embeddingModel,
        inputCount: input.inputs.length,
        characterCount,
        status: 'success',
        startedAt: context.startedAt,
      })
      return reply.send({
        embeddings: normalized.embeddings,
        provider: provider.name,
        model: provider.embeddingModel,
        dimensions: normalized.dimensions,
      })
    } catch (cause) {
      request.log.error({ err: cause }, 'AI 嵌入生成失败')
      await safeAudit(request, {
        requestId: request.id,
        userId: context.identity.userId,
        route: 'embeddings',
        provider: provider.name,
        model: provider.embeddingModel,
        inputCount: input.inputs.length,
        characterCount,
        status: 'error',
        startedAt: context.startedAt,
        errorCode: 'EMBEDDING_GENERATION_FAILED',
      })
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

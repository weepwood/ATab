import type { FastifyInstance } from 'fastify'
import type { ApiConfig } from './config'
import { createReadinessReport } from './readiness'

export function registerReadinessRoute(
  app: FastifyInstance,
  config: ApiConfig,
): void {
  app.get('/ready', async (_request, reply) => {
    const report = createReadinessReport(config)
    return reply
      .code(report.status === 'not-ready' ? 503 : 200)
      .send(report)
  })
}

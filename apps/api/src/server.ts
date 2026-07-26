import { buildApp } from './app'
import { loadConfig } from './config'
import { assertSafeStartupConfig } from './readiness'
import { registerReadinessRoute } from './readinessRoute'

const config = loadConfig()
assertSafeStartupConfig(config)
const app = await buildApp({ config, logger: true })
registerReadinessRoute(app, config)

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, '正在关闭 ATab API')
  await app.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

try {
  await app.listen({ host: config.host, port: config.port })
} catch (cause) {
  app.log.error(cause)
  process.exit(1)
}

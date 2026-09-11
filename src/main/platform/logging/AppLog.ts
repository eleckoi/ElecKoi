import pino, { type Logger } from 'pino'

export function createAppLog(): Logger {
  return pino({
    name: 'eleckoi-desktop',
    level: process.env.ELECKOI_LOG_LEVEL ?? 'info',
    base: { process: 'main' }
  })
}

const bootstrapLogger = pino({ name: 'eleckoi-desktop-bootstrap' })

export function getBootstrapLogger(): Logger {
  return bootstrapLogger
}

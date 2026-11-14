import { inspect } from 'node:util'
import { Logger, type Context, type Exporter, type Message } from '@deepseek-ai/cordis'
import { redactReportText } from '../../../shared/src/contracts/bugReport/redact'

/** A broken diagnostic stream cannot recursively report through itself. */
function bestEffort(_error: unknown): void { }

/** Preserve error fields, causes and aggregate members before transport folding. */
export function formatHostDiagnostic(value: unknown): string {
  const traced = typeof value === 'object' && value !== null
    && typeof Object.getOwnPropertyDescriptor(value, 'stack')?.value === 'string'
  return redactReportText(inspect(value, { depth: null, maxArrayLength: null, maxStringLength: null,
    colors: false, customInspect: false, getters: false, showHidden: value instanceof Error || traced }))
}

/** Observe process failures while the official launcher keeps ownership of exit. */
export function installHostProcessDiagnostics(write: (text: string) => void = text => { process.stderr.write(text) }): () => void {
  const capture = (kind: string, error: unknown) => {
    try { write(`[ElecKoi Host][${kind}] ${formatHostDiagnostic(error)}\n`) } catch (failure) { bestEffort(failure) }
  }
  const exception = (error: Error) => capture('uncaughtException', error)
  const rejection = (error: unknown) => capture('unhandledRejection', error)
  // A rejection observer alone would change Node's default fatal policy.
  const observesRejections = process.listenerCount('unhandledRejection') > 0
  process.on('uncaughtExceptionMonitor', exception)
  if (observesRejections) process.prependListener('unhandledRejection', rejection)
  return () => {
    process.off('uncaughtExceptionMonitor', exception)
    if (observesRejections) process.off('unhandledRejection', rejection)
  }
}

/** Connect the official logger to the process stream already captured by both shells. */
export function installHostLogExporter(ctx: Context, write: (text: string) => void = text => { process.stderr.write(text) }): void {
  let last = 0
  const exporter: Exporter = {
    colors: false, maxLength: Infinity, levels: { default: 1 },
    formatters: { o: formatHostDiagnostic, O: formatHostDiagnostic,
      s: value => value instanceof Error ? formatHostDiagnostic(value) : String(value) },
    export(message: Message) {
      if (message.sn <= last) return
      last = message.sn
      if (message.type !== 'error' && message.type !== 'warn') return
      try {
        const args = message.args.map(value => value instanceof Error ? formatHostDiagnostic(value) : value)
        write(redactReportText(`[ElecKoi Host][${message.type}][${message.name}][${message.ts}] ${Logger.format(exporter, { ...message, args })}\n`))
      } catch (error) { bestEffort(error) }
    },
  }
  ctx.logger.exporter(exporter)
  const buffered = ctx.logger.buffer.slice()
  if (buffered.length && buffered[0]!.sn > 1) {
    try { write(`[ElecKoi Host][diagnostic-gap] Official logger buffer starts at ${buffered[0]!.sn}; earlier records are unavailable.\n`) } catch (error) { bestEffort(error) }
  }
  for (const message of buffered) exporter.export(message)
}

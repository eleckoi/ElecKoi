import type { Context } from '@deepseek-ai/cordis'
import { installHostLogExporter, installHostProcessDiagnostics } from './hostDiagnostics'

export const name = 'eleckoi-host-diagnostics'
export function apply(ctx: Context): void {
  installHostLogExporter(ctx)
  ctx.effect(() => installHostProcessDiagnostics(), 'Host process diagnostic observers')
}

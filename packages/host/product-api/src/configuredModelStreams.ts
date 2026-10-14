import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { createHash } from 'node:crypto'
import { createAuxiliaryModelConnection } from './auxiliaryModelAdapter.js'

type Parameters = Record<string, unknown>
type Connection = Awaited<ReturnType<typeof createAuxiliaryModelConnection>>
type Entry = { key: string; pending: Promise<Connection>; active: number; retired: boolean; disposed: boolean }

/** Reuse the public adapter seam for additional parameters, retaining native Agent sessions. */
export class ConfiguredModelStreams {
  private readonly entries = new Map<string, Entry>()
  private readonly live = new Set<Entry>()

  constructor(private readonly owner: Context) {
    owner.on('session/disposed', session => this.releaseSession(String(session.id)))
    owner.effect(() => async () => {
      const entries = [...this.live]
      this.entries.clear()
      for (const entry of entries) entry.retired = true
      await Promise.all(entries.map(entry => this.dispose(entry)))
    })
  }

  private async dispose(entry: Entry): Promise<void> {
    if (entry.disposed) return
    entry.disposed = true
    this.live.delete(entry)
    // Creation failures are still delivered to the requesting stream.
    const connection = await entry.pending.catch(() => undefined)
    await connection?.dispose()
  }

  private releaseSession(sessionId: string): void {
    const entry = this.entries.get(sessionId)
    if (!entry) return
    this.entries.delete(sessionId)
    entry.retired = true
    if (!entry.active) void this.dispose(entry)
  }

  async *stream(options: GenerateOptions, settings: Parameters, requestId = ''): AsyncIterable<StreamChunk> {
    const sessionId = String(options.sessionId ?? '')
    if (!sessionId) throw new Error('预设模型请求缺少原生 Session 编号。')
    const parameters: Parameters = { ...settings,
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.topP === undefined ? {} : { topP: options.topP }),
      ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
      ...(options.stop === undefined ? {} : { stop: options.stop }) }
    const revisions = this.owner.settings.describe({ redactSecrets: true })
      .filter(item => item.ns === 'llm-pi-ai' || item.ns === 'llm-deepseek' || item.ns === 'eleckoi-client-models')
      .map(item => [item.ns, item.revision])
    const key = createHash('sha256').update(JSON.stringify([options.provider, options.model, parameters, revisions, requestId])).digest('hex')
    let entry = this.entries.get(sessionId)
    if (!entry || entry.key !== key) {
      if (entry) { entry.retired = true; if (!entry.active) await this.dispose(entry) }
      entry = { key, pending: createAuxiliaryModelConnection(this.owner, options.provider, options.model, parameters), active: 0, retired: false, disposed: false }
      this.entries.set(sessionId, entry)
      this.live.add(entry)
    }
    entry.active++
    try {
      const connection = await entry.pending
      yield* connection.context.llm.stream({ ...options, provider: connection.provider })
    } catch (error) {
      if (this.entries.get(sessionId) === entry) this.entries.delete(sessionId)
      entry.retired = true
      throw error
    } finally {
      entry.active--
      if (entry.retired && !entry.active) await this.dispose(entry)
    }
  }
}

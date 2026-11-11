import type { Context } from '@deepseek-ai/cordis'
import type { NativeAuthorRuleReply, NativeAuthorRuleTask } from '@eleckoi/dsh-product-api/types'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import type {} from '@eleckoi/dsh-product-api/remote'

type AuthorRemote = Pick<Context['remote'], '$stream' | 'eleckoiAuthorScripts'>
export interface AuthorRuleDelivery {
  task: NativeAuthorRuleTask
  signal: AbortSignal
  reply(value: NativeAuthorRuleReply): Promise<void>
}

/** Reconnect only the transport; never replay an interrupted variable candidate. */
export async function* authorRuleStream(remote: AuthorRemote, conversationId: string, version: string,
  signal: AbortSignal, reconnecting: () => void): AsyncGenerator<AuthorRuleDelivery, void> {
  let channel: ReturnType<AuthorRemote['eleckoiAuthorScripts']['connect']>
  const stream = remote.$stream<NativeAuthorRuleTask>({
    name: 'ElecKoi native author rules',
    open: generationSignal => {
      channel = remote.eleckoiAuthorScripts.connect(conversationId, version, AbortSignal.any([signal, generationSignal]))
      return channel
    },
    ended: () => new Error('Native author rule stream ended'),
    carrierFailed: reconnecting,
  })
  const stop = () => { void stream.dispose() }
  signal.addEventListener('abort', stop, { once: true })
  if (signal.aborted) stop()
  let generation = 0
  try {
    for await (const packet of stream) {
      const task = packet.value
      if (packet.generation !== generation) {
        if (task.kind !== 'ready' || task.version !== version) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch,
          'Native author stream did not acknowledge its catalog', { what: '原生作者流的目录版本' })
        generation = packet.generation
        packet.accept()
      } else if (task.kind === 'ready') throw productFailure(ELECKOI_FAILURE_CODES.internal,
        'Duplicate native author stream acknowledgement', { what: '重复的原生作者流确认' })
      const owner = channel!
      yield { task, signal: packet.signal, reply: async value => owner.send(value) }
    }
  } finally { signal.removeEventListener('abort', stop); await stream.dispose() }
}

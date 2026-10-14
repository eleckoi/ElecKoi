import { installTavernCompatibility } from '@eleckoi/tavern-native'
import type { AuthorHostAdapter, AuthorRequestOptions } from '@eleckoi/author-sdk/browser'
import { nativeTavernClientMethods } from './tavern-client.js'
import type { FunctionToolRemote } from './function-tools.js'

export interface TavernRemote {
  connectTools?: FunctionToolRemote['connectTools']
  snapshot(conversationId: string): Promise<{ ok: boolean; value?: unknown; error?: { message: string } }>
  invoke(conversationId: string, method: string, params: Record<string, unknown>): Promise<{ ok: boolean; value?: unknown; error?: { message: string } }>
  generate?(params: Record<string, any>, signal: AbortSignal): AsyncIterable<Record<string, any>> & { dispose(): void | Promise<void> }
}
export interface TavernDocumentContext { conversationId: string; messageId?: string; characterId?: string; scriptId?: string }
export interface TavernDocumentMount { conversationId: string; ready: Promise<void>; refresh(): Promise<unknown>; dispose(): void }

/** One owner bridges its native API and accepted host snapshot into each browser realm. */
export function mountTavernDocument(target: Window, options: {
  remote: TavernRemote; shared: object; context: TavernDocumentContext; adapter: AuthorHostAdapter;
  available(): void; report(error: unknown): void;
  invokeNative?(method: string, params: Record<string, unknown>, options: AuthorRequestOptions): unknown | Promise<unknown>;
  ui: { mediaSrc?(reference: string): string; formatMessage(text: string, options?: Record<string, unknown>): string;
    refreshMessage(index: string | number, options?: Record<string, unknown>): Promise<void>;
    generationState?(state: { id: string; running: boolean; shouldSilence: boolean; conversationId: string }): void }
}): TavernDocumentMount {
  const lifetime = new AbortController()
  const available = () => { lifetime.signal.throwIfAborted(); options.available() }
  const unwrap = async (request: ReturnType<TavernRemote['snapshot']>) => {
    const result = await request
    available()
    if (!result.ok) throw new Error(result.error?.message || 'Tavern compatibility host request failed.')
    return result.value as Record<string, unknown>
  }
  const nativeRequest = async (method: string, params: Record<string, unknown>, extra: { signal?: AbortSignal } = {}) => {
    available()
    let committed = false
    const call = new AbortController()
    const close = () => { if (!committed) call.abort(lifetime.signal.reason) }
    lifetime.signal.addEventListener('abort', close, { once: true })
    const signal = extra.signal ? AbortSignal.any([extra.signal, call.signal]) : call.signal
    try {
      if (options.invokeNative && nativeTavernClientMethods.has(method)) return await options.invokeNative(method, params, {
        signal, commitContextChange: () => { signal.throwIfAborted(); committed = true },
      })
      return await options.adapter.request(method, params, { signal })
    } finally { lifetime.signal.removeEventListener('abort', close) }
  }
  const controller = installTavernCompatibility(target, {
    bridge: {
      snapshot: async () => {
        available()
        const snapshot = await unwrap(options.remote.snapshot(options.context.conversationId))
        if (options.context.conversationId) {
          const channels = ['bgm','ambient'] as const
          const audio = await Promise.all(channels.map(channel=>options.adapter.request('audio.getState',{channel},{signal:lifetime.signal})))
          snapshot.audio = Object.fromEntries(channels.map((channel,index)=>[channel,audio[index]]))
        }
        return snapshot
      },
      invoke: (method: string, params: Record<string, unknown>) => {
        available()
        if (options.invokeNative && nativeTavernClientMethods.has(method)) return nativeRequest(method, params)
        return unwrap(options.remote.invoke(options.context.conversationId, method, params))
      },
      ...(options.remote.generate ? { generate: async function* (params: Record<string, any>, signal: AbortSignal) {
        available()
        const stream = options.remote.generate!(params, AbortSignal.any([signal, lifetime.signal]))
        try { for await (const event of stream) { available(); yield event } }
        finally { await stream.dispose() }
      } } : {}),
    },
    shared: options.shared, context: options.context,
    native: {
      ...(options.adapter.registerButton ? { registerButton: options.adapter.registerButton } : {}),
      request: nativeRequest,
      subscribe: (event: string, listener: (payload: unknown) => void) => options.adapter.on(event, listener),
    },
    ui: options.ui, report: options.report,
  })
  const close = () => {
    if (lifetime.signal.aborted) return
    lifetime.abort(new Error('Tavern compatibility document closed'))
    target.removeEventListener('pagehide', close)
    controller.dispose()
  }
  target.addEventListener('pagehide', close, { once: true })
  return { conversationId: options.context.conversationId, ready: controller.ready, refresh: () => { available(); return controller.refresh() }, dispose: close }
}

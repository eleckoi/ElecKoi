import type { AuthorAudioState } from '@eleckoi/author-sdk'
import type { NativeAudioRuntime } from './audio.js'
import { NativeSpeechRuntime } from './speech.js'

type Value = Record<string, unknown>
export interface NativeSpeechProvider {
  speak(text: string, settings: Value, signal: AbortSignal): unknown | Promise<unknown>
  voices?(): unknown | Promise<unknown>
  stop?(): unknown | Promise<unknown>
}
const voices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar']
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {}

/** Provider callbacks stay in JS; generated audio shares the existing voice channel. */
export class NativeSpeechProviders {
  private readonly system: NativeSpeechRuntime
  private active?: { controller: AbortController; done: Promise<void> }
  constructor(private readonly options: {
    window: Window
    createId(): string
    audio(): NativeAudioRuntime
    providers: Map<string, NativeSpeechProvider>
    host?(conversationId: string, method: string, params: Value): Promise<unknown>
    report(error: unknown): void
  }) { this.system = new NativeSpeechRuntime(options.window) }

  private async settings(conversationId: string, patch: Value): Promise<Value> {
    return { ...(this.options.host ? object(await this.options.host(conversationId, 'tts.settings', {})) : { provider: 'system' }), ...patch }
  }

  async voices(conversationId: string, patch: Value = {}): Promise<unknown> {
    const settings = await this.settings(conversationId, patch), provider = settings.provider
    if (provider === 'system') return this.system.voices()
    if (provider === 'openai') return voices.map(name => ({ name, voiceURI: name, lang: '', default: name === (settings.voice || 'alloy'), localService: false, provider }))
    const custom = this.options.providers.get(String(provider))
    if (!custom?.voices) throw new Error(`语音 provider 没有提供 voices：${String(provider)}`)
    return custom.voices()
  }

  async speak(conversationId: string, text: string, patch: Value, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (typeof text !== 'string' || !text.trim()) throw new TypeError('语音朗读需要非空正文。')
    const previous = this.active
    previous?.controller.abort(new Error('语音朗读已被替换。'))
    const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal])
    const done = (async () => {
      if (previous) await previous.done.catch(() => {})
      combined.throwIfAborted()
      const settings = await this.settings(conversationId, patch)
      combined.throwIfAborted()
      await this.run(conversationId, text, settings, combined)
    })()
    const active = { controller, done }; this.active = active
    try { await done } finally { if (this.active === active) this.active = undefined }
  }

  private async run(conversationId: string, text: string, settings: Value, signal: AbortSignal): Promise<void> {
    if (settings.provider === 'system') return this.system.speak(text, settings, signal)
    if (settings.provider !== 'openai') {
      const provider = this.options.providers.get(String(settings.provider))
      if (!provider) throw new Error(`语音 provider 未注册：${String(settings.provider)}`)
      let rejectCancel!: (reason: unknown) => void
      const cancelled = new Promise<never>((_resolve, reject) => { rejectCancel = reject })
      const stop = () => {
        rejectCancel(signal.reason)
        if (provider.stop) Promise.resolve(provider.stop()).catch(this.options.report)
      }
      signal.addEventListener('abort', stop, { once: true })
      try { signal.throwIfAborted(); await Promise.race([provider.speak(text, settings, signal), cancelled]) }
      finally { signal.removeEventListener('abort', stop) }
      return
    }
    if (!conversationId) throw new Error('远程语音播放需要当前聊天。')
    if (!this.options.host) throw new Error('原生语音服务没有连接。')
    const requestId = this.options.createId(), host = this.options.host, audio = this.options.audio()
    const stop = () => {
      void host(conversationId, 'tts.cancel', { requestId }).catch(this.options.report)
      void audio.invoke(conversationId, 'audio.stop', { channel: 'voice' }).catch(this.options.report)
    }
    signal.addEventListener('abort', stop, { once: true })
    try {
      signal.throwIfAborted()
      const result = object(await host(conversationId, 'tts.synthesize', { ...settings, text, requestId }))
      signal.throwIfAborted()
      if (typeof result.url !== 'string') throw new Error('语音服务没有返回可播放的音频。')
      await this.play(conversationId, requestId, result.url, String(result.mediaType ?? ''), audio, signal)
    } finally { signal.removeEventListener('abort', stop) }
  }

  private play(conversationId: string, id: string, url: string, mimeType: string, audio: NativeAudioRuntime, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false, started = false
      const finish = (error?: unknown) => {
        if (settled) return
        settled = true; unsubscribe(); signal.removeEventListener('abort', cancel)
        if (error !== undefined) reject(error); else resolve()
      }
      const cancel = () => finish(signal.reason)
      const unsubscribe = audio.subscribeState((state: AuthorAudioState) => {
        if (state.channel !== 'voice') return
        if (state.currentTrack?.id !== id) { if (started) finish(new Error('语音播放已被替换。')); return }
        started = true
        if (state.status === 'ended') finish()
        else if (state.status === 'error') finish(new Error(state.error || '语音播放失败。'))
        else if (state.status === 'idle') finish(new Error('语音播放已停止。'))
      })
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) { cancel(); return }
      void audio.invoke(conversationId, 'audio.configure', { channel: 'voice', enabled: true, mode: 'play_one_and_stop' }, signal)
        .then(() => audio.invoke(conversationId, 'audio.play', { channel: 'voice', track: { id, url, mimeType, name: '语音朗读' } }, signal)).catch(finish)
    })
  }

  stop(): boolean {
    if (!this.active) return this.system.stop()
    this.active.controller.abort(new Error('语音朗读已停止。'))
    return true
  }
  dispose(): void { this.stop(); this.system.dispose() }
}

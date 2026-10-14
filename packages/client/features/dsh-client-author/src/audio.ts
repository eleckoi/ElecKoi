import { AuthorApiError, type AuthorAudioChannel, type AuthorAudioSettings, type AuthorAudioState, type AuthorAudioTrack } from '@eleckoi/author-sdk'

export const nativeAudioMethods = ['audio.play', 'audio.pause', 'audio.resume', 'audio.stop', 'audio.seek', 'audio.getState',
  'audio.getPlaylist', 'audio.setPlaylist', 'audio.appendPlaylist', 'audio.getSettings', 'audio.setSettings', 'audio.configure'] as const
export const nativeAudioEvents = ['audio.state.changed', 'audio.time.updated'] as const
const channels: readonly AuthorAudioChannel[] = ['bgm', 'ambient', 'voice', 'sfx']
type AudioEvent = { name: typeof nativeAudioEvents[number]; payload: { conversationId: string; state: AuthorAudioState } }
type Entry = {
  channel: AuthorAudioChannel; status: AuthorAudioState['status']; playlist: AuthorAudioTrack[]; currentIndex: number
  loop: boolean; shuffle: boolean; volume: number; error: string; visited: Set<number>
  audio?: HTMLAudioElement; removeListeners?: () => void; cancelPlay?: (error: unknown) => void
  lastTimeEvent: number
  enabled?: boolean
  mode?: 'repeat_one' | 'repeat_all' | 'shuffle' | 'play_one_and_stop'
}
export interface NativeAudioOptions {
  createAudio(): HTMLAudioElement
  emit(event: AudioEvent): void
  report(error: unknown): void
  random?: () => number
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function number(value: unknown, name: string, maximum = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) throw new AuthorApiError('INVALID_PARAMS', `${name}超出有效范围。`)
  return value
}
function flag(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new AuthorApiError('INVALID_PARAMS', `${name}必须是布尔值。`)
  return value
}
function channel(value: unknown): AuthorAudioChannel {
  if (value === undefined) return 'bgm'
  if (!channels.includes(value as AuthorAudioChannel)) throw new AuthorApiError('INVALID_PARAMS', '未知的音频频道。')
  return value as AuthorAudioChannel
}

/** One Client owns live audio; neither scripts nor project frames own a second player. */
export class NativeAudioRuntime {
  private readonly entries = new Map<AuthorAudioChannel, Entry>()
  private readonly stateListeners = new Set<(state: AuthorAudioState) => void>()
  private conversationId = ''
  private closed = false
  private sequence = 0
  private settings: AuthorAudioSettings = { masterVolume: 1, muted: false, channels: {
    bgm: { volume: 1, muted: false }, ambient: { volume: 1, muted: false },
    voice: { volume: 1, muted: false }, sfx: { volume: 1, muted: false },
  } }
  constructor(private readonly options: NativeAudioOptions) {}

  subscribeState(listener: (state: AuthorAudioState) => void): () => void {
    this.stateListeners.add(listener); return () => { this.stateListeners.delete(listener) }
  }

  activate(conversationId: string): void {
    if (conversationId === this.conversationId) return
    this.conversationId = conversationId
    for (const entry of this.entries.values()) {
      this.releaseMedia(entry, new AuthorApiError('AUDIO_CONTEXT_CHANGED', '音频所属聊天已切换。'))
      entry.status = 'idle'; this.publish('audio.state.changed', entry)
    }
    this.entries.clear()
  }

  async invoke(conversationId: string, method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<unknown> {
    this.assertOpen(); signal?.throwIfAborted()
    if (method === 'audio.getSettings') return structuredClone(this.settings)
    if (method === 'audio.setSettings') return this.updateSettings(params.settings)
    if (!nativeAudioMethods.includes(method as typeof nativeAudioMethods[number])) throw new AuthorApiError('METHOD_UNAVAILABLE', '未知的原生音频操作。')
    if (!conversationId) throw new AuthorApiError('CHAT_NOT_READY', '音频操作需要当前聊天。')
    const key = channel(params.channel)
    // Validate a replacement before stopping accepted playback.
    let tracks: AuthorAudioTrack[] | undefined, index = 0, loop = false, shuffle = false, volume = 1, startAt = 0
    if (method === 'audio.play') {
      tracks = [this.track(params.track)]
      if (params.loop !== undefined) loop = flag(params.loop, '循环设置')
      if (params.volume !== undefined) volume = number(params.volume, '曲目音量', 1)
      if (params.startAt !== undefined) startAt = number(params.startAt, '播放位置')
    } else if (method === 'audio.setPlaylist' || method === 'audio.appendPlaylist') {
      if (!Array.isArray(params.items)) throw new AuthorApiError('INVALID_PARAMS', '播放列表必须是曲目数组。')
      tracks = params.items.map(item => this.track(item))
      if (method === 'audio.setPlaylist') {
        if (params.currentIndex !== undefined) {
          if (!Number.isSafeInteger(params.currentIndex) || (params.currentIndex as number) < 0
            || (params.currentIndex as number) >= tracks.length) throw new AuthorApiError('INVALID_PARAMS', '曲目索引不在播放列表内。')
          index = params.currentIndex as number
        }
        if (params.loop !== undefined) loop = flag(params.loop, '循环设置')
        if (params.shuffle !== undefined) shuffle = flag(params.shuffle, '随机播放设置')
        if (params.autoplay !== undefined) flag(params.autoplay, '自动播放设置')
      }
    } else if (method === 'audio.seek') startAt = number(params.seconds, '播放位置')
    this.activate(conversationId)
    const entry = this.entry(key)
    if (method === 'audio.configure') {
      if (params.enabled !== undefined) entry.enabled = flag(params.enabled,'音频启用状态')
      if (params.mode !== undefined) {
        if (!['repeat_one','repeat_all','shuffle','play_one_and_stop'].includes(String(params.mode))) throw new AuthorApiError('INVALID_PARAMS','未知播放模式。')
        entry.mode = params.mode as NonNullable<Entry['mode']>
      }
      if (params.volume !== undefined) entry.volume = number(params.volume,'频道音量',1)
      if (params.muted !== undefined) this.settings.channels[key].muted = flag(params.muted,'频道静音状态')
      if (entry.enabled === false) entry.audio?.pause()
      this.applyVolume(entry); this.publish('audio.state.changed',entry)
      return this.snapshot(entry)
    }
    switch (method) {
      case 'audio.play':
      case 'audio.setPlaylist':
        this.releaseMedia(entry)
        Object.assign(entry, { playlist: tracks!, currentIndex: tracks!.length ? index : -1, loop, shuffle, error: '',
          visited: new Set(tracks!.length ? [index] : []), ...(method === 'audio.play' ? { volume } : {}) })
        if (tracks!.length) this.load(entry, startAt)
        else entry.status = 'idle'
        if (method === 'audio.play' || params.autoplay && tracks!.length) await this.start(entry, signal)
        break
      case 'audio.appendPlaylist': {
        const empty = entry.playlist.length === 0
        entry.playlist.push(...tracks!)
        if (empty && entry.playlist.length) { entry.currentIndex = 0; entry.visited.add(0); this.load(entry, 0) }
        break
      }
      case 'audio.pause':
        entry.cancelPlay?.(new AuthorApiError('AUDIO_SUPERSEDED', '播放已被暂停。'))
        entry.audio?.pause(); entry.status = entry.currentIndex < 0 ? 'idle' : 'paused'
        break
      case 'audio.resume':
        if (!entry.playlist[entry.currentIndex]) throw new AuthorApiError('AUDIO_EMPTY', '当前频道没有可播放的曲目。')
        if (!entry.audio) this.load(entry, 0)
        await this.start(entry, signal)
        break
      case 'audio.stop':
        this.releaseMedia(entry); entry.status = 'idle'; entry.error = ''
        break
      case 'audio.seek':
        if (!entry.audio) throw new AuthorApiError('AUDIO_EMPTY', '当前频道没有已加载的曲目。')
        entry.audio.currentTime = this.position(entry.audio, startAt)
        this.publish('audio.time.updated', entry)
        return this.snapshot(entry)
      case 'audio.getState': return this.snapshot(entry)
      case 'audio.getPlaylist': return { channel: key, items: structuredClone(entry.playlist), currentIndex: entry.currentIndex }
    }
    signal?.throwIfAborted(); this.assertOpen()
    this.publish('audio.state.changed', entry)
    return this.snapshot(entry)
  }

  private track(value: unknown): AuthorAudioTrack {
    const source = typeof value === 'string' ? { url: value } : value
    if (!object(source) || typeof source.url !== 'string' || !source.url.trim()) throw new AuthorApiError('INVALID_PARAMS', '曲目必须提供有效 URL。')
    for (const key of ['id', 'name', 'mimeType']) if (source[key] !== undefined && typeof source[key] !== 'string') throw new AuthorApiError('INVALID_PARAMS', '曲目编号、名称和媒体类型必须是文本。')
    if (source.id !== undefined && !(source.id as string).trim()) throw new AuthorApiError('INVALID_PARAMS', '曲目编号不能为空。')
    if (source.metadata !== undefined && !object(source.metadata)) throw new AuthorApiError('INVALID_PARAMS', '曲目附加资料必须是对象。')
    return { id: typeof source.id === 'string' && source.id ? source.id : `native-audio-${++this.sequence}`,
      url: source.url, name: typeof source.name === 'string' ? source.name : source.url,
      mimeType: typeof source.mimeType === 'string' ? source.mimeType : '', metadata: structuredClone(source.metadata ?? {}) }
  }
  private entry(key: AuthorAudioChannel): Entry {
    let value = this.entries.get(key)
    if (!value) { value = { channel: key, status: 'idle', playlist: [], currentIndex: -1, loop: false, shuffle: false,
      volume: 1, error: '', visited: new Set(), lastTimeEvent: 0 }; this.entries.set(key, value) }
    return value
  }
  private snapshot(entry: Entry): AuthorAudioState {
    const duration = entry.audio?.duration, time = entry.audio?.currentTime
    return Object.assign({ conversationId: this.conversationId, channel: entry.channel, status: entry.status,
      playlist: structuredClone(entry.playlist), currentIndex: entry.currentIndex,
      currentTrack: structuredClone(entry.playlist[entry.currentIndex] ?? null),
      currentTime: typeof time === 'number' && Number.isFinite(time) ? time : 0,
      duration: typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? duration : null,
      loop: entry.loop, shuffle: entry.shuffle, volume: entry.volume,
      muted: this.settings.muted || this.settings.channels[entry.channel].muted, error: entry.error },
      { enabled: entry.enabled ?? true, ...(entry.mode ? { mode: entry.mode } : {}) })
  }
  private position(audio: HTMLAudioElement, seconds: number): number {
    return Number.isFinite(audio.duration) && audio.duration >= 0 ? Math.min(seconds, audio.duration) : seconds
  }
  private load(entry: Entry, startAt: number): void {
    this.releaseMedia(entry)
    const audio = this.options.createAudio(); entry.audio = audio; entry.status = 'paused'; entry.error = ''
    const removers: Array<() => void> = []
    const on = (name: string, listener: () => void) => {
      const guarded = () => { if (!this.closed && entry.audio === audio && this.entries.get(entry.channel) === entry) listener() }
      audio.addEventListener(name, guarded); removers.push(() => audio.removeEventListener(name, guarded))
    }
    entry.removeListeners = () => removers.forEach(stop => stop())
    audio.preload = 'metadata'; audio.src = entry.playlist[entry.currentIndex]!.url
    this.applyVolume(entry); audio.load(); audio.currentTime = this.position(audio, startAt)
    on('playing', () => { if (!audio.paused) { entry.status = 'playing'; entry.error = ''; this.publish('audio.state.changed', entry) } })
    on('pause', () => { if (audio.paused && (entry.status === 'playing' || entry.status === 'loading')) {
      entry.status = 'paused'; this.publish('audio.state.changed', entry)
    } })
    on('loadedmetadata', () => { audio.currentTime = this.position(audio, audio.currentTime); this.publish('audio.state.changed', entry) })
    on('seeked', () => this.publish('audio.time.updated', entry))
    on('timeupdate', () => { const now = Date.now(); if (now - entry.lastTimeEvent >= 250) {
      entry.lastTimeEvent = now; this.publish('audio.time.updated', entry)
    } })
    on('error', () => { entry.status = 'error'; entry.error = audio.error?.message || `音频媒体错误 ${audio.error?.code ?? ''}`
      this.publish('audio.state.changed', entry)
    })
    on('ended', () => { entry.status = 'ended'; this.publish('audio.state.changed', entry)
      if (entry.enabled === false || entry.mode === 'play_one_and_stop') return
      if (entry.mode === 'repeat_one') { audio.currentTime = 0; void this.start(entry).catch(error=>this.options.report(error)); return }
      if (entry.mode === 'repeat_all' || entry.mode === 'shuffle') { entry.loop=true; entry.shuffle=entry.mode==='shuffle' }
      void this.advance(entry).catch(error => { if (!this.closed && this.entries.get(entry.channel) === entry) this.options.report(error) })
    })
  }
  private start(entry: Entry, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    entry.cancelPlay?.(new AuthorApiError('AUDIO_SUPERSEDED', '播放请求已被替换。'))
    const audio = entry.audio!; entry.status = 'loading'; this.publish('audio.state.changed', entry)
    return new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => { settled = true; signal?.removeEventListener('abort', cancelled); if (entry.cancelPlay === cancel) entry.cancelPlay = undefined }
      const cancel = (error: unknown) => { if (settled) return; cleanup(); reject(error) }
      const cancelled = () => {
        if (settled) return
        cancel(signal!.reason); audio.pause()
        if (entry.audio === audio) { entry.status = 'paused'; this.publish('audio.state.changed', entry) }
      }
      entry.cancelPlay = cancel; signal?.addEventListener('abort', cancelled, { once: true })
      const failed = (error: unknown) => {
        if (settled) return
        cleanup(); entry.status = 'error'; entry.error = error instanceof Error ? error.message : String(error)
        this.publish('audio.state.changed', entry); reject(new AuthorApiError('AUDIO_PLAY_FAILED', entry.error))
      }
      try {
        Promise.resolve(audio.play()).then(() => {
          if (settled) return
          cleanup(); entry.status = 'playing'; entry.error = ''; this.publish('audio.state.changed', entry); resolve()
        }, failed)
      } catch (error) { failed(error) }
    })
  }
  private async advance(entry: Entry): Promise<void> {
    let next: number
    if (entry.shuffle) {
      let candidates = entry.playlist.map((_track, index) => index).filter(index => !entry.visited.has(index))
      if (!candidates.length && entry.loop) { entry.visited.clear(); candidates = entry.playlist.map((_track, index) => index) }
      if (!candidates.length) return
      next = candidates[Math.floor((this.options.random ?? Math.random)() * candidates.length)]!
    } else if (entry.currentIndex + 1 < entry.playlist.length) next = entry.currentIndex + 1
    else if (entry.loop) next = 0
    else return
    entry.currentIndex = next; entry.visited.add(next); this.load(entry, 0); await this.start(entry)
  }
  private releaseMedia(entry: Entry, error: unknown = new AuthorApiError('AUDIO_SUPERSEDED', '音频操作已被替换。')): void {
    entry.cancelPlay?.(error); entry.removeListeners?.(); entry.removeListeners = undefined
    const audio = entry.audio; entry.audio = undefined
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load() }
  }
  private applyVolume(entry: Entry): void {
    if (!entry.audio) return
    entry.audio.volume = this.settings.masterVolume * this.settings.channels[entry.channel].volume * entry.volume
    entry.audio.muted = this.settings.muted || this.settings.channels[entry.channel].muted
  }
  private updateSettings(value: unknown): AuthorAudioSettings {
    if (!object(value)) throw new AuthorApiError('INVALID_PARAMS', '音频设置必须是对象。')
    const next = structuredClone(this.settings)
    if (value.masterVolume !== undefined) next.masterVolume = number(value.masterVolume, '主音量', 1)
    if (value.muted !== undefined) next.muted = flag(value.muted, '静音设置')
    if (value.channels !== undefined) {
      if (!object(value.channels)) throw new AuthorApiError('INVALID_PARAMS', '频道设置必须是对象。')
      for (const [key, setting] of Object.entries(value.channels)) {
        const name = channel(key)
        if (!object(setting)) throw new AuthorApiError('INVALID_PARAMS', '频道设置必须是对象。')
        if (setting.volume !== undefined) next.channels[name].volume = number(setting.volume, '频道音量', 1)
        if (setting.muted !== undefined) next.channels[name].muted = flag(setting.muted, '频道静音设置')
      }
    }
    this.settings = next
    for (const entry of this.entries.values()) { this.applyVolume(entry); this.publish('audio.state.changed', entry) }
    return structuredClone(next)
  }
  private publish(name: AudioEvent['name'], entry: Entry): void {
    const state = this.snapshot(entry)
    for (const listener of this.stateListeners) listener(structuredClone(state))
    this.options.emit({ name, payload: { conversationId: this.conversationId, state } })
  }
  private assertOpen(): void { if (this.closed) throw new AuthorApiError('AUDIO_CLOSED', '原生播放器已经关闭。') }
  dispose(): void { if (this.closed) return; this.closed = true; this.activate(''); this.stateListeners.clear() }
}

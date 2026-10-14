/** System speech stays in the native browser service; no second audio database. */
export class NativeSpeechRuntime {
  private active: { controller: AbortController; finished: Promise<void> } | undefined
  constructor(private readonly view: Window) {}

  voices() {
    const synthesis = this.view.speechSynthesis
    if (!synthesis) throw new Error('System text-to-speech is unavailable in this browser. Install a speech provider for this platform.')
    return synthesis.getVoices().map(voice => ({ name: voice.name, voiceURI: voice.voiceURI, lang: voice.lang,
      default: voice.default, localService: voice.localService }))
  }

  async speak(text: string, settings: Record<string, unknown>, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const synthesis = this.view.speechSynthesis
    const Utterance = (this.view as Window & { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance
    if (!synthesis || !Utterance) throw new Error('System text-to-speech is unavailable in this browser. Install a speech provider for this platform.')
    if (typeof text !== 'string' || !text.trim()) throw new TypeError('Text-to-speech requires non-empty text.')
    if (this.active) { this.active.controller.abort(new Error('Speech was replaced.')); await this.active.finished.catch(() => undefined) }
    signal.throwIfAborted()
    const utterance = new Utterance(text)
    for (const [key, min, max] of [['rate', .1, 10], ['pitch', 0, 2], ['volume', 0, 1]] as const) {
      const value = settings[key]
      if (value === undefined) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new TypeError(`Invalid speech ${key}: ${String(value)}`)
      utterance[key] = value
    }
    if (settings.lang !== undefined) {
      if (typeof settings.lang !== 'string') throw new TypeError('Speech language must be text.')
      utterance.lang = settings.lang
    }
    if (settings.voice !== undefined && settings.voice !== '') {
      const voice = synthesis.getVoices().find(item => item.name === settings.voice || item.voiceURI === settings.voice)
      if (!voice) throw new Error(`System speech voice is not installed: ${String(settings.voice)}`)
      utterance.voice = voice
    }
    const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal])
    let done!: Promise<void>
    done = new Promise<void>((resolve, reject) => {
      const close = () => {
        combined.removeEventListener('abort', cancel)
        utterance.onend = null; utterance.onerror = null
      }
      const cancel = () => { close(); synthesis.cancel(); reject(combined.reason) }
      utterance.onend = () => { close(); resolve() }
      utterance.onerror = event => { close(); reject(new Error(`System speech failed: ${event.error}`)) }
      combined.addEventListener('abort', cancel, { once: true })
      try { synthesis.speak(utterance) } catch (error) { close(); reject(error) }
    })
    const active = { controller, finished: done }; this.active = active
    try { await done } finally { if (this.active === active) this.active = undefined }
  }

  stop(): boolean {
    if (!this.active) return false
    this.active.controller.abort(new Error('Speech was stopped.'))
    return true
  }
  dispose(): void { this.stop() }
}

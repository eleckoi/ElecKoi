/** One application-owned audio runtime shared by scripts, panels and messages. */
export class SharedAudioRuntime {
  constructor(window, report) { this.window = window; this.report = report; this.players = new Map(); }
  player(channel, state, settings) {
    let record = this.players.get(channel);
    if (!record) {
      const audio = new this.window.Audio(); record = { audio, state: { ...state, playlist: [...state.playlist] }, settings }; this.players.set(channel, record);
      for (const event of ['playing', 'pause', 'loadedmetadata', 'seeked', 'timeupdate', 'error', 'ended']) audio.addEventListener(event, () => {
        if (event === 'error') { record.state.status = 'failed'; record.state.error = audio.error?.message || `Audio media error ${audio.error?.code}`; }
        else if (event === 'playing') record.state.status = 'playing';
        else if (event === 'pause' && record.state.status !== 'idle') record.state.status = 'paused';
        else if (event === 'ended') { record.state.status = 'ended'; this.advance(record).catch(error => this.report('audio.state.changed', { ...this.snapshot(record), status: 'failed', error: String(error) })); }
        this.report(event === 'timeupdate' ? 'audio.time.updated' : 'audio.state.changed', this.snapshot(record));
      });
    }
    record.settings = settings; record.audio.volume = settings.volume; record.audio.muted = settings.muted;
    return record;
  }
  snapshot(record) { return { ...record.state, currentTime: Number.isFinite(record.audio.currentTime) ? record.audio.currentTime : 0,
    duration: Number.isFinite(record.audio.duration) ? record.audio.duration : null }; }
  async invoke({ operation, params, state, settings }) {
    const record = this.player(params.channel || state.channel, state, settings), audio = record.audio;
    if (operation === 'settings') { if (!settings.enabled) { audio.pause(); record.state.status = record.state.currentTrack ? 'paused' : 'idle'; } }
    else if (operation === 'playlist') {
      record.state.playlist = [...params.playlist]; record.state.currentIndex = params.playlist.findIndex(track => track.url === record.state.currentTrack?.url);
      if (!params.preservePlayback) { audio.pause(); audio.removeAttribute('src'); audio.load(); Object.assign(record.state, { currentIndex: -1, currentTrack: null, status: 'idle' }); }
    } else if (operation === 'play') {
      if (!settings.enabled) throw new Error(`Audio channel is disabled: ${state.channel}`);
      const track = params.track || record.state.playlist[params.index ?? record.state.currentIndex ?? 0];
      if (!track || typeof track.url !== 'string' || !track.url) throw new Error('Audio play requires an actual track URL');
      let index = record.state.playlist.findIndex(item => item.url === track.url);
      if (index < 0) { record.state.playlist.push(track); index = record.state.playlist.length - 1; }
      Object.assign(record.state, { currentIndex: index, currentTrack: track, status: 'loading' });
      audio.src = track.url; if (params.seconds !== undefined) audio.currentTime = params.seconds;
      try { await audio.play(); record.state.status = 'playing'; }
      catch (error) { record.state.status = 'failed'; record.state.error = String(error); this.report('audio.state.changed', this.snapshot(record)); throw error; }
    } else if (operation === 'pause') { audio.pause(); record.state.status = record.state.currentTrack ? 'paused' : 'idle'; }
    else if (operation === 'resume') { if (!record.state.currentTrack) throw new Error('Audio channel has no selected track'); if (!settings.enabled) throw new Error('Audio channel is disabled'); if (!audio.getAttribute('src')) audio.src = record.state.currentTrack.url; await audio.play(); record.state.status = 'playing'; }
    else if (operation === 'stop') { audio.pause(); audio.removeAttribute('src'); audio.load(); record.state.status = 'idle'; }
    else if (operation === 'seek') { if (!Number.isFinite(params.seconds) || params.seconds < 0) throw new TypeError('Audio seek requires nonnegative seconds'); audio.currentTime = params.seconds; }
    else if (operation !== 'getState') throw new Error(`Unknown audio operation: ${operation}`);
    return this.snapshot(record);
  }
  async advance(record) {
    const { mode } = record.settings, list = record.state.playlist;
    if (!record.settings.enabled || !list.length || mode === 'play_one_and_stop') return;
    let index = mode === 'repeat_one' ? record.state.currentIndex : mode === 'shuffle' ? Math.floor(Math.random() * list.length) : (record.state.currentIndex + 1) % list.length;
    await this.invoke({ operation: 'play', params: { channel: record.state.channel, track: list[index] }, state: record.state, settings: record.settings });
  }
  dispose() { for (const { audio } of this.players.values()) { audio.pause(); audio.removeAttribute('src'); audio.load(); } this.players.clear(); }
}

/** Platform synthesis uses the existing Author RPC to transfer bounded audio chunks to the common Host. */
export async function invokePlatformSpeech(window, request, signal, call) {
  const platform = window.ElecKoiPlatform?.tts || window.dshDesktop?.tts;
  if (!platform) throw new Error('System TTS platform is not attached to this Web host');
  const { operation, params } = request;
  if (operation === 'voices') return await platform.voices();
  if (operation !== 'synthesize') throw new Error(`Unknown platform TTS operation: ${operation}`);
  let cancelTask;
  const cancel = () => { cancelTask = platform.cancel(params.id); cancelTask.catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true }); let native;
  try {
    signal.throwIfAborted(); native = await platform.synthesize(params); signal.throwIfAborted();
    const token = await call('tts.audio.begin', { id: params.id }); let offset = 0;
    while (offset < native.bytes) {
      signal.throwIfAborted(); const part = await platform.readAudio(native.token, offset);
      if (!Number.isFinite(part.bytes) || part.bytes <= 0 || typeof part.base64 !== 'string') throw new Error('System TTS audio transfer did not advance');
      await call('tts.audio.append', { token, base64: part.base64 }); offset += part.bytes;
    }
    const result = await call('tts.audio.finish', { token }); return { ...result, voiceId: native.voiceId };
  } finally {
    signal.removeEventListener('abort', cancel); if (native?.token) await platform.releaseAudio(native.token);
    if (cancelTask) await cancelTask;
  }
}

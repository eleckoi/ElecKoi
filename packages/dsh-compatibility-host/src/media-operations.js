import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
export const MEDIA_METHODS = ['audio.play', 'audio.pause', 'audio.resume', 'audio.stop', 'audio.seek', 'audio.getState',
  'audio.getPlaylist', 'audio.setPlaylist', 'audio.appendPlaylist', 'audio.getSettings', 'audio.setSettings', 'audio.report',
  'tts.settings', 'tts.configure', 'tts.voices', 'tts.synthesize', 'tts.state', 'tts.cancel', 'tts.audio.begin', 'tts.audio.append', 'tts.audio.finish'];
const channels = ['bgm', 'ambient', 'voice'];
const modes = ['repeat_one', 'repeat_all', 'shuffle', 'play_one_and_stop'];
const defaults = () => ({ channels: Object.fromEntries(channels.map(channel => [channel, { enabled: true, mode: 'play_one_and_stop', muted: false, volume: 1 }])) });
const speechDefaults = () => ({ provider: 'system', speed: 1, pitch: 1 });
const initial = channel => ({ channel, playlist: [], currentIndex: -1, currentTrack: null, status: 'idle', currentTime: 0, duration: null });
const voiceDefaults = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse'];
async function writeBytes(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes, offset, bytes.length - offset);
    if (!result.bytesWritten) throw new Error('Audio file write did not advance'); offset += result.bytesWritten;
  }
}

/** Persistent media settings are original compatibility documents; playback remains in the shared Web host. */
export class MediaOperations {
  constructor({ store, callbacks, publish, readConnection, fetchImpl = fetch }) {
    this.store = store; this.callbacks = callbacks; this.publish = publish; this.readConnection = readConnection; this.fetch = fetchImpl;
    this.audio = new Map(); this.jobs = new Map(); this.uploads = new Map(); this.states = new Map(); this.root = join(store.root, 'tts-audio');
  }
  settings() { return this.store.get('audio-settings', 'state') || defaults(); }
  audioState(channel) {
    if (!channels.includes(channel)) throw new Error(`Unknown audio channel: ${channel}`);
    if (!this.audio.has(channel)) this.audio.set(channel, { ...initial(channel), playlist: this.store.get('audio-playlists', channel) || [] });
    return this.audio.get(channel);
  }
  bootstrap() { return { settings: this.settings(), states: Object.fromEntries(channels.map(channel => [channel, this.audioState(channel)])) }; }
  speechSettings() { return this.store.get('tts-settings', 'state') || speechDefaults(); }
  async playback(operation, p) {
    const channel = p.channel || 'bgm', current = this.audioState(channel);
    const result = await this.callbacks.callback('media.audio', { operation, params: p, state: current, settings: this.settings().channels[channel] });
    if (!result || result.channel !== channel || typeof result.status !== 'string' || !Array.isArray(result.playlist)) throw new TypeError('Audio runtime returned an invalid channel state');
    this.audio.set(channel, result); this.store.put('audio-playlists', channel, result.playlist); this.publish({ event: 'audio.state.changed', payload: result }); return result;
  }
  async invoke({ method, params: p }) {
    switch (method) {
      case 'audio.getSettings': return this.settings();
      case 'audio.setSettings': {
        const current = this.settings(), next = { ...current, ...p.settings, channels: { ...current.channels } };
        for (const [channel, value] of Object.entries(p.settings?.channels || {})) {
          this.audioState(channel); const settings = { ...next.channels[channel], ...value };
          if (!modes.includes(settings.mode) || !Number.isFinite(settings.volume) || settings.volume < 0 || settings.volume > 1
            || typeof settings.enabled !== 'boolean' || typeof settings.muted !== 'boolean') throw new TypeError(`Invalid audio settings for ${channel}`);
          next.channels[channel] = settings;
        }
        if (this.callbacks.hasClients()) for (const channel of channels) await this.callbacks.callback('media.audio', { operation: 'settings', params: { channel }, state: this.audioState(channel), settings: next.channels[channel] });
        this.store.put('audio-settings', 'state', next); this.publish({ event: 'audio.settings.changed', payload: next }); return next;
      }
      case 'audio.getPlaylist': return this.audioState(p.channel || 'bgm').playlist;
      case 'audio.setPlaylist': case 'audio.appendPlaylist': {
        const channel = p.channel || 'bgm', previous = this.audioState(channel);
        if (!Array.isArray(p.items) || p.items.some(item => !item || typeof item.url !== 'string' || !item.url)) throw new TypeError('Audio playlist requires actual track URLs');
        const playlist = method === 'audio.appendPlaylist' ? [...previous.playlist, ...p.items] : p.items;
        let state = p.preservePlayback ? { ...previous, playlist, currentIndex: playlist.findIndex(track => track.url === previous.currentTrack?.url) }
          : { ...initial(channel), playlist };
        if (this.callbacks.hasClients()) state = await this.callbacks.callback('media.audio', { operation: 'playlist', params: { ...p, playlist }, state, settings: this.settings().channels[channel] });
        this.store.put('audio-playlists', channel, playlist); this.audio.set(channel, state); this.publish({ event: 'audio.state.changed', payload: state }); return state;
      }
      case 'audio.play': case 'audio.pause': case 'audio.resume': case 'audio.stop': case 'audio.seek': case 'audio.getState': return this.playback(method.slice(6), p);
      case 'audio.report': {
        const channel = p.state?.channel; this.audioState(channel);
        if (typeof p.state.status !== 'string' || !Array.isArray(p.state.playlist)) throw new TypeError('Audio event is missing actual channel state');
        this.audio.set(channel, p.state); this.publish({ event: p.event === 'audio.time.updated' ? p.event : 'audio.state.changed', payload: p.state }); return null;
      }
      case 'tts.settings': return this.speechSettings();
      case 'tts.configure': {
        const settings = { ...this.speechSettings(), ...p.settings };
        if (!['system', 'openai'].includes(settings.provider) || !Number.isFinite(settings.speed) || settings.speed <= 0 || !Number.isFinite(settings.pitch) || settings.pitch <= 0) throw new TypeError('TTS provider, speed, or pitch is invalid');
        return this.store.put('tts-settings', 'state', settings);
      }
      case 'tts.voices': {
        const options = { ...this.speechSettings(), ...p };
        if (options.provider === 'system') return this.callbacks.callback('platform.tts', { operation: 'voices', params: options });
        if (options.provider !== 'openai') throw new Error(`Unknown TTS provider: ${options.provider}`);
        return options.voices || voiceDefaults.map(id => ({ id, name: id, provider: 'openai', declaredBy: 'openai-compatible' }));
      }
      case 'tts.state': {
        if (!p.id) return [...this.states.values()];
        if (!this.states.has(p.id)) throw new Error(`TTS task does not exist: ${p.id}`); return this.states.get(p.id);
      }
      case 'tts.cancel': {
        const job = this.jobs.get(p.id); if (!job) return false; job.abort.abort(new Error('TTS cancelled')); return true;
      }
      case 'tts.synthesize': return this.synthesize(p);
      case 'tts.audio.begin': {
        const job = this.jobs.get(p.id); if (!job) throw new Error('TTS upload has no running task'); job.abort.signal.throwIfAborted();
        await mkdir(this.root, { recursive: true }); const token = randomUUID(), path = join(this.root, token + '.part');
        this.uploads.set(token, { id: p.id, path, handle: await open(path, 'wx'), bytes: 0 }); return token;
      }
      case 'tts.audio.append': {
        const upload = this.uploads.get(p.token); if (!upload) throw new Error('Unknown TTS audio upload');
        const job = this.jobs.get(upload.id); if (!job) throw new Error('TTS task closed during audio upload'); job.abort.signal.throwIfAborted();
        const bytes = Buffer.from(p.base64, 'base64'); await writeBytes(upload.handle, bytes); upload.bytes += bytes.length; return upload.bytes;
      }
      case 'tts.audio.finish': {
        const upload = this.uploads.get(p.token); if (!upload) throw new Error('Unknown TTS audio upload');
        const job = this.jobs.get(upload.id); if (!job) throw new Error('TTS task closed during audio upload'); job.abort.signal.throwIfAborted();
        await upload.handle.close(); upload.closed = true; if (!upload.bytes) throw new Error('System TTS produced no audio');
        const name = p.token + '.wav'; await rename(upload.path, join(this.root, name)); this.uploads.delete(p.token);
        return { url: '/eleckoi/compat/media/' + name, bytes: upload.bytes, mimeType: 'audio/wav' };
      }
      default: throw new Error(`Media method is not connected: ${method}`);
    }
  }
  async synthesize(params) {
    const options = { ...this.speechSettings(), ...params }, id = options.id || randomUUID();
    if (typeof options.text !== 'string' || !options.text.trim()) throw new TypeError('TTS text is empty');
    if (this.jobs.has(id)) throw new Error(`TTS id is already running: ${id}`);
    const abort = new AbortController(), scope = { id, text: options.text, provider: options.provider, messageId: options.messageId ?? null,
      characterName: options.characterName || '', voiceId: options.voiceId || options.voice || null };
    this.jobs.set(id, { abort }); this.states.set(id, { ...scope, status: 'running' }); this.publish({ event: 'tts.started', payload: scope });
    try {
      let audio;
      if (options.provider === 'system') audio = await this.callbacks.callback('platform.tts', { operation: 'synthesize', params: { ...options, id } }, { conversationId: options.conversationId, signal: abort.signal, drainOnAbort: true });
      else if (options.provider === 'openai') {
        const connection = options.connectionId ? await this.readConnection(options.connectionId, options.model || 'tts-1') : {};
        const base = options.url || options.baseUrl || connection.baseURL;
        if (!base) throw new Error('OpenAI TTS requires a configured URL or connectionId');
        const body = { model: options.model || 'tts-1', input: options.text, voice: options.voiceId || options.voice || 'alloy', response_format: options.response_format || 'wav', speed: options.speed,
          ...(options.instructions === undefined ? {} : { instructions: options.instructions }) };
        const key = options.apiKey || connection.apiKey, headers = { 'Content-Type': 'application/json', ...connection.headers, ...options.headers, ...(key ? { Authorization: 'Bearer ' + key } : {}) };
        const response = await this.fetch(/\/audio\/speech\/?$/.test(base) ? base : base.replace(/\/$/, '') + '/audio/speech', { method: 'POST', headers, body: JSON.stringify(body), signal: abort.signal });
        if (!response.ok) throw new Error(`TTS HTTP ${response.status}: ${await response.text()}`);
        if (!response.body) throw new Error('TTS response has no audio body');
        await mkdir(this.root, { recursive: true }); const name = randomUUID() + '.' + ({ wav: 'wav', mp3: 'mp3', opus: 'opus', aac: 'aac', flac: 'flac', pcm: 'pcm' }[body.response_format] || 'bin');
        const path = join(this.root, name), output = await open(path, 'wx'); let bytes = 0;
        try { for await (const chunk of response.body) { abort.signal.throwIfAborted(); await writeBytes(output, chunk); bytes += chunk.length; } }
        catch (error) { await output.close(); await rm(path, { force: true }); throw error; }
        await output.close(); if (!bytes) { await rm(path); throw new Error('TTS response has no audio bytes'); }
        audio = { url: '/eleckoi/compat/media/' + name, bytes, mimeType: response.headers.get('content-type') || 'audio/wav', voiceId: body.voice };
      } else throw new Error(`Unknown TTS provider: ${options.provider}`);
      abort.signal.throwIfAborted();
      if (!audio || typeof audio.url !== 'string' || !Number.isFinite(audio.bytes) || audio.bytes <= 0) throw new TypeError('TTS platform returned no actual audio file');
      const result = { ...scope, ...audio, audio: audio.url, status: 'completed' }; this.states.set(id, result);
      this.publish({ event: 'tts.audioReady', payload: result }); this.publish({ event: 'tts.completed', payload: result }); return result;
    } catch (error) {
      const result = { ...scope, status: abort.signal.aborted ? 'cancelled' : 'failed', error: String(error) };
      this.states.set(id, result); this.publish({ event: 'tts.failed', payload: result }); throw error;
    } finally {
      for (const [token, upload] of this.uploads) if (upload.id === id) { this.uploads.delete(token); if (!upload.closed) await upload.handle.close(); await rm(upload.path, { force: true }); }
      this.jobs.delete(id);
    }
  }
  async serve(request, response) {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const name = new URL(request.url, 'http://localhost').pathname.split('/').at(-1);
    if (!/^[\da-f-]{36}\.(wav|mp3|opus|aac|flac|pcm|bin)$/.test(name || '')) { response.writeHead(404); response.end(); return; }
    const path = join(this.root, name); let file;
    try { file = await stat(path); } catch (error) { if (error.code !== 'ENOENT') throw error; response.writeHead(404); response.end(); return; }
    const type = { wav: 'audio/wav', mp3: 'audio/mpeg', opus: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac', pcm: 'audio/pcm' }[name.split('.').at(-1)] || 'application/octet-stream';
    let start = 0, end = file.size - 1, status = 200;
    if (request.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!range || !range[1] && !range[2]) { response.writeHead(416, { 'Content-Range': `bytes */${file.size}` }); response.end(); return; }
      if (!range[1]) start = Math.max(0, file.size - Number(range[2]));
      else { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
      if (start > end || start >= file.size) { response.writeHead(416, { 'Content-Range': `bytes */${file.size}` }); response.end(); return; } status = 206;
    }
    response.writeHead(status, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
      ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${file.size}` } : {}) });
    if (request.method === 'HEAD') response.end(); else createReadStream(path, { start, end }).pipe(response);
  }
  close() { for (const job of this.jobs.values()) job.abort.abort(new Error('Media Host is closing')); }
}

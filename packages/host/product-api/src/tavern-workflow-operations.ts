import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { LocalMediaStore, type PreparedLocalMedia } from '@eleckoi/dsh-product-data/media'
import { readModelApiKey } from './modelConnection.js'

type Value = Record<string, unknown>
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {}
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const comfy = new Set(['comfy', 'comfyui'])
const workflowDefaults = { width: 1024, height: 1024, steps: 28, cfg: 7, prefix: '', negative: '' }
const mediaTypes: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
const mediaTypeFromPath = (path: string): string => mediaTypes[path.split('.').at(-1)?.toLowerCase() ?? ''] || 'application/octet-stream'
type MediaBridge = { state(): Value; mutateState(update: (state: Value) => void): Promise<void>; store(): LocalMediaStore; characterId(params: Value): string }

/** API-format workflow execution reuses native connections, credentials and the same durable image catalogue. */
export class NativeTavernWorkflowOperations {
  private readonly lifetime = new AbortController()
  private readonly imports = new Map<string, { controller: AbortController; conversationId: string }>()
  private readonly jobs = new Map<string, { controller: AbortController; conversationId: string; promptId?: string; endpoint: URL; headers: Record<string, string> }>()
  constructor(private readonly owner: Context, private readonly media: MediaBridge) {
    owner.effect(() => () => { this.lifetime.abort(new Error('ElecKoi Host 已卸载。')); this.jobs.clear() })
  }
  selected(params: Value): boolean { return params.workflow !== undefined || params.workflowName !== undefined || comfy.has(text(params.source, text(this.media.state().source))) }
  async settings(params: Value): Promise<Value> {
    if (Object.keys(params).some(key => !['conversationId', 'characterId'].includes(key))) await this.media.mutateState(state => {
      state.source = 'comfyui'; const previous = object(state.workflowSettings), next = { ...previous, ...params };
      delete next.conversationId; delete next.characterId;
      if (next.workflow !== undefined) this.graph(next.workflow);
      state.workflowSettings = next;
    })
    return { ...workflowDefaults, ...object(this.media.state().workflowSettings), source: 'comfyui' }
  }
  async providerSettings(params?: Value): Promise<Value> {
    if (params && (params.name !== undefined || params.settings !== undefined)) await this.media.mutateState(state => { state.provider = { name: text(params.name), settings: object(params.settings) } })
    return { name: '', settings: {}, ...object(this.media.state().provider) }
  }
  private graph(value: unknown): Value {
    const graph = typeof value === 'string' ? JSON.parse(value) : object(value);
    if (!graph || typeof graph !== 'object' || Array.isArray(graph) || !Object.keys(graph).length || Array.isArray(graph.nodes)
      || Object.values(graph).some(node => !text(object(node).class_type) || !object(node).inputs)) throw new TypeError('ComfyUI 需要 API-format JSON 工作流。')
    return graph;
  }
  private connection(params: Value) {
    const id = text(params.configId, text(params.modelConfigId)), descriptors = this.owner.settings.describe();
    const entry = object(object(descriptors.find(row => row.ns === 'eleckoi-client-models')?.value).entries)[id];
    if (!id || !entry) throw new Error('请选择已保存的原生 ComfyUI 连接配置。')
    const profile = object(object(descriptors.find(row => row.ns === 'llm-pi-ai')?.value).providers)[id];
    const endpoint = new URL(text(object(entry).base_url, text(object(profile).baseURL)));
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new TypeError('ComfyUI 连接需要 HTTP(S) API 地址。')
    const headers = Object.fromEntries(Object.entries({ ...object(object(profile).headers), ...object(object(entry).custom_headers) }).map(([key, value]) => [key, String(value)]));
    return { id, endpoint, headers, authenticated: !!(object(entry).credentialRef || object(profile).apiKeyEnv) };
  }
  private endpoint(base: URL, path: string): URL { const url = new URL(base); url.pathname = `${base.pathname.replace(/\/+$/, '')}/${path}`; url.search = ''; return url }
  private expand(value: unknown, values: Value): unknown {
    if (typeof value === 'string') {
      const exact = /^\{\{(prompt|negative|seed|width|height|steps|cfg)\}\}$/.exec(value);
      if (exact && values[exact[1]!] !== undefined) return values[exact[1]!];
      return value.replace(/\{\{(prompt|negative|seed|width|height|steps|cfg)\}\}/g, (full, key: string) => values[key] === undefined ? full : String(values[key]));
    }
    if (Array.isArray(value)) return value.map(item => this.expand(item, values));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.expand(item, values)]));
    return value;
  }
  async generate(input: Value): Promise<Value> {
    const params: Value = { ...workflowDefaults, ...object(this.media.state().workflowSettings), ...input }, connection = this.connection(params), generationId = text(params.generationId, randomUUID());
    if (params.seed === undefined || Number(params.seed) < 0) params.seed = Math.floor(Math.random() * 4294967296);
    if (this.jobs.has(generationId)) throw new Error(`ComfyUI 生成编号正在使用：${generationId}`)
    const graph = this.graph(params.workflow), controller = new AbortController(), signal = AbortSignal.any([controller.signal, this.lifetime.signal, AbortSignal.timeout(Number(params.timeout ?? 180000))]);
    const job: { controller: AbortController; conversationId: string; endpoint: URL; headers: Record<string, string>; promptId?: string } = {
      controller, conversationId: text(params.conversationId), endpoint: connection.endpoint, headers: connection.headers,
    };
    this.jobs.set(generationId, job);
    const prepared: PreparedLocalMedia[] = []; let credential = '';
    const request = async (path: string, payload?: Value) => {
      const response = await fetch(this.endpoint(connection.endpoint, path), { method: payload ? 'POST' : 'GET', signal,
        headers: { ...job.headers, ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
      if (!response.ok) throw new Error(`ComfyUI HTTP ${response.status}: ${(await response.text()).slice(0, 600)}`);
      return object(await response.json());
    };
    try {
      if (connection.authenticated) { credential = await readModelApiKey(this.owner, connection.id); job.headers.Authorization = `Bearer ${credential}`; }
      signal.throwIfAborted();
      const accepted = await request('prompt', { prompt: this.expand(graph, params), client_id: randomUUID() });
      job.promptId = text(accepted.prompt_id); if (!job.promptId) throw new Error(`ComfyUI 未接受工作流：${JSON.stringify(accepted)}`)
      let execution: Value;
      for (;;) {
        signal.throwIfAborted(); const history = await request(`history/${encodeURIComponent(job.promptId)}`); execution = object(history[job.promptId]);
        const status = object(execution.status), failure = array(status.messages).map(item => array(item)).find(item => item[0] === 'execution_error');
        if (status.status_str === 'error' || failure) throw new Error(`ComfyUI 工作流失败：${JSON.stringify(failure?.[1] ?? status)}`)
        if (Object.keys(object(execution.outputs)).length || status.completed === true) break;
        await new Promise<void>((resolve, reject) => {
          const done = () => { signal.removeEventListener('abort', cancel); resolve() }, timer = setTimeout(done, Number(params.pollInterval ?? 200));
          const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(signal.reason) }; signal.addEventListener('abort', cancel, { once: true });
          if (signal.aborted) cancel();
        });
      }
      const files = Object.values(object(execution.outputs)).flatMap(value => array(object(value).images)).map(object);
      if (!files.length) throw new Error('ComfyUI 工作流完成，但没有图片输出。视频工作流请注册视频 provider。')
      const rows: Value[] = [];
      for (const [index, file] of files.entries()) {
        const url = this.endpoint(connection.endpoint, 'view'); for (const key of ['filename', 'subfolder', 'type']) if (file[key] !== undefined) url.searchParams.set(key, String(file[key]));
        const response = await fetch(url, { headers: job.headers, signal }); if (!response.ok) throw new Error(`ComfyUI 图片读取失败：HTTP ${response.status}`)
        const type = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png', bytes = Buffer.from(await response.arrayBuffer()); signal.throwIfAborted();
        const stored = this.media.store().prepareImage(`tavern-image:${job.conversationId || 'global'}`, `workflow-${randomUUID()}`, `data:${type};base64,${bytes.toString('base64')}`); prepared.push(stored);
        rows.push({ id: index ? `${generationId}:${index}` : generationId, generationId, conversationId: job.conversationId, characterId: this.media.characterId(params),
          url: stored.reference, reference: stored.reference, prompt: text(params.prompt), negative: text(params.negative), configId: connection.id,
          source: 'comfyui', workflowName: text(params.workflowName), promptId: job.promptId, createdAt: Date.now(), gallery: params.gallery !== false });
      }
      await this.media.mutateState(state => { signal.throwIfAborted(); state.images = [...array(state.images), ...rows] }); prepared.forEach(item => item.commit());
      return { ...rows[0]!, images: rows };
    } catch (error) { prepared.forEach(item => item.rollback());
      if (credential && error instanceof Error && error.message.includes(credential)) throw new Error(error.message.replaceAll(credential, '[已隐藏]'));
      throw error }
    finally { this.jobs.delete(generationId) }
  }
  private async importMedia(params: Value, requiredKind: 'image' | 'video'): Promise<Value> {
    const generationId = text(params.generationId, randomUUID()), controller = new AbortController();
    if (this.imports.has(generationId)) throw new Error(`媒体导入编号正在使用：${generationId}`);
    const signal = AbortSignal.any([controller.signal, this.lifetime.signal]);
    this.imports.set(generationId, { controller, conversationId: text(params.conversationId) });
    try {
      let bytes: Uint8Array | undefined, stream: AsyncIterable<Uint8Array> | undefined, mediaType = text(params.mediaType, text(params.mimeType));
      const source = text(params.url, text(params.data));
      if (/^https?:/i.test(source)) {
        const response = await fetch(source, { signal }); if (!response.ok) throw new Error(`Provider 媒体下载失败：HTTP ${response.status}`)
        mediaType ||= response.headers.get('content-type')?.split(';')[0]?.trim() || '';
        const body = response.body; if (!body) throw new TypeError('Provider 媒体响应为空。')
        stream = (async function* () {
          const reader = body.getReader();
          try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; yield chunk.value } }
          finally { try { await reader.cancel() } finally { reader.releaseLock() } }
        })();
      } else if (/^data:/i.test(source)) {
        const match = /^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(source);
        if (!match) throw new TypeError('Provider 媒体 data URL 无效。')
        mediaType ||= match[1]!.toLowerCase(); bytes = Buffer.from(match[2]!.replace(/\s+/g, ''), 'base64');
      } else if (source.startsWith('eleckoi-media://')) {
        const path = this.media.store().pathForReference(source); if (!path) throw new TypeError('Provider 媒体引用无效。')
        stream = createReadStream(path); mediaType ||= mediaTypeFromPath(path);
      } else if (typeof params.base64 === 'string') {
        bytes = Buffer.from(params.base64, 'base64'); mediaType ||= requiredKind === 'video' ? 'video/mp4' : 'image/png';
      } else if (params.bytes instanceof Uint8Array) {
        bytes = params.bytes; mediaType ||= requiredKind === 'video' ? 'video/mp4' : 'image/png';
      } else if (Array.isArray(params.bytes)) {
        bytes = Uint8Array.from(params.bytes.map(value => { if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) throw new TypeError('Provider binary bytes 无效。'); return value })); mediaType ||= requiredKind === 'video' ? 'video/mp4' : 'image/png';
      } else throw new TypeError('Provider 媒体需要 remote URL、data URL 或 binary bytes。')
      signal.throwIfAborted();
      if (!mediaType.startsWith(`${requiredKind}/`)) throw new TypeError(`Provider 返回的媒体类型不是 ${requiredKind}。`)
      const mediaOwner = `tavern-media:${text(params.conversationId) || 'global'}`, slot = `provider-${requiredKind}-${randomUUID()}`;
      const stored = stream
        ? await this.media.store().prepareStream(mediaOwner, slot, stream, mediaType, signal)
        : bytes ? await this.media.store().prepareBytes(mediaOwner, slot, bytes, mediaType, signal) : undefined;
      if (!stored) throw new TypeError('Provider 媒体为空。')
      const row: Value = { ...params, id: generationId, kind: requiredKind, mediaType, url: stored.reference, reference: stored.reference,
        conversationId: text(params.conversationId), characterId: this.media.characterId(params), createdAt: Date.now(), gallery: params.gallery !== false };
      delete row.signal; delete row.data; delete row.bytes; delete row.base64;
      try {
        await this.media.mutateState(state => { signal.throwIfAborted(); const key = requiredKind === 'image' ? 'images' : 'media'; state[key] = [...array(state[key]), row] });
        stored.commit(); return row
      } catch (error) { stored.rollback(); throw error }
    } finally { this.imports.delete(generationId) }
  }
  async importImage(params: Value): Promise<Value> { return this.importMedia(params, 'image') }
  async importVideo(params: Value): Promise<Value> { return this.importMedia(params, 'video') }
  cancel(params: Value): Value {
    let cancelled = 0; const id = text(params.generationId, text(params.requestId, text(params.id)));
    for (const [generationId, job] of this.jobs) {
      if (id ? id !== generationId : params.conversationId && job.conversationId !== params.conversationId) continue;
      job.controller.abort(new Error('ComfyUI 生成已取消。')); cancelled++;
      // Remove only this queued prompt; never interrupt unrelated jobs on a shared ComfyUI server.
      if (job.promptId) void fetch(this.endpoint(job.endpoint, 'queue'), { method: 'POST', headers: { ...job.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: [job.promptId] }), signal: this.lifetime.signal }).then(response => { if (!response.ok) throw new Error(`ComfyUI 取消队列失败：HTTP ${response.status}`) }).catch(error => this.owner.logger.warn(error));
    }
    for (const [generationId, job] of this.imports) {
      if (id ? id !== generationId : params.conversationId && job.conversationId !== params.conversationId) continue;
      job.controller.abort(new Error('Provider 图片导入已取消。')); cancelled++;
    }
    return { cancelled };
  }
}

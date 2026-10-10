import { ImageHttpTransport } from './image-http-transport.js';
import { randomUUID, randomInt } from 'node:crypto';
import { unzipSync } from 'fflate';
import { setTimeout as delay } from 'node:timers/promises';
import { FormData, ProxyAgent, fetch as proxyFetch } from 'undici';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolveLocalMediaPath } from '@eleckoi/dsh-product-data/media';

export const IMAGE_METHODS = ['media.imageSettings', 'media.generate', 'media.regenerateImage', 'media.cancelImage', 'media.imageState', 'media.gallery', 'media.read', 'media.expressions', 'media.uploadExpression', 'media.importBackground'];
export const IMAGE_TOOL_GROUP = 'builtin:auto-illustration';
const providers = new Set(['openai_image', 'novelai_image', 'novelai', 'comfy', 'auto']);
const clone = value => structuredClone(value);
const text = value => typeof value === 'string' ? value : '';
const apiEnum = value => text(value).toLowerCase() || 'auto';
const parts = (values, separator = ', ') => values.map(text).map(value => value.trim()).filter(Boolean).join(separator);
const safeDiagnosticText = (value, config) => {
  let result = String(value ?? '');
  const secrets = [config.apiKey, ...Object.entries(config.headers || {}).filter(([name]) => /authorization|cookie|api.?key/i.test(name)).map(([, value]) => value)];
  for (const secret of secrets.filter(Boolean)) result = result.split(String(secret)).join('[REDACTED]');
  return result.replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]').replace(/([?&](?:token|key|api_key|access_token)=)[^&\s]+/gi, '$1[REDACTED]').slice(0, 2000);
};
const diagnosticCauses = (error, config) => {
  const causes = [], visited = new Set(), pending = [error];
  while (pending.length && causes.length < 8) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    causes.push({ name: safeDiagnosticText(current.name || 'Error', config), message: safeDiagnosticText(current.message || current, config),
      ...(current.code !== undefined ? { code: safeDiagnosticText(current.code, config) } : {}),
      ...Object.fromEntries(['syscall', 'address'].filter(name => current[name] !== undefined).map(name => [name, safeDiagnosticText(current[name], config)])),
      ...(Number.isSafeInteger(current.port) && current.port >= 0 ? { port: current.port } : {}),
      ...Object.fromEntries(['bytesWritten', 'bytesRead'].filter(name => Number.isSafeInteger(current.socket?.[name]) && current.socket[name] >= 0).map(name => [name, current.socket[name]])) });
    if (current.cause) pending.push(current.cause);
    // Node's multiple-address connection failures keep the socket errors here.
    // Following only .cause discards their codes and connection messages.
    if (Array.isArray(current.errors)) for (const nested of current.errors) pending.push(nested);
  }
  return causes;
};
const endpoint = (base, suffix, fallback = '') => {
  const url = text(base || fallback).trim().replace(/\/+$/, '');
  if (!url) throw new Error('Image provider has no configured service URL');
  return url.endsWith(suffix) ? url : url + suffix;
};

/** Provider parameters are request-local; the selected native model profile stays unchanged. */
export function imageProviderRequest(config, scene) {
  const provider = config.provider, settings = config.imageSettings || {}, options = scene.overrides || {};
  const width = settings.width ?? (provider === 'openai_image' ? 1024 : provider === 'comfy' ? 1024 : 832);
  const height = settings.height ?? (provider === 'openai_image' ? 1536 : provider === 'comfy' ? 1024 : 1216);
  const steps = settings.steps ?? 28, scale = settings.scale ?? 5, sampler = settings.sampler || (provider === 'comfy' ? 'euler' : 'k_euler_ancestral');
  const seed = scene.seed >= 0 ? scene.seed : randomInt(0, 0x100000000);
  if (provider === 'openai_image') {
    const size = settings.size || `${width}x${height}`;
    if (size !== 'auto') {
      const match = /^(\d+)x(\d+)$/.exec(size);
      if (!match) throw new TypeError(`Invalid image size: ${size}`);
      const w = Number(match[1]), h = Number(match[2]);
      if (!(w > 0 && h > 0 && w <= 3840 && h <= 3840 && w % 16 === 0 && h % 16 === 0 && Math.max(w, h) <= Math.min(w, h) * 3 && w * h >= 655360 && w * h <= 8294400)) throw new RangeError('OpenAI image dimensions do not satisfy the provider size contract');
    }
    const base = text(config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
    const url = base.endsWith('/images/generations') ? base : base + (new URL(base).pathname.replace(/\/+$/, '') ? '/images/generations' : '/v1/images/generations');
    return { url, body: { model: config.model || 'gpt-image-2', prompt: scene.prompt + (scene.negativePrompt ? '\n\nAvoid: ' + scene.negativePrompt : ''),
      n: 1, size, quality: apiEnum(settings.quality), background: apiEnum(settings.background), output_format: settings.outputFormat || 'png', ...(config.imageRequest || {}), ...(scene.request || {}) } };
  }
  if (provider === 'novelai_image' || provider === 'novelai') {
    const caption = value => ({ base_caption: value, char_captions: [] });
    const model = config.model || 'nai-diffusion-4-5-full';
    // The official V5 frontend retains v4 captions, but uses version 4 parameters.
    const v5 = /^nai-diffusion-5-(?:full|curated)(?:-inpainting)?$/.test(model);
    return { url: endpoint(config.baseUrl, '/ai/generate-image', 'https://image.novelai.net'), body: {
      action: 'generate', input: scene.prompt, model, ...(v5 ? { use_new_shared_trial: true } : {}), parameters: {
        params_version: v5 ? 4 : 3, width, height, scale: v5 ? settings.scale ?? 7 : scale, sampler, steps, n_samples: 1, seed, negative_prompt: scene.negativePrompt,
        noise_schedule: options.scheduler || 'karras', ...(!v5 ? { qualityToggle: true, ucPreset: 0 } : {}), dynamic_thresholding: false, cfg_rescale: 0,
        ...(v5 && sampler === 'k_euler_ancestral' && options.scheduler !== 'native' ? { deliberate_euler_ancestral_bug: false, prefer_brownian: true } : {}),
        image_format: v5 ? settings.outputFormat || 'png' : 'png', v4_prompt: { caption: caption(scene.prompt), use_coords: false, use_order: true },
        v4_negative_prompt: { caption: caption(scene.negativePrompt), use_coords: false, use_order: !v5, ...(v5 ? { legacy_uc: false } : {}) }, ...(config.imageRequest || {}), ...(scene.request || {}) } } };
  }
  if (provider === 'auto') {
    const override_settings = { ...(config.model ? { sd_model_checkpoint: config.model } : {}),
      ...(options.clipSkip !== undefined ? { CLIP_stop_at_last_layers: options.clipSkip } : {}), ...(options.vae ? { sd_vae: options.vae } : {}) };
    const names = { scheduler: 'scheduler', upscaler: 'hr_upscaler', hires: 'enable_hr', hiresScale: 'hr_scale', denoise: 'denoising_strength', secondPassSteps: 'hr_second_pass_steps', restoreFaces: 'restore_faces' };
    const base = text(config.baseUrl).replace(/\/+$/, '');
    return { url: endpoint(base, base.endsWith('/sdapi/v1') ? '/txt2img' : '/sdapi/v1/txt2img'), body: {
      prompt: scene.prompt, negative_prompt: scene.negativePrompt, seed: scene.seed ?? -1, width, height, steps, cfg_scale: scale, sampler_name: sampler,
      batch_size: 1, n_iter: 1, send_images: true, save_images: false, override_settings_restore_afterwards: true, override_settings,
      ...Object.fromEntries(Object.entries(names).filter(([name]) => options[name] !== undefined).map(([name, key]) => [key, options[name]])), ...(config.imageRequest || {}), ...(scene.request || {}) } };
  }
  if (provider === 'comfy') {
    const workflow = comfyWorkflow(config, { ...scene, seed }, { width, height, steps, scale, sampler });
    return { url: endpoint(config.baseUrl, '/prompt'), body: { prompt: workflow, client_id: randomUUID() } };
  }
  throw new Error(`Selected model is not an image provider: ${provider}`);
}

export function comfyWorkflow(config, scene, settings) {
  const raw = scene.workflow ?? config.imageSettings?.workflow;
  if (!raw) throw new Error('ComfyUI requires an API-format workflow');
  const workflow = typeof raw === 'string' ? JSON.parse(raw) : clone(raw), options = scene.overrides || {}, consumed = new Set();
  const replacements = { prompt: scene.prompt, negative_prompt: scene.negativePrompt, model: config.model, seed: scene.seed, ...settings,
    scheduler: options.scheduler ?? 'normal', denoise: options.denoise ?? 1, clip_skip: -(options.clipSkip ?? 1), vae: options.vae ?? '',
    upscaler: options.upscaler ?? '', hr_upscaler: options.upscaler ?? '', enable_hr: options.hires ?? false, hr_scale: options.hiresScale ?? 1,
    hr_second_pass_steps: options.secondPassSteps ?? 0, restore_faces: options.restoreFaces ?? false };
  const visit = value => {
    if (typeof value === 'string') {
      for (const [name, replacement] of Object.entries(replacements)) if (value === `%${name}%`) { consumed.add(name); return replacement; }
      return value.replace(/%([a-z_]+)%/g, (full, name) => { if (!Object.hasOwn(replacements, name)) return full; consumed.add(name); return String(replacements[name]); });
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
    return value;
  };
  const result = visit(workflow); let samplers = 0;
  for (const node of Object.values(result)) {
    const input = node.inputs; if (!input) continue;
    if (['KSampler', 'KSamplerAdvanced'].includes(node.class_type)) {
      input[Object.hasOwn(input, 'noise_seed') ? 'noise_seed' : 'seed'] = scene.seed;
      input.steps = samplers++ && options.secondPassSteps !== undefined ? options.secondPassSteps : settings.steps;
      if (samplers > 1 && options.secondPassSteps !== undefined) consumed.add('hr_second_pass_steps');
      input.cfg = settings.scale; if (settings.sampler) input.sampler_name = settings.sampler;
      if (options.scheduler !== undefined) { input.scheduler = options.scheduler; consumed.add('scheduler'); }
      if (node.class_type === 'KSampler' && options.denoise !== undefined) { input.denoise = options.denoise; consumed.add('denoise'); }
    } else if (['EmptyLatentImage', 'EmptySD3LatentImage'].includes(node.class_type)) Object.assign(input, { width: settings.width, height: settings.height });
    else if (node.class_type === 'CheckpointLoaderSimple' && config.model) input.ckpt_name = config.model;
    else {
      const bindings = { CLIPSetLastLayer: ['clipSkip', 'stop_at_clip_layer', 'clip_skip'], VAELoader: ['vae', 'vae_name', 'vae'],
        UpscaleModelLoader: ['upscaler', 'model_name', 'upscaler'], ImageScaleBy: ['hiresScale', 'scale_by', 'hr_scale'], LatentUpscaleBy: ['hiresScale', 'scale_by', 'hr_scale'] };
      const binding = bindings[node.class_type];
      if (binding && options[binding[0]] !== undefined) { input[binding[1]] = binding[0] === 'clipSkip' ? -options.clipSkip : options[binding[0]]; consumed.add(binding[2]); }
    }
  }
  const required = { clipSkip: 'clip_skip', scheduler: 'scheduler', vae: 'vae', upscaler: 'upscaler', hires: 'enable_hr', hiresScale: 'hr_scale', denoise: 'denoise', secondPassSteps: 'hr_second_pass_steps', restoreFaces: 'restore_faces' };
  const unused = Object.entries(required).filter(([key, name]) => options[key] !== undefined && !consumed.has(name) && !(key === 'upscaler' && consumed.has('hr_upscaler'))).map(([key]) => key);
  if (unused.length) throw new Error(`ComfyUI workflow does not consume the requested controls: ${unused.join(', ')}`);
  return result;
}

export function sceneImagePrompts(input) {
  const value = typeof input === 'string' ? JSON.parse(input.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) : input;
  const frames = value.frames ?? [value];
  if (!Array.isArray(frames) || !frames.length) throw new TypeError('generate_image requires a nonempty frames array');
  return frames.map((frame, index) => {
    if (!frame || !text(frame.prompt).trim()) throw new TypeError(`Image frame ${index + 1} has no prompt`);
    const frameIndex = frame.id ?? frame.frameIndex ?? index + 1;
    if (!Number.isSafeInteger(frameIndex) || frameIndex < 1) throw new RangeError('Image frame id must be a positive integer');
    return { ...frame, prompt: frame.prompt.trim(), negativePrompt: text(frame.negative_prompt ?? frame.negativePrompt), frameIndex,
      afterParagraph: frame.after_paragraph ?? frame.afterParagraph ?? null, overrides: frame.overrides ?? {} };
  });
}

/** Generated bytes use the original durable AttachmentStore. Companion documents contain refs, never base64. */
export class ImageGenerationOperations {
  constructor({ data, compatibility, readConnection, attachments, inspect, publish, fetchImpl = fetch }) {
    Object.assign(this, { data, compatibility, readConnection, attachments, inspect, publish }); this.fetch = fetchImpl;
    this.nativeImageTransport = new ImageHttpTransport();
    this.store = data.compatibilityStore(); this.jobs = new Map(); this.dispatchers = new Map();
    // A Host restart cannot resume an in-flight provider request. Keep its real saved
    // identity and visibly mark the interrupted attempt so redraw can recover it.
    this.store.atomic(() => {
      for (const state of Object.values(this.store.list('image-generation'))) {
        if (state.status !== 'Generating') continue;
        const interrupted = { ...state, status: 'Failed', generationStatus: 'Failed', errorMessage: 'Image generation was interrupted by Host restart', finishedAt: new Date().toISOString() };
        this.store.put('image-generation', state.attemptId, interrupted);
        if (state.messageId) {
          const scope = `message-extensions:${state.conversationId}`, extension = this.store.get(scope, state.messageId);
          if (extension) this.store.put(scope, state.messageId, { ...extension, images: (extension.images || []).map(image => image.attemptId === state.attemptId ? interrupted : image) });
        }
      }
    });
  }
  currentSettings() { return this.store.get('image-settings', 'state') || {}; }
  async config(p, snapshot) {
    const catalog = await this.compatibility({ method: 'models.list', params: {} }), global = this.currentSettings();
    const selection = snapshot?.toolModelConfigIds?.[IMAGE_TOOL_GROUP];
    const active = this.data.readAgentPresetCatalog().activePresetId, preset = active ? this.data.readAgentPreset(active) : undefined;
    const id = p.configId || p.connectionId || selection || global.configId || preset?.toolModelConfigIds?.[IMAGE_TOOL_GROUP];
    let config = id ? catalog.find(item => item.id === id) : catalog.find(item => providers.has(item.provider) && (!global.source || item.provider === global.source));
    if (!config) throw new Error(id ? `Image model configuration does not exist: ${id}` : 'Select an image model configuration before generating');
    if (!providers.has(config.provider)) throw new Error(`Selected model configuration is not an image provider: ${config.id}`);
    const connection = await this.readConnection(config.id, p.model || config.model);
    config = { ...config, baseUrl: config.baseUrl || connection.baseURL, apiKey: connection.apiKey, headers: { ...connection.headers, ...config.customHeaders },
      model: p.model || config.model, imageSettings: { ...(config.image_settings || {}), ...(config.imageSettings || {}), ...global, ...(p.settings || {}) } };
    for (const name of ['width', 'height', 'steps', 'scale', 'sampler', 'quality', 'background', 'size', 'workflow', 'outputFormat']) if (p[name] !== undefined) config.imageSettings[name] = p[name];
    return config;
  }
  async enabledForSession(snapshot) {
    return !snapshot.disabledToolGroupIds?.includes(IMAGE_TOOL_GROUP) && !!snapshot.toolModelConfigIds?.[IMAGE_TOOL_GROUP];
  }
  async toolDescription(snapshot) {
    const config = await this.config({ configId: snapshot.toolModelConfigIds?.[IMAGE_TOOL_GROUP] }, snapshot), settings = config.imageSettings;
    const count = settings.automaticImageCount === true || settings.automatic_image_count === true
      ? `${settings.automaticImageMin ?? settings.automatic_image_min ?? 1} to ${settings.automaticImageMax ?? settings.automatic_image_max ?? 6}`
      : `${settings.fixedImageCount ?? settings.fixed_image_count ?? 1}`;
    const instructions = settings.promptCompilerInstruction || settings.prompt_compiler_instruction ||
      (config.provider === 'openai_image' ? 'Write detailed natural-language descriptions of visible composition, identity, action, environment and lighting.' : 'Write precise image prompt tags describing the visible character, scene and composition.');
    return `Generate ${count} distinct story illustrations for the final reply using ${config.provider}/${config.model}. ${instructions}\nSupply one frame per illustration, each with a positive id, scene prompt, after_paragraph insertion index and optional scene-specific negative_prompt. Put [[IMAGE:id]] at the matching position in your final reply. The application adds its style prefix and character appearance separately. Preserve story facts and do not invent later events.`;
  }
  async invoke({ method, params: p }) {
    if (method === 'media.expressions') {
      return Object.values(this.store.list(this.expressionScope(p))).map(entry => ({ ...entry, url: entry.path }));
    }
    if (method === 'media.uploadExpression') {
      const label = text(p.label).trim(); if (!label) throw new TypeError('Expression label must not be blank');
      const name = text(p.spriteName).trim() || label, asset = await this.importAsset(p.url, name);
      const entry = { name, label, path: asset.url, ...asset };
      this.store.put(this.expressionScope(p), name, entry);
      this.publish({ event: 'expressions.changed', payload: { characterId: this.expressionCharacter(p), folder: text(p.folder), expression: entry } });
      return entry;
    }
    if (method === 'media.importBackground') return this.importAsset(p.image ?? p.url, 'background');
    if (method === 'media.imageSettings') {
      if (p.value !== undefined) {
        if (!p.value || typeof p.value !== 'object' || Array.isArray(p.value)) throw new TypeError('Image settings must be an object');
        this.store.put('image-settings', 'state', { ...this.currentSettings(), ...p.value });
      }
      const settings = this.currentSettings(), catalog = await this.compatibility({ method: 'models.list', params: {} });
      const config = settings.configId || settings.connectionId || catalog.some(item => providers.has(item.provider)) ? await this.config(settings) : null;
      return { ...(config?.imageSettings || {}), ...settings, ...(config ? { configId: config.id, source: config.provider } : {}) };
    }
    if (method === 'media.generate') return this.generate(p);
    if (method === 'media.regenerateImage') return this.regenerate(p);
    if (method === 'media.cancelImage') return this.cancel(p);
    if (method === 'media.imageState') {
      if (p.conversationId && p.messageId) { const images = (await this.message(p)).images || []; return p.id ? images.find(item => item.id === p.id) || null : images; }
      return p.attemptId ? this.store.get('image-generation', p.attemptId) : Object.values(this.store.list('image-generation'));
    }
    if (method === 'media.gallery') return Object.values(this.store.list('image-gallery')).filter(image => (!p.conversationId || image.conversationId === p.conversationId) && (!p.characterId || image.characterId === p.characterId));
    if (method === 'media.read') {
      const actual = await this.imageInput(p.url); return `data:${actual.mediaType};base64,${Buffer.from(actual.data).toString('base64')}`;
    }
    throw new Error(`Image method is not connected: ${method}`);
  }
  expressionCharacter(p) {
    const id = text(p.characterId) || (p.conversationId ? this.data.readConversationDetails(p.conversationId).metadata.characterId : '') || this.data.readCharacters().active_character_id;
    if (!id) throw new Error('Expression character is not selected');
    return id;
  }
  expressionScope(p) { return `sprites:${this.expressionCharacter(p)}:${text(p.folder)}`; }
  async imageInput(input) {
    if (input && typeof input === 'object') {
      if (input.attachmentId) { const actual = await this.attachments().readImage(input); return { data: actual.data, mediaType: actual.ref.mediaType }; }
      if (input.data || input.base64) return { data: Buffer.from(input.data || input.base64, 'base64'), mediaType: input.mimeType || input.mediaType || 'image/png' };
      input = input.url || input.reference;
    }
    if (!text(input)) throw new TypeError('Image input is required');
    const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/i.exec(input);
    if (match) return { mediaType: match[1], data: match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3])) };
    const assetId = /\/eleckoi\/compat\/images\/([^/?]+)/.exec(input)?.[1];
    if (assetId) {
      const state = assetId.startsWith('asset:') ? this.store.get('image-assets', assetId.slice(6)) : this.store.get('image-generation', assetId);
      if (!state?.attachmentId) throw new Error('Image attachment is not ready');
      const actual = await this.attachments().readImage(state); return { data: actual.data, mediaType: actual.ref.mediaType };
    }
    const local = input.startsWith('eleckoi-media://') ? resolveLocalMediaPath(process.env.ELECKOI_MEDIA_ROOT || '', input)
      : input.startsWith('file://') ? fileURLToPath(input) : /^(?:[A-Z]:[\\/]|\/data\/)/i.test(input) ? input : undefined;
    if (local) {
      const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
      return { data: await readFile(local), mediaType: types[local.split('.').at(-1).toLowerCase()] || 'application/octet-stream' };
    }
    const response = await this.fetch(input); if (!response.ok) throw new Error(`Image read HTTP ${response.status}`);
    return { data: Buffer.from(await response.arrayBuffer()), mediaType: response.headers.get('content-type')?.split(';')[0] || 'image/png' };
  }
  async importAsset(input, name) {
    const image = await this.imageInput(input), ref = await this.attachments().saveImage({ ...image, name });
    this.store.put('image-assets', ref.attachmentId, ref);
    const url = '/eleckoi/compat/images/asset:' + ref.attachmentId;
    return { ...ref, path: url, url, reference: url, mimeType: ref.mediaType };
  }
  async message(p) {
    const messages = await this.compatibility({ method: 'messages.read', params: { conversationId: p.conversationId } });
    const message = messages.find(item => item.id === p.messageId); if (!message) throw new Error(`Image message does not exist: ${p.messageId}`); return message;
  }
  async saveMessageImage(p, image) {
    await this.message(p);
    this.store.atomic(() => {
      const scope = `message-extensions:${p.conversationId}`, extension = this.store.get(scope, p.messageId) || {};
      const images = [...(extension.images || [])], index = images.findIndex(item => item.id === image.id);
      if (index >= 0) images[index] = clone(image); else images.push(clone(image));
      this.store.put(scope, p.messageId, { ...extension, images });
      const metadataScope = `metadata:${p.conversationId}`, metadata = this.store.get(metadataScope, p.messageId) || {};
      this.store.put(metadataScope, p.messageId, { ...metadata, extra: { ...metadata.extra,
        media: [...(metadata.extra?.media || []).filter(item => !images.some(value => item.id === value.id)), ...images.map(value => ({ id: value.id, type: 'image', url: value.url || '', status: value.status, title: value.prompt }))] } });
    });
    // Publish from the existing product service, whose native chat projection owns
    // details reloads; the Author feed also carries per-attempt progress for panels.
    await this.compatibility({ method: 'messages.refresh', params: { conversationId: p.conversationId, ids: [p.messageId], refresh: 'affected' } });
    this.publish({ event: 'messages.changed', payload: { conversationId: p.conversationId, operation: 'media', ids: [p.messageId], messageIds: [p.messageId], refresh: 'affected' } });
  }
  async setState(state) {
    this.store.put('image-generation', state.attemptId, state);
    if (state.messageId) await this.saveMessageImage(state, state);
    this.publish({ event: 'image.state.changed', payload: { conversationId: state.conversationId, messageId: state.messageId, image: state } });
  }
  async request(config, url, signal, body, diagnose = () => {}) {
    const multipart = body && ['novelai', 'novelai_image'].includes(config.provider) && config.imageSettings?.transport !== 'json';
    const headers = { ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}), ...(config.headers || {}), ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) };
    let requestBody;
    if (multipart) {
      // Match NAI Launcher's JSON file part; fetch owns the multipart boundary.
      for (const name of Object.keys(headers)) if (/^(content-type|accept)$/i.test(name)) delete headers[name];
      headers.Accept = 'application/x-zip-compressed';
      requestBody = new FormData();
      requestBody.append('request', new Blob([JSON.stringify(body)], { type: 'application/json' }), 'blob');
    } else if (body) requestBody = JSON.stringify(body);
    let fetchImpl = this.fetch, options = { headers, signal, ...(body ? { method: 'POST', body: requestBody } : {}) };
    const novelai = ['novelai', 'novelai_image'].includes(config.provider);
    if (novelai && this.fetch === fetch) {
      fetchImpl = (target, init) => this.nativeImageTransport.fetch(target, init, config.proxyUrl);
    } else if (!novelai && config.proxyUrl) {
      let dispatcher = this.dispatchers.get(config.proxyUrl);
      if (!dispatcher) { dispatcher = new ProxyAgent(config.proxyUrl); this.dispatchers.set(config.proxyUrl, dispatcher); }
      fetchImpl = proxyFetch; options = { ...options, dispatcher };
    }
    diagnose({ phase: 'provider-request', method: body ? 'POST' : 'GET' });
    const response = await fetchImpl(url, options);
    diagnose({ phase: 'provider-response-headers', response: { status: response.status, contentType: response.headers.get('content-type'),
      contentEncoding: response.headers.get('content-encoding'), contentLength: response.headers.get('content-length') } });
    if (!response.ok) {
      diagnose({ phase: 'provider-error-body' });
      const message = await response.text(); diagnose({ phase: 'provider-http-status' });
      throw new Error(`Image provider HTTP ${response.status}: ${safeDiagnosticText(message, config)}`);
    }
    return response;
  }
  async providerBytes(config, scene, signal, capture, diagnose = () => {}) {
    diagnose({ phase: 'provider-request-build' });
    const request = imageProviderRequest(config, scene); capture(request.body);
    const response = await this.request(config, request.url, signal, request.body, diagnose);
    if (config.provider === 'comfy') {
      diagnose({ phase: 'provider-json-body' });
      const submitted = await response.json();
      if (submitted.error || Object.keys(submitted.node_errors || {}).length || !submitted.prompt_id) throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(submitted)}`);
      const base = config.baseUrl.replace(/\/+$/, '');
      while (true) {
        signal.throwIfAborted();
        const historyResponse = await this.request(config, `${base}/history/${encodeURIComponent(submitted.prompt_id)}`, signal, undefined, diagnose);
        diagnose({ phase: 'provider-json-body' });
        const history = (await historyResponse.json())[submitted.prompt_id];
        if (history) {
          if (history.status?.status_str === 'error') throw new Error(`ComfyUI execution failed: ${JSON.stringify(history.status)}`);
          const image = Object.values(history.outputs || {}).flatMap(output => output.images || [])[0];
          if (image) { const params = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output' });
            const result = await this.request(config, `${base}/view?${params}`, signal, undefined, diagnose); diagnose({ phase: 'provider-image-body' });
            return { bytes: new Uint8Array(await result.arrayBuffer()), mediaType: result.headers.get('content-type')?.split(';')[0] || 'image/png' }; }
          if (history.status?.completed) throw new Error('ComfyUI completed without an image output');
        }
        await delay(250, undefined, { signal });
      }
    }
    const type = response.headers.get('content-type') || '';
    if (type.startsWith('image/')) { diagnose({ phase: 'provider-image-body' }); return { bytes: new Uint8Array(await response.arrayBuffer()), mediaType: type.split(';')[0] }; }
    if (/zip|octet-stream/i.test(type) && ['novelai', 'novelai_image'].includes(config.provider)) {
      diagnose({ phase: 'provider-archive-body' });
      const bytes = new Uint8Array(await response.arrayBuffer()); diagnose({ phase: 'provider-archive-decode' });
      const files = unzipSync(bytes), entry = Object.entries(files).find(([name]) => /\.(png|jpe?g|webp)$/i.test(name));
      if (!entry) throw new Error('NovelAI archive contains no generated image');
      return { bytes: entry[1], mediaType: /\.webp$/i.test(entry[0]) ? 'image/webp' : /\.jpe?g$/i.test(entry[0]) ? 'image/jpeg' : 'image/png' };
    }
    diagnose({ phase: 'provider-json-body' });
    const json = await response.json(); diagnose({ phase: 'provider-image-result' });
    const image = json.data?.[0] || json.images?.[0], encoded = typeof image === 'string' ? image : image?.b64_json || image?.image;
    if (encoded) return { bytes: new Uint8Array(Buffer.from(encoded.replace(/^data:[^;]+;base64,/, ''), 'base64')), mediaType: 'image/png' };
    if (image?.url) { const resourceConfig = new URL(image.url).origin === new URL(request.url).origin ? config : { ...config, apiKey: '', headers: {} };
      const downloaded = await this.request(resourceConfig, image.url, signal, undefined, diagnose); diagnose({ phase: 'provider-image-body' });
      return { bytes: new Uint8Array(await downloaded.arrayBuffer()), mediaType: downloaded.headers.get('content-type')?.split(';')[0] || 'image/png' }; }
    throw new Error(`Image provider returned no image: ${JSON.stringify(json)}`);
  }
  async generate(p, snapshot, externalSignal) {
    if (!text(p.prompt).trim()) throw new TypeError('Image prompt is empty');
    if (p.conversationId) this.data.readConversationDetails(p.conversationId);
    if (p.messageId) await this.message(p);
    const config = await this.config(p, snapshot), id = p.id || randomUUID(), attemptId = randomUUID(), abort = new AbortController();
    const prior = [...this.jobs.values()].find(job => job.id === id && job.conversationId === p.conversationId && job.messageId === p.messageId);
    if (prior) { prior.superseded = true; prior.abort.abort(new Error('Image superseded by a newer redraw')); }
    const job = { id, conversationId: p.conversationId || '', messageId: p.messageId || '', abort, superseded: false };
    this.jobs.set(attemptId, job);
    const relay = () => abort.abort(externalSignal.reason); if (externalSignal?.aborted) relay(); else externalSignal?.addEventListener('abort', relay, { once: true });
    const characterId = p.characterId || (p.conversationId ? this.data.readConversationDetails(p.conversationId).metadata.characterId : '');
    const character = this.data.readCharacters().items.find(item => item.id === characterId);
    const scene = { ...p, prompt: p.prompt.trim(), negativePrompt: text(p.negativePrompt ?? p.negative), overrides: p.overrides || {}, workflow: p.workflow || config.imageSettings.workflow };
    if (p.applyPrefixes !== false) {
      scene.prompt = parts([config.imageSettings.promptPrefix || config.imageSettings.prefix, character?.persona?.image_prompt, scene.prompt], config.provider === 'openai_image' ? '\n\n' : ', ');
      scene.negativePrompt = parts([scene.negativePrompt, config.imageSettings.negativePrompt || config.imageSettings.negative]);
    }
    let state = { ...scene, id, localId: id, attemptId, renderKey: attemptId, conversationId: job.conversationId, messageId: job.messageId, characterId,
      configId: config.id, model: config.model, provider: config.provider, frameIndex: p.frameIndex || 1, afterParagraph: p.afterParagraph ?? null,
      requestSettings: clone(config.imageSettings),
      status: 'Generating', generationStatus: 'Generating', createdAt: new Date().toISOString() };
    delete state.apiKey; delete state.headers; delete state.connection;
    delete state.providerDiagnostics;
    const providerDiagnostics = { phase: 'state-save', responses: [] };
    const diagnose = update => {
      providerDiagnostics.phase = update.phase;
      if (update.method) providerDiagnostics.method = update.method;
      if (update.response) {
        providerDiagnostics.responseCount = (providerDiagnostics.responseCount || 0) + 1;
        providerDiagnostics.responses.push(update.response);
        if (providerDiagnostics.responses.length > 8) providerDiagnostics.responses.shift();
      }
    };
    try {
      await this.setState(state); abort.signal.throwIfAborted();
      const result = await this.providerBytes(config, scene, abort.signal, request => { state.request = request; }, diagnose);
      abort.signal.throwIfAborted();
      diagnose({ phase: 'provider-image-bytes' });
      if (!result.bytes.length) throw new Error('Image provider returned empty image bytes');
      diagnose({ phase: 'attachment-save' });
      const attachment = await this.attachments().saveImage({ data: result.bytes, mediaType: result.mediaType, name: `${attemptId}.png` });
      abort.signal.throwIfAborted();
      const url = `/eleckoi/compat/images/${attemptId}`;
      state = { ...state, ...attachment, status: 'Ready', generationStatus: 'Ready', url, previewUrl: url,
        providerDiagnostics: { ...providerDiagnostics, phase: 'provider-complete' }, finishedAt: new Date().toISOString() };
      if (job.superseded) throw new Error('Image request was superseded');
      diagnose({ phase: 'ready-state-save' });
      await this.setState(state);
      if (p.gallery !== false) this.store.put('image-gallery', id, state);
      return clone(state);
    } catch (error) {
      const causes = diagnosticCauses(error, config), codes = [...new Set(causes.map(cause => cause.code).filter(Boolean))];
      const errorMessage = `${causes[0]?.message || 'Image generation failed'} [${providerDiagnostics.phase}${codes.length ? '; ' + codes.join(', ') : ''}]`;
      state = { ...state, status: abort.signal.aborted ? 'Cancelled' : 'Failed', generationStatus: abort.signal.aborted ? 'Cancelled' : 'Failed', errorMessage,
        providerDiagnostics: { ...providerDiagnostics, causes }, finishedAt: new Date().toISOString() };
      if (!job.superseded) await this.setState(state); else this.store.put('image-generation', attemptId, state);
      const reported = new Error(errorMessage); reported.name = causes[0]?.name || 'Error';
      if (causes[0]?.code) reported.code = causes[0].code;
      if (state.status === 'Failed') reported.imageState = clone(state);
      throw reported;
    } finally { this.jobs.delete(attemptId); externalSignal?.removeEventListener('abort', relay); }
  }
  async regenerate(p) {
    const message = await this.message(p), previous = (message.images || []).find(image => image.id === p.id || image.attachmentId === p.id);
    if (!previous) throw new Error(`Generated image does not exist: ${p.id}`);
    const { width, height, bytes, attachmentId, mediaType, previewUrl, url, ...scene } = previous;
    return this.generate({ ...scene, ...p, settings: { ...previous.requestSettings, ...p.settings }, id: previous.id,
      configId: p.configId || previous.configId, prompt: p.prompt || previous.prompt, applyPrefixes: false });
  }
  async cancel(p) {
    const job = [...this.jobs.entries()].find(([attempt, value]) => p.attemptId ? p.attemptId === attempt : value.id === p.id && value.conversationId === p.conversationId && value.messageId === p.messageId);
    if (!job) return false; job[1].abort.abort(new Error('Image generation cancelled')); return true;
  }
  async generateTool(snapshot, args, signal) {
    if (!await this.enabledForSession(snapshot)) throw new Error('Automatic illustration is disabled or has no selected image model');
    const images = [];
    for (const frame of sceneImagePrompts(args)) {
      try { images.push(await this.generate({ ...frame, conversationId: snapshot.conversationId, configId: snapshot.toolModelConfigIds[IMAGE_TOOL_GROUP] }, snapshot, signal)); }
      catch (error) {
        if (signal?.aborted || error.imageState?.status !== 'Failed') throw error;
        images.push(error.imageState);
      }
    }
    return { images, content: images.map(image => image.status === 'Ready'
      ? `[[IMAGE:${image.frameIndex}]] ${image.url}`
      : `[[IMAGE:${image.frameIndex}]] Failed: ${image.errorMessage}`).join('\n') };
  }
  async commitLatest(conversationId, images, turn) {
    const messages = await this.compatibility({ method: 'messages.read', params: { conversationId } });
    const session = await this.inspect(this.data.runtimeSessionId(conversationId));
    const event = session.events.findLast(item => item.type === 'assistant/message' && item.surfaceOp === 'append' && item.data?.turn === turn);
    const message = event ? messages.find(item => item.sessionEventSeq === event.seq) : undefined;
    if (!message) throw new Error(`Automatic illustration cannot find the saved assistant reply for turn ${turn}`);
    return this.commitToolImages(conversationId, images, message.id);
  }
  async commitToolImages(conversationId, images, messageId) {
    const result = [];
    for (const image of images) { const committed = { ...image, conversationId, messageId }; await this.setState(committed); result.push(committed); }
    return result;
  }
  reportCommitFailure(conversationId, images, turn, error) {
    const diagnostic = { conversationId, turn, imageIds: images.map(image => image.id), errorMessage: error.message || String(error), failedAt: new Date().toISOString() };
    this.store.put('image-commit-errors', `${conversationId}:${turn}`, diagnostic);
    this.publish({ event: 'image.commit.failed', payload: diagnostic });
  }
  async serve(request, response) {
    const path = new URL(request.url, 'http://localhost').pathname, attempt = path.split('/').at(-1), state = attempt.startsWith('asset:') ? this.store.get('image-assets', attempt.slice(6)) : this.store.get('image-generation', attempt);
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    if (!state?.attachmentId) { response.writeHead(404); response.end('Generated image is unavailable'); return; }
    const actual = await this.attachments().readImage(state), bytes = Buffer.from(actual.data);
    const headers = { 'Content-Type': actual.ref.mediaType, 'Content-Length': bytes.length, 'Cache-Control': 'private, max-age=31536000, immutable', 'Accept-Ranges': 'bytes' };
    let start = 0, end = bytes.length - 1, status = 200;
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!match || !match[1] && !match[2]) { response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); response.end(); return; }
      start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2])); end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end;
      if (start > end || start >= bytes.length) { response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); response.end(); return; }
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${bytes.length}`; headers['Content-Length'] = end - start + 1;
    }
    response.writeHead(status, headers); response.end(request.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
  }
  close() { this.nativeImageTransport.close(); for (const job of this.jobs.values()) job.abort.abort(new Error('Image Host closed')); return Promise.all([...this.dispatchers.values()].map(dispatcher => dispatcher.close())); }
}

const nativeSources = new Set(['novel', 'novelai', 'novelai_image', 'comfy', 'comfyui']);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function createNativeNetwork(rt) {
  const view = rt.window, jobs = new Map();
  rt.addCleanup(() => { for (const controller of jobs.values()) controller.abort(new Error('Network document closed.')); jobs.clear(); });
  return { fetch: async (url, init = {}) => {
    const request = new view.Request(url, init), id = view.crypto.randomUUID(), controller = new view.AbortController();
    const signal = init.signal ? view.AbortSignal.any([init.signal, controller.signal]) : controller.signal;
    signal.throwIfAborted(); jobs.set(id, controller);
    const cancel = () => { void rt.request('network.cancel', { requestId: id }).catch(error => view.console.error(error)); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const bytes = ['GET', 'HEAD'].includes(request.method) ? undefined : new Uint8Array(await request.arrayBuffer());
      signal.throwIfAborted();
      const binary = bytes ? Array.from(bytes, value => String.fromCharCode(value)).join('') : undefined;
      const result = await rt.request('network.fetch', { url: request.url, method: request.method, headers: Object.fromEntries(request.headers),
        ...(binary === undefined ? {} : { body: view.btoa(binary) }), redirect: request.redirect, requestId: id, timeout: init.timeout });
      signal.throwIfAborted();
      const body = Uint8Array.from(view.atob(result.body), character => character.charCodeAt(0));
      const response = new view.Response([101, 204, 205, 304].includes(result.status) || request.method === 'HEAD' ? null : body,
        { status: result.status, statusText: result.statusText, headers: result.headers });
      Object.defineProperties(response, { url: { value: result.url }, redirected: { value: result.redirected } });
      return response;
    } catch (error) { signal.throwIfAborted(); throw error; }
    finally { signal.removeEventListener('abort', cancel); jobs.delete(id); }
  } };
}

/** Provider functions remain in the persistent shared JS realm; native storage owns accepted images. */
export function createMediaServices(rt, net) {
  const shared = rt.shared, providers = shared.mediaProviders ??= new Map(), jobs = shared.mediaProviderJobs ??= new Map();
  const view = rt.window;
  const request = (method, input) => {
    const params = input && typeof input === 'object' ? { ...input } : input;
    if (params && typeof params === 'object') delete params.signal;
    return rt.request(`media.${method}`, { args: params === undefined ? [] : [params] });
  };
  const select = async input => {
    const selected = await request('providerSettings');
    return { selected, id: input.source ?? input.provider ?? selected.name };
  };
  const generate = async (kind, input = {}) => {
    const generationId = input.generationId || input.requestId || view.crypto.randomUUID();
    if (jobs.has(generationId)) throw new Error(`Media request id is already in use: ${generationId}`);
    const controller = new view.AbortController(), signal = input.signal ? view.AbortSignal.any([input.signal, controller.signal]) : controller.signal;
    const job = { controller, provider: undefined, conversationId: input.conversationId ?? rt.snapshot.context?.conversationId ?? '', owner: rt, kind, nativeStarted: false, explicitCancel: false }; jobs.set(generationId, job);
    const removeCleanup = rt.addCleanup(() => controller.abort(new Error('Media document closed.')));
    let cancelReject;
    const cancelled = new Promise((_resolve, reject) => { cancelReject = reject; });
    const cancel = () => {
      cancelReject(signal.reason);
      if (job.provider?.cancel) Promise.resolve().then(() => job.provider.cancel(generationId)).catch(error => view.console.error(error));
      if (job.nativeStarted && !job.explicitCancel) void request('cancel', { generationId }).catch(error => view.console.error(error));
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      signal.throwIfAborted();
      const { selected, id } = await Promise.race([select(input), cancelled]); signal.throwIfAborted();
      if (!id || nativeSources.has(id)) {
        job.nativeStarted = true;
        return await Promise.race([request(kind === 'image' ? 'generate' : 'video', { ...input, conversationId: job.conversationId, generationId }), cancelled]);
      }
      const provider = providers.get(id);
      if (!provider) throw new Error(`Media provider is not registered: ${id}`);
      if (!provider.kinds.includes(kind)) throw new Error(`Media provider ${id} does not support ${kind}.`);
      job.provider = provider;
      const result = await Promise.race([provider.generate({ ...object(selected.settings), ...input, conversationId: job.conversationId, source: id, kind, generationId },
        { signal, network: net, conversationId: job.conversationId }), cancelled]);
      signal.throwIfAborted();
      const media = typeof result === 'string' ? { url: result } : { ...object(result) };
      if ((!media.url || typeof media.url !== 'string') && !media.data && !media.bytes && !media.base64) throw new Error(`Media provider ${id} returned no remote URL or binary media.`);
      let bytes;
      if (Object.prototype.toString.call(media.bytes) === '[object ArrayBuffer]') bytes = new Uint8Array(media.bytes);
      else if (ArrayBuffer.isView(media.bytes)) bytes = new Uint8Array(media.bytes.buffer, media.bytes.byteOffset, media.bytes.byteLength);
      else if (Array.isArray(media.bytes)) bytes = Uint8Array.from(media.bytes);
      if (bytes) {
        if (typeof bytes.toBase64 === 'function') media.base64 = bytes.toBase64();
        else {
          const chunks = []; for (let offset = 0; offset < bytes.byteLength; offset += 32768) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
          media.base64 = view.btoa(chunks.join(''));
        }
        delete media.bytes;
      }
      if (kind === 'image') { job.nativeStarted = true; return await request('importImage', { ...input, ...media, conversationId: job.conversationId, source: id, generationId }); }
      job.nativeStarted = true;
      return await request('importVideo', { ...input, ...media, conversationId: job.conversationId, source: id, generationId });
    } finally { signal.removeEventListener('abort', cancel); removeCleanup(); jobs.delete(generationId); }
  };
  return new Proxy({
    providers: () => [{ name: 'novelai_image', kinds: ['image'], builtin: true }, { name: 'comfyui', kinds: ['image'], builtin: true },
      ...Array.from(providers, ([name, provider]) => ({ name, kinds: [...provider.kinds], builtin: false }))],
    registerProvider: (name, provider) => {
      if (typeof name !== 'string' || !name.trim() || nativeSources.has(name) || typeof provider?.generate !== 'function'
        || !Array.isArray(provider.kinds) || !provider.kinds.length || provider.kinds.some(kind => !['image', 'video'].includes(kind))) throw new TypeError('Media provider needs a name, image/video kinds and generate callback.');
      if (providers.has(name)) throw new Error(`Media provider already registered: ${name}`);
      providers.set(name, provider); let releaseCleanup = () => {};
      const unregister = () => {
        if (providers.get(name) !== provider) return false;
        providers.delete(name); for (const job of jobs.values()) if (job.provider === provider) job.controller.abort(new Error('Media provider unregistered.'));
        releaseCleanup(); return true;
      };
      releaseCleanup = rt.addCleanup(unregister); return unregister;
    },
    imageSettings: async input => {
      const { selected, id } = await select(object(input));
      if (id && !nativeSources.has(id)) {
        if (!providers.has(id)) throw new Error(`Media provider is not registered: ${id}`);
        const value = input ? await request('providerSettings', { name: id, settings: { ...object(selected.settings), ...input } }) : selected;
        return { ...object(value.settings), source: id };
      }
      if (input?.source) await request('providerSettings', { name: '', settings: {} });
      return request('imageSettings', input);
    },
    generate: input => generate('image', input), video: input => generate('video', input),
    cancel: async (input = {}) => {
      let cancelled = 0; const id = input.generationId || input.requestId || input.id;
      for (const [jobId, job] of jobs) if (id ? jobId === id : job.conversationId === (input.conversationId ?? rt.snapshot.context?.conversationId)) {
        if (job.controller.signal.aborted) continue;
        job.explicitCancel = true; job.controller.abort(new Error('Media generation cancelled.')); if (!job.nativeStarted) cancelled++;
      }
      const native = await request('cancel', input); return { ...native, cancelled: cancelled + Number(native.cancelled || 0) };
    },
  }, { get: (target, name) => target[name] ?? ((...args) => rt.request(`media.${String(name)}`, { args })) });
}

/**
 * Local bindings adapt legacy method signatures to concrete generated Remote
 * calls. This registry is not a new Host wire protocol or a routing fallback.
 */
export function createHostAdapter(bindings = {}, options = {}) {
  const methods = new Map(Object.entries(bindings));
  for (const [method, handler] of methods) {
    if (typeof handler !== 'function') throw new TypeError(`Host binding must be a function: ${method}`);
  }
  const listeners = new Map();
  const active = new Set();
  let closed = false;
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const adapter = {
    methods: () => [...methods.keys()],
    has: method => methods.has(method),
    tokenizeSync(payload) {
      if (closed) throw fail('HOST_CLOSED', 'The shared compatibility Host adapter has closed');
      if (!options.tokenizeSync) throw fail('METHOD_NOT_AVAILABLE', 'Synchronous provider tokenizer is not connected');
      const result = options.tokenizeSync(payload);
      if (result?.then) throw new TypeError('Synchronous provider tokenizer cannot return a Promise');
      return result;
    },
    request(method, params = {}, { signal } = {}) {
      if (closed) return Promise.reject(fail('HOST_CLOSED', 'The shared compatibility Host adapter has closed'));
      const handler = methods.get(method);
      if (!handler) return Promise.reject(fail('METHOD_NOT_AVAILABLE', `Host capability is not connected: ${method}`));
      const controller = new AbortController();
      active.add(controller);
      const aborted = () => controller.abort(signal.reason);
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) aborted();
      let cancel;
      const cancelled = new Promise((resolve, reject) => {
        cancel = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', cancel, { once: true });
        if (controller.signal.aborted) cancel();
      });
      const operation = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw controller.signal.reason;
        return handler(params, { signal: controller.signal });
      });
      // A carrier may not support cancellation. End the API call immediately and
      // keep observing its eventual result, rather than leaving callers pending.
      return Promise.race([operation, cancelled]).finally(() => {
        active.delete(controller);
        signal?.removeEventListener('abort', aborted);
        controller.signal.removeEventListener('abort', cancel);
      });
    },
    on(name, listener) {
      if (closed) throw fail('HOST_CLOSED', 'The shared compatibility Host adapter has closed');
      if (typeof listener !== 'function') throw new TypeError('Host event listener must be a function');
      const group = listeners.get(name) || new Set();
      group.add(listener); listeners.set(name, group);
      return () => { group.delete(listener); if (!group.size) listeners.delete(name); };
    },
    async publish(name, payload) {
      if (closed) throw fail('HOST_CLOSED', 'The shared compatibility Host adapter has closed');
      const errors = [];
      for (const listener of [...(listeners.get(name) || [])]) {
        try { await listener(payload); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, `Compatibility Host event failed: ${name}`);
    },
    async publishBatch(events) {
      for (const event of events) await adapter.publish(event.name, event.payload);
    },
    dispose() {
      if (closed) return;
      closed = true;
      for (const controller of active) controller.abort(fail('HOST_CLOSED', 'The compatibility Host adapter was disposed'));
      active.clear(); listeners.clear();
      options.dispose?.();
    },
  };
  return Object.freeze(adapter);
}

/** Project generated RemoteResult without replacing its actual error. */
export function unwrapRemote(result) {
  if (!result || typeof result.ok !== 'boolean') throw new TypeError('Expected a generated DSH RemoteResult');
  if (!result.ok) throw Object.assign(new Error(result.error?.message || 'DSH Remote failed'), result.error);
  return result.value;
}

/** Bind the generated eleckoiCompatibility Remote, retaining an explicit method registry. */
export function createRemoteHostAdapter(remote, options) {
  if (!remote || typeof remote.invoke !== 'function') throw new TypeError('A generated eleckoiCompatibility Remote is required');
  if (!Array.isArray(options?.methods)) throw new TypeError('Explicit implemented Host method names are required');
  const bindings = Object.fromEntries(options.methods.map(method => [method,
    async params => unwrapRemote(await remote.invoke({ method, params }))]));
  return createHostAdapter(bindings, options);
}

import { randomUUID } from 'node:crypto';

/** Callable objects remain in Web JS; only arguments/results use the generated Author Remote. */
export class WebCallbackBroker {
  constructor(publish) { this.publish = publish; this.clients = new Map(); this.pending = new Map(); }
  attach(clientId, conversationId) {
    if (!clientId) throw new TypeError('callback.attach requires clientId');
    this.clients.set(clientId, { conversationId }); return null;
  }
  detach(clientId) {
    this.clients.delete(clientId);
    for (const [id, task] of this.pending) if (task.clientId === clientId) { this.pending.delete(id); task.reject(new Error('Shared Web callback owner detached')); }
    return null;
  }
  request(method, payload, { conversationId, signal, clientId, drainOnAbort = false } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const entries = [...this.clients];
    // An empty conversation id is the shared-host wildcard used by the
    // bootstrap/test realm. Prefer a real conversation owner when both the
    // persistent WebView and that wildcard client are attached; otherwise the
    // wildcard must remain usable even when a second WebView is present.
    const selected = clientId
      || (conversationId ? entries.find(([, client]) => client.conversationId === conversationId)?.[0] : undefined)
      || entries.find(([, client]) => client.conversationId === '')?.[0]
      || (!conversationId ? entries[0]?.[0] : this.clients.size === 1 ? entries[0]?.[0] : undefined);
    if (!selected || !this.clients.has(selected)) return Promise.reject(Object.assign(new Error(`Shared Web callback is not attached: ${method}`), { code: 'WEB_CALLBACK_UNAVAILABLE' }));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const stop = () => { this.pending.delete(id); signal?.removeEventListener('abort', abort); };
      let cancelled = false;
      const abort = () => {
        cancelled = true;
        this.publish({ event: 'callback.cancel', payload: { id, clientId: selected } });
        // The official tool pipeline drains a body that has already started.
        // JS cannot be forcibly killed; its cancellation acknowledgement is its settled reply.
        if (!drainOnAbort) { stop(); reject(signal.reason); }
      };
      this.pending.set(id, { clientId: selected,
        resolve(value) { stop(); if (cancelled) reject(signal.reason); else resolve(value); },
        reject(error) { stop(); reject(cancelled ? signal.reason : error); } });
      signal?.addEventListener('abort', abort, { once: true });
      this.publish({ event: 'callback.request', payload: { id, clientId: selected, method, payload, ...(drainOnAbort ? { drainOnAbort: true } : {}) } });
    });
  }
  respond({ id, clientId, value, error }) {
    const task = this.pending.get(id);
    if (!task) return false;
    if (task.clientId !== clientId) throw new Error('Callback response came from a different shared realm');
    if (error) task.reject(Object.assign(new Error(error.message || String(error)), typeof error === 'object' ? error : {}));
    else task.resolve(value);
    return true;
  }
  close() {
    for (const task of this.pending.values()) task.reject(new Error('Shared callback Host is closing'));
    this.pending.clear(); this.clients.clear();
  }
}

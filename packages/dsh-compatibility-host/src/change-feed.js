/** Every reconnect starts with an authoritative rehydration marker. */
export class AuthorChangeFeed {
  constructor() { this.subscribers = new Set(); this.closed = false; }
  publish(value) { for (const subscriber of this.subscribers) { subscriber.queue.push(value); subscriber.wake?.(); } }
  stream(signal) {
    if (this.closed) throw new Error('Author change feed is closed');
    const subscriber = { queue: [{ event: 'plugins.snapshot', payload: null }], closed: false, wake: null };
    this.subscribers.add(subscriber);
    const stop = () => { subscriber.closed = true; subscriber.wake?.(); this.subscribers.delete(subscriber); };
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
    return (async function* () {
      try { while (!subscriber.closed) { if (subscriber.queue.length) yield subscriber.queue.shift(); else await new Promise(resolve => { subscriber.wake = resolve; }); } }
      finally { signal.removeEventListener('abort', stop); stop(); }
    })();
  }
  close() { this.closed = true; for (const subscriber of this.subscribers) { subscriber.closed = true; subscriber.wake?.(); } this.subscribers.clear(); }
}

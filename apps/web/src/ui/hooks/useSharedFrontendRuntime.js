import { useEffect, useState, useSyncExternalStore } from 'react';

const waiting = Object.freeze({ status: 'starting', error: '', methods: [] });
const noSubscription = () => () => {};
const waitingSnapshot = () => waiting;

/** The application owns the realm; a chat or iframe only subscribes to it. */
export function useSharedFrontendRuntime() {
  const [runtime, setRuntime] = useState(() => globalThis.window?.__ElecKoiClientCompatibility || null);
  useEffect(() => {
    const changed = () => setRuntime(window.__ElecKoiClientCompatibility || null);
    window.addEventListener('eleckoi:shared-runtime', changed); changed();
    return () => window.removeEventListener('eleckoi:shared-runtime', changed);
  }, []);
  const state = useSyncExternalStore(runtime?.subscribe || noSubscription, runtime?.getSnapshot || waitingSnapshot, waitingSnapshot);
  return { runtime, state };
}

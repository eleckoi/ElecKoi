import { useCallback, useEffect, useRef, useState } from 'react';

// Debounce text edits and serialize writes so an older response cannot replace a newer draft.
export function useProfileAutosave({ enabled, profile, persist, onSaved, onError }) {
  const callbacks = useRef();
  callbacks.current = { enabled, profile, persist, onSaved, onError };
  const queue = useRef({ draft: profile, revision: 0, savedRevision: 0, running: false,
    requested: false, composing: false, timer: null, mounted: true, promise: null });
  const [saving, setSaving] = useState(false);
  const hasPendingChanges = useCallback(() => {
    const q = queue.current;
    return q.running || q.revision !== q.savedRevision;
  }, []);
  const flush = useCallback(() => {
    const q = queue.current;
    clearTimeout(q.timer);
    if (!callbacks.current.enabled || q.composing) return Promise.resolve(false);
    if (q.running) { q.requested = true; return q.promise; }
    if (q.revision === q.savedRevision) return Promise.resolve(true);
    q.running = true;
    if (q.mounted) setSaving(true);
    q.promise = (async () => {
      let succeeded = false;
      do {
        q.requested = false;
        const revision = q.revision, candidate = q.draft;
        try {
          const saved = await callbacks.current.persist(candidate);
          succeeded = true;
          if (revision === q.revision) {
            q.savedRevision = revision;
            if (q.mounted) callbacks.current.onSaved(saved);
          }
        } catch (error) {
          succeeded = false;
          if (q.mounted) callbacks.current.onError(error);
          if (!q.requested) break;
        }
      } while (q.requested && q.revision !== q.savedRevision && !q.composing);
      q.running = false;
      if (q.mounted) setSaving(false);
      return succeeded;
    })();
    return q.promise;
  }, []);
  const stage = useCallback((patch, { delay = 400, composing = false } = {}) => {
    if (!callbacks.current.enabled) return;
    const q = queue.current;
    q.draft = { ...(hasPendingChanges() ? q.draft : callbacks.current.profile), ...patch };
    q.revision++;
    q.composing = composing;
    clearTimeout(q.timer);
    if (!composing) q.timer = setTimeout(flush, delay);
  }, [flush, hasPendingChanges]);
  useEffect(() => {
    queue.current.mounted = true;
    return () => {
      // Navigation must not discard an edit whose debounce has not elapsed yet.
      queue.current.composing = false;
      void flush();
      queue.current.mounted = false;
    };
  }, [flush]);
  return { saving, stage, flush, hasPendingChanges };
}

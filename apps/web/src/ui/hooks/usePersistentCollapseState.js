import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useDshDisplayPreferences } from '../state/DisplayPreferencesContext.jsx';
import { normalizeCollapsedGroups } from '../state/listCollapseState.js';

const collapseStateCache = new Map();
const EMPTY_SNAPSHOT = Object.freeze({ status: 'loading', ui: Object.freeze({}) });
const EMPTY_SUBSCRIBE = () => () => {};
const GET_EMPTY_SNAPSHOT = () => EMPTY_SNAPSHOT;

export function usePersistentCollapseState(area, defaults = {}, validKeys) {
  const preferences = useDshDisplayPreferences();
  const snapshot = useSyncExternalStore(
    preferences?.subscribe || EMPTY_SUBSCRIBE,
    preferences?.getSnapshot || GET_EMPTY_SNAPSHOT,
    preferences?.getSnapshot || GET_EMPTY_SNAPSHOT,
  );
  const cachedState = collapseStateCache.get(area);
  const [collapsedGroups, setCollapsedGroupsState] = useState(() => normalizeCollapsedGroups(cachedState, defaults, validKeys));
  const [hydrated, setHydrated] = useState(() => !preferences || collapseStateCache.has(area));
  const changedBeforeHydrationRef = useRef(false);
  const lastPersistedSignatureRef = useRef(null);
  const defaultsRef = useRef(defaults);
  const validKeysRef = useRef(validKeys);
  defaultsRef.current = defaults;
  validKeysRef.current = validKeys;
  const validKeysSignature = validKeys ? JSON.stringify(validKeys) : null;

  useEffect(() => {
    if (snapshot.status !== 'ready' || hydrated) return;
    if (!changedBeforeHydrationRef.current) {
      const saved = snapshot.ui?.list_collapse_state?.[area];
      const normalized = normalizeCollapsedGroups(saved, defaultsRef.current, validKeysRef.current);
      collapseStateCache.set(area, normalized);
      lastPersistedSignatureRef.current = JSON.stringify(normalized);
      setCollapsedGroupsState(normalized);
    }
    setHydrated(true);
  }, [area, hydrated, snapshot.status, snapshot.ui]);

  useEffect(() => {
    if (validKeysSignature === null) return;
    const currentValidKeys = JSON.parse(validKeysSignature);
    setCollapsedGroupsState((current) => {
      const normalized = normalizeCollapsedGroups(current, defaultsRef.current, currentValidKeys);
      if (hydrated) collapseStateCache.set(area, normalized);
      return normalized;
    });
  }, [area, hydrated, validKeysSignature]);

  useEffect(() => {
    if (!hydrated || !preferences) return;
    const signature = JSON.stringify(collapsedGroups);
    if (signature === lastPersistedSignatureRef.current) return;
    lastPersistedSignatureRef.current = signature;
    void preferences.updateUi((current) => ({
      ...current,
      list_collapse_state: {
        ...(current.list_collapse_state || {}),
        [area]: collapsedGroups,
      },
    })).catch(() => {
      lastPersistedSignatureRef.current = null;
    });
  }, [area, collapsedGroups, hydrated, preferences]);

  function setCollapsedGroups(value) {
    changedBeforeHydrationRef.current = true;
    setCollapsedGroupsState((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      const normalized = normalizeCollapsedGroups(next, defaultsRef.current, validKeysRef.current);
      collapseStateCache.set(area, normalized);
      return normalized;
    });
  }

  return [collapsedGroups, setCollapsedGroups, hydrated];
}

import { useEffect, useRef, useState } from 'react';
import { getListCollapseState, saveListCollapseState } from '../api/settingsApi.js';
import { normalizeCollapsedGroups } from '../model/listCollapseState.js';

export function usePersistentCollapseState(area, defaults = {}, validKeys) {
  const [collapsedGroups, setCollapsedGroupsState] = useState(() => normalizeCollapsedGroups({}, defaults));
  const [hydrated, setHydrated] = useState(false);
  const changedBeforeHydrationRef = useRef(false);
  const defaultsRef = useRef(defaults);
  const validKeysRef = useRef(validKeys);
  defaultsRef.current = defaults;
  validKeysRef.current = validKeys;
  const validKeysSignature = validKeys ? JSON.stringify(validKeys) : null;

  useEffect(() => {
    let active = true;
    getListCollapseState(area).then((saved) => {
      if (!active) return;
      if (!changedBeforeHydrationRef.current) {
        setCollapsedGroupsState(normalizeCollapsedGroups(saved, defaultsRef.current, validKeysRef.current));
      }
      setHydrated(true);
    }).catch(() => {
      if (active) setHydrated(true);
    });
    return () => { active = false; };
  }, [area]);

  useEffect(() => {
    if (validKeysSignature === null) return;
    const currentValidKeys = JSON.parse(validKeysSignature);
    setCollapsedGroupsState((current) => normalizeCollapsedGroups(current, defaults, currentValidKeys));
  }, [validKeysSignature]);

  useEffect(() => {
    if (!hydrated) return;
    void saveListCollapseState(area, collapsedGroups).catch(() => {});
  }, [area, collapsedGroups, hydrated]);

  function setCollapsedGroups(value) {
    changedBeforeHydrationRef.current = true;
    setCollapsedGroupsState(value);
  }

  return [collapsedGroups, setCollapsedGroups];
}

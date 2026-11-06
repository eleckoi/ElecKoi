import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveFailure } from '../../utils/failureText.js';

export function useCharacterConfigurationDraft({ characterId, configuration, onDirtyChange, label = '设定库', onAdopt, prepareSave, rebaseAfterSave, saveShortcut = true }) {
  const tUi = useProductTranslation();
  const [library, setLibrary] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const libraryRef = useRef(null);
  const persistedRef = useRef(null);
  const savePromiseRef = useRef(null);
  const callbacks = useRef({ onAdopt, prepareSave, rebaseAfterSave });
  callbacks.current = { onAdopt, prepareSave, rebaseAfterSave };
  const dirty = useMemo(() => JSON.stringify(library) !== JSON.stringify(persisted), [library, persisted]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (saveNotice !== 'saved') return undefined;
    const timeout = window.setTimeout(() => setSaveNotice(''), 1600);
    return () => window.clearTimeout(timeout);
  }, [saveNotice]);
  useEffect(() => {
    let active = true;
    setError('');
    setSaveNotice('');
    libraryRef.current = null;
    persistedRef.current = null;
    setLibrary(null);
    setPersisted(null);
    const adopt = loaded => {
      if (!active || savePromiseRef.current || (libraryRef.current && persistedRef.current
        && JSON.stringify(libraryRef.current) !== JSON.stringify(persistedRef.current))) return;
      libraryRef.current = loaded;
      persistedRef.current = loaded;
      setLibrary(loaded);
      setPersisted(loaded);
      callbacks.current.onAdopt?.(loaded);
    };
    const stop = configuration.subscribe((kind, id, snapshot) => {
      if (kind === 'configuration' && id === characterId && snapshot.status === 'ready') adopt(snapshot.value);
    });
    const cached = configuration.getSnapshot(characterId);
    if (cached.status === 'ready') adopt(cached.value);
    void configuration.read(characterId).catch(cause => {
      if (active) setError(resolveFailure(cause, { fallback: tUi("读取{value0}失败", {value0: label}) }).text);
    });
    return () => { active = false; stop(); };
  }, [characterId, configuration, label]);

  function changeLibrary(updater) {
    setError('');
    setSaveNotice('');
    setLibrary(current => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      libraryRef.current = next;
      return next;
    });
  }

  async function save() {
    if (!libraryRef.current) return false;
    if (savePromiseRef.current) {
      const inFlight = savePromiseRef.current;
      const saved = await inFlight;
      if (savePromiseRef.current === inFlight) savePromiseRef.current = null;
      if (!saved) return false;
      if (JSON.stringify(libraryRef.current) !== JSON.stringify(persistedRef.current)) return save();
      return true;
    }
    const task = (async () => {
      const snapshot = libraryRef.current;
      setSaving(true);
      setError('');
      setSaveNotice('');
      try {
        const saved = await configuration.save(characterId, callbacks.current.prepareSave?.(snapshot) ?? snapshot);
        persistedRef.current = saved;
        setPersisted(saved);
        if (libraryRef.current === snapshot) {
          libraryRef.current = saved;
          setLibrary(saved);
          setSaveNotice('saved');
        } else if (callbacks.current.rebaseAfterSave) {
          const rebased = callbacks.current.rebaseAfterSave(libraryRef.current, saved);
          libraryRef.current = rebased;
          setLibrary(rebased);
        }
        return true;
      } catch (cause) {
        setError(resolveFailure(cause, { fallback: tUi("保存{value0}失败", {value0: label}) }).text);
        return false;
      } finally {
        setSaving(false);
      }
    })();
    savePromiseRef.current = task;
    try { return await task; }
    finally { if (savePromiseRef.current === task) savePromiseRef.current = null; }
  }

  function discard() {
    libraryRef.current = persistedRef.current;
    setLibrary(persistedRef.current);
    setError('');
    setSaveNotice('');
  }

  useEffect(() => {
    function handleSaveShortcut(event) {
      if (!saveShortcut) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLocaleLowerCase() !== 's') return;
      event.preventDefault();
      if (dirty && !saving) void save();
    }
    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  });

  return { library, setLibrary, persisted, setPersisted, libraryRef, persistedRef, dirty, saving,
    error, setError, saveNotice, changeLibrary, save, discard };
}

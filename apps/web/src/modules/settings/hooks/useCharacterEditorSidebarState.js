import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useState, useSyncExternalStore } from 'react';
import { useDshDisplayPreferences } from '../model/DisplayPreferencesContext.jsx';
import { resolveFailure } from '../../../utils/failureText.js';

const EMPTY_SNAPSHOT = Object.freeze({ status: 'ready', ui: Object.freeze({}) });
const EMPTY_SUBSCRIBE = () => () => {};
const GET_EMPTY_SNAPSHOT = () => EMPTY_SNAPSHOT;

export function useCharacterEditorSidebarState() {
  const tUi = useProductTranslation();
  const preferences = useDshDisplayPreferences();
  const snapshot = useSyncExternalStore(
    preferences?.subscribe || EMPTY_SUBSCRIBE,
    preferences?.getSnapshot || GET_EMPTY_SNAPSHOT,
    preferences?.getSnapshot || GET_EMPTY_SNAPSHOT,
  );
  const [pendingCollapsed, setPendingCollapsed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dismissedError, setDismissedError] = useState('');
  const collapsed = pendingCollapsed ?? (snapshot.ui?.character_editor_sidebar_collapsed === true);
  const reportedError = error || (snapshot.status === 'error' ? snapshot.error : '');

  async function toggle() {
    if (saving || snapshot.status !== 'ready' || (preferences && !snapshot.writable)) return;
    const next = !collapsed;
    setPendingCollapsed(next);
    setError('');
    setDismissedError('');
    if (!preferences) return;
    setSaving(true);
    try {
      await preferences.updateUi({ character_editor_sidebar_collapsed: next });
    } catch (failure) {
      setError(resolveFailure(failure, { fallback: tUi("保存侧边栏状态失败") }).text);
    } finally {
      setPendingCollapsed(null);
      setSaving(false);
    }
  }

  return {
    collapsed, toggle, busy: saving || snapshot.status !== 'ready' || Boolean(preferences && !snapshot.writable),
    error: reportedError === dismissedError ? '' : reportedError,
    dismissError: () => setDismissedError(reportedError),
  };
}

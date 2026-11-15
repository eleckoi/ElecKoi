import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useDshDisplayPreferences } from '../../settings/index.js';

const emptySnapshot = Object.freeze({ ui: {} });
const emptySource = { subscribe: () => () => {}, getSnapshot: () => emptySnapshot };
const key = 'conversation_content_width';

/** Bind existing persisted product settings to the actual native width controls. */
export function useConversationWidthPreference() {
  const preferences = useDshDisplayPreferences();
  const source = preferences ?? emptySource;
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const value = useRef(null);
  const raw = snapshot.ui?.[key];
  const width = Number(raw);
  value.current = Number.isFinite(width) && width > 0 ? width : null;
  return useMemo(() => preferences ? {
    read: () => value.current,
    write: next => {
      value.current = next;
      void preferences.updateUi({ [key]: next }).catch(error => console.error('[eleckoi-client-failure] 保存聊天宽度', error));
    },
  } : undefined, [preferences, raw]);
}

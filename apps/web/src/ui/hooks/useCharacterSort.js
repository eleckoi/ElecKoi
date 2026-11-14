import { useEffect, useState, useSyncExternalStore } from 'react';
import { useDshDisplayPreferences } from '../../modules/settings/index.js';
import { resolveFailure } from '../../utils/failureText.js';
import { characterName } from '../../utils/characterDisplay.js';

export const CHARACTER_SORT_OPTIONS = [['default', '默认顺序'], ['newest', '最近导入'], ['oldest', '最早导入'], ['edited', '最近编辑'], ['name', '名称排序']];
const validSort = value => CHARACTER_SORT_OPTIONS.some(([id]) => id === value) ? value : 'default';
const empty = Object.freeze({ ui: Object.freeze({}) });
const subscribeEmpty = () => () => {};
const getEmpty = () => empty;

export function sortCharacters(items, mode, locale) {
  if (mode === 'default') return items;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  return [...items].sort((a, b) => {
    if (mode === 'name') return collator.compare(characterName(a), characterName(b));
    const field = mode === 'edited' ? 'editedAtEpochMs' : 'addedAtEpochMs';
    const left = a[field], right = b[field];
    const knownLeft = Number.isSafeInteger(left) && left > 0, knownRight = Number.isSafeInteger(right) && right > 0;
    if (knownLeft !== knownRight) return knownLeft ? -1 : 1;
    if (!knownLeft) return 0;
    return mode === 'oldest' ? left - right : right - left;
  });
}

export function useCharacterSort(preferenceKey = 'mobile_character_sort') {
  const preferences = useDshDisplayPreferences();
  const snapshot = useSyncExternalStore(preferences?.subscribe || subscribeEmpty, preferences?.getSnapshot || getEmpty);
  const saved = validSort(snapshot.ui?.[preferenceKey]);
  const [sort, setSort] = useState(saved), [error, setError] = useState('');
  useEffect(() => setSort(saved), [saved]);
  async function chooseSort(value) {
    const next = validSort(value);
    setSort(next); setError('');
    try { await preferences?.updateUi(current => ({ ...current, [preferenceKey]: next })); }
    catch (cause) { setSort(saved); setError(resolveFailure(cause).text); }
  }
  return { sort, chooseSort, error };
}

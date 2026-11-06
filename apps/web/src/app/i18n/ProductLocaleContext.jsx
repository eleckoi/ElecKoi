import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import zh from './locales/zh.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import ru from './locales/ru.json';
import pt from './locales/pt.json';
import { sourceText } from './productCopy.js';

const namespace = 'eleckoi.ui';
const dictionaries = { zh, en, ja, es, fr, de, ru, pt };
const subscribeEmpty = () => () => {};
const emptyRevision = () => 0;
const ProductLocaleContext = createContext({ id: 'zh', name: '中文', t: sourceText });

/** The official runtime owns locale selection, fallback, notification and persistence. */
export function ProductLocaleProvider({ locale, children }) {
  const revision = useSyncExternalStore(
    locale ? listener => locale.subscribe(listener) : subscribeEmpty,
    locale ? () => locale.getSnapshot().revision : emptyRevision,
    emptyRevision,
  );
  useLayoutEffect(() => locale?.register(namespace, dictionaries), [locale]);
  const value = useMemo(() => ({
    id: locale?.getSnapshot().active || 'zh',
    name: locale?.getSnapshot().locales.find(item => item.id === locale.getSnapshot().active)?.label || '中文',
    // A fresh currency on revision changes also invalidates translated option memos.
    t: locale ? Object.defineProperty((key, params) => locale.bind(namespace)(key, params),
      'locale', { get: () => locale.getSnapshot().active }) : sourceText,
  }), [locale, revision]);
  return <ProductLocaleContext.Provider value={value}>{children}</ProductLocaleContext.Provider>;
}

export const useProductTranslation = () => useContext(ProductLocaleContext).t;
export const useProductLocale = () => useContext(ProductLocaleContext).id;
export const useProductLanguageName = () => useContext(ProductLocaleContext).name;

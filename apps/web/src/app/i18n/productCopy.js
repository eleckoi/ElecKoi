/** Localize only declared UI metadata. IDs, user records and author content never enter this function. */
export function localizeUiCopy(source, translate) {
  // Source copy is Chinese. Leave machine IDs, URLs, class names and brands intact.
  if (typeof source === 'string') return /\p{Script=Han}/u.test(source) ? translate(source) : source;
  if (!source || typeof source !== 'object') return source;
  let cache = copies.get(translate);
  if (!cache) { cache = new WeakMap(); copies.set(translate, cache); }
  if (cache.has(source)) return cache.get(source);
  const result = Array.isArray(source) ? source.map(value => localizeUiCopy(value, translate))
    : Object.fromEntries(Object.entries(source).map(([key, value]) => [key, localizeUiCopy(value, translate)]));
  cache.set(source, result);
  return result;
}
const copies = new WeakMap();

/** Default used by pure presentation helpers and tests without an installed client. */
export const sourceText = (text, params) => params ? text.replace(/\{(\w+)\}/g,
  (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match) : text;

export const productLocaleTag = translate => ({ zh: 'zh-CN', pt: 'pt-BR' }[translate.locale || 'zh'] || translate.locale);

export const formatProductList = (items, translate) => new Intl.ListFormat(productLocaleTag(translate), {
  style: 'short', type: 'conjunction',
}).format(items);

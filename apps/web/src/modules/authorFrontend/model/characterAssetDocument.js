import { characterAssetBaseUrl, resolveCharacterAssetReferences } from '@shared/foundation/characterAssetReference';

// Serialized before authored scripts. It has no app globals, RPC, disk paths or binary cache.
function installAssetReferences(baseUrl) {
  const pattern = /asset:\/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?![a-z0-9-])/gi;
  const resolve = value => typeof value === 'string' ? value.replace(pattern, (_, id) => baseUrl + id.toLowerCase()) : value;
  Object.defineProperty(window, 'ElecKoiAssetUrl', { value: resolve });
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (input instanceof URL) input = resolve(input.href);
    if (input instanceof Request && input.url.startsWith('asset://')) input = new Request(resolve(input.url), input);
    return originalFetch.call(this, typeof input === 'string' ? resolve(input) : input, init);
  };
  const NativeAudio = window.Audio;
  window.Audio = function (source) { return new NativeAudio(source === undefined ? undefined : resolve(String(source))); };
  window.Audio.prototype = NativeAudio.prototype; Object.setPrototypeOf(window.Audio, NativeAudio);
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) { args[1] = resolve(String(args[1])); return Reflect.apply(open, this, args); };
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) { return setAttribute.call(this, name, resolve(String(value))); };
  for (const [Class, properties] of [[HTMLImageElement, ['src', 'srcset']], [HTMLMediaElement, ['src']], [HTMLVideoElement, ['poster']], [HTMLSourceElement, ['src', 'srcset']], [HTMLScriptElement, ['src']], [HTMLLinkElement, ['href']], [HTMLAnchorElement, ['href']], [HTMLIFrameElement, ['src', 'srcdoc']], [Element, ['innerHTML', 'outerHTML']]]) {
    for (const name of properties) {
      const descriptor = Object.getOwnPropertyDescriptor(Class.prototype, name);
      if (descriptor?.set) Object.defineProperty(Class.prototype, name, { ...descriptor, set(value) { descriptor.set.call(this, resolve(String(value))); } });
    }
  }
  const insert = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (position, text) { return insert.call(this, position, resolve(text)); };
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (name, value, priority) { return setProperty.call(this, name, resolve(value), priority); };
  for (const name of Object.getOwnPropertyNames(CSSStyleDeclaration.prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, name);
    if (descriptor?.set) Object.defineProperty(CSSStyleDeclaration.prototype, name, { ...descriptor, set(value) { descriptor.set.call(this, resolve(value)); } });
  }
  const insertRule = CSSStyleSheet.prototype.insertRule;
  CSSStyleSheet.prototype.insertRule = function (rule, index) { return insertRule.call(this, resolve(rule), index); };
  for (const name of ['replace', 'replaceSync']) {
    const original = CSSStyleSheet.prototype[name];
    if (original) CSSStyleSheet.prototype[name] = function (text) { return original.call(this, resolve(text)); };
  }
  // Direct style assignment and inserted style blocks bypass setAttribute/setProperty.
  const rewrite = element => {
    for (const attribute of element.attributes || []) { const next = resolve(attribute.value); if (next !== attribute.value) setAttribute.call(element, attribute.name, next); }
    if (element.tagName === 'STYLE') { const next = resolve(element.textContent); if (next !== element.textContent) element.textContent = next; }
  };
  const observer = new MutationObserver(records => { for (const record of records) {
    if (record.target instanceof Element) rewrite(record.target);
    for (const node of record.addedNodes) if (node instanceof Element) { rewrite(node); node.querySelectorAll('*').forEach(rewrite); }
  } });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  addEventListener('pagehide', () => observer.disconnect(), { once: true });
}

/** Source and dynamic browser requests resolve against the current character, after import as well. */
export function prepareCharacterAssetDocument(source, characterId) {
  if (!characterId) return source;
  const base = new URL(characterAssetBaseUrl(characterId), document.baseURI).href;
  const transformed = resolveCharacterAssetReferences(source, base);
  const parsed = new DOMParser().parseFromString(transformed, 'text/html');
  const script = parsed.createElement('script');
  script.textContent = `(${installAssetReferences.toString()})(${JSON.stringify(base).replaceAll('<', '\\u003c')});`;
  parsed.head.prepend(script);
  return '<!doctype html>' + parsed.documentElement.outerHTML;
}

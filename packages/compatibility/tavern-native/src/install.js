import { createCompatibilityRuntime } from './runtime.js';

const browserResource = '/eleckoi/html/tavern-native.global.js';

/** Load the browser implementation into its owning realm so ST registries cannot race across pages. */
function loadRealm(view, resourceUrl) {
  if (view.__ElecKoiCreateTavernApi) return Promise.resolve(view.__ElecKoiCreateTavernApi);
  if (view.__ElecKoiTavernRealmLoading) return view.__ElecKoiTavernRealmLoading;
  const operation = (view.jQuery ? Promise.resolve() : loadScript(view, '/eleckoi/html/libraries/jquery.min.js')).then(() => new Promise((resolve, reject) => {
    const script = view.document.createElement('script');
    script.src = new URL(resourceUrl, view.document.baseURI).href;
    script.onload = () => {
      if (typeof view.__ElecKoiCreateTavernApi !== 'function') reject(new Error('The native Tavern browser resource did not initialize.'));
      else resolve(view.__ElecKoiCreateTavernApi);
    };
    script.onerror = () => reject(new Error(`Cannot load native Tavern browser resource: ${script.src}`));
    view.document.head.append(script);
  }));
  view.__ElecKoiTavernRealmLoading = operation;
  operation.catch(() => { if (view.__ElecKoiTavernRealmLoading === operation) delete view.__ElecKoiTavernRealmLoading; });
  return operation;
}

function loadScript(view, source) {
  return new Promise((resolve, reject) => {
    const script = view.document.createElement('script');
    script.src = new URL(source, view.document.baseURI).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Cannot load native browser library: ${script.src}`));
    view.document.head.append(script);
  });
}

export function installTavernCompatibility(view, options) {
  const runtime = createCompatibilityRuntime(view, options);
  let closed = false;
  const dispose = () => { if (closed) return; closed = true; runtime.dispose(); };
  view.addEventListener('pagehide', dispose, { once: true });
  runtime.addCleanup(() => view.removeEventListener('pagehide', dispose));
  let api;
  const ready = Promise.all([runtime.ready, loadRealm(view, options.resourceUrl ?? browserResource)]).then(async ([, factory]) => {
    if (closed) throw new Error('The author page closed before native Tavern initialization.');
    if (!runtime.tokens) {
      const shared = runtime.shared;
      if (!shared.tokenizers) {
        shared.tokenizers = view.__ElecKoiTavernTokenizers ? Promise.resolve(view.__ElecKoiTavernTokenizers)
          : loadScript(view, '/eleckoi/html/tavern-tokenizers.global.js').then(() => view.__ElecKoiTavernTokenizers);
      }
      const tokenizers = await shared.tokenizers;
      await tokenizers?.ready;
      if (closed) throw new Error('The author page closed before tokenizer initialization.');
      if (!tokenizers) throw new Error('Native browser tokenizer did not initialize.');
      const update = () => { runtime.tokens = tokenizers.forModel(runtime.snapshot.selectedConnection?.model ?? '', runtime.snapshot.tokenizer?.encoding); };
      update(); runtime.tokenizerRegistry = tokenizers; runtime.on('snapshot.updated', update);
    }
    api = factory(runtime);
    runtime.addCleanup(() => api.dispose());
  });
  ready.catch(error => options.report?.(error));
  return {
    ready,
    refresh: () => runtime.refresh(), flush: () => runtime.flush(), dispose,
    get helper() { return api?.helper; }, get SillyTavern() { return api?.SillyTavern; },
  };
}

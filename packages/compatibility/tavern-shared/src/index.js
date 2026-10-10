import { createHostAdapter, createRemoteHostAdapter, unwrapRemote } from './host-adapter.js';
import { createSharedRealm } from './shared-realm.js';
import { installElecKoiAuthorApi } from './preview/eleckoi.js';
import { installTavernContract } from './preview/tavern-contract.js';
import { installTavernCompatibility } from './preview/tavern-compat.js';
import { installBrowserLibraries } from './browser-libraries.js';
export { createHostAdapter, createRemoteHostAdapter, unwrapRemote, createSharedRealm };
export { installElecKoiAuthorApi, installTavernContract, installTavernCompatibility };
export { installBrowserLibraries };
export { BROWSER_LIBRARY_SCRIPTS, BROWSER_LIBRARY_STYLES, BROWSER_LIBRARY_VERSIONS } from './browser-libraries.js';

/** Load the built ST runtime once in each JS realm before installing its frontdoor. */
export async function installTavernShared(window, options) {
  if (!options?.adapter) throw new TypeError('installTavernShared requires actual injected Host bindings');
  if (options.signal?.aborted) throw options.signal.reason;
  if (window.ElecKoi?.compatibility?.version === '0.1.0') return window.ElecKoi;
  if (options.shared) {
    const id = options.shared.adopt(window, options.pluginId || 'frontend');
    if (options.frameId) window.__ElecKoiFrameId = options.frameId;
    window.__ElecKoiCompatibilityDocumentId = id;
  } else {
    createSharedRealm(window, options.adapter);
    window.__ElecKoiPluginId = options.pluginId || 'frontend';
    window.__ElecKoiFrameId = options.frameId || options.pluginId || 'frontend';
  }
  if (options.tokenizers) window.__ElecKoiTokenizers = options.tokenizers;
  if (options.libraryBaseUrl) await untilClosed(installBrowserLibraries(window, options.libraryBaseUrl), options.signal);
  if (!window.__ElecKoiSt) {
    if (!options.runtimeUrl) throw new Error('Load the built tavern-runtime.global.js or provide runtimeUrl');
    await untilClosed(loadScript(window, options.runtimeUrl), options.signal);
    if (!window.__ElecKoiSt) throw new Error('The Tavern runtime script loaded without its expected exports');
  }
  if (options.signal?.aborted) throw options.signal.reason;
  installElecKoiAuthorApi(window);
  installTavernContract(window);
  installTavernCompatibility(window);
  await untilClosed(window.ElecKoi.ready(), options.signal);
  return window.ElecKoi;
}

function untilClosed(operation, signal) {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

function loadScript(window, url) {
  return new Promise((resolve, reject) => {
    const script = window.document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load Tavern runtime: ${url}`));
    window.document.head.appendChild(script);
  });
}

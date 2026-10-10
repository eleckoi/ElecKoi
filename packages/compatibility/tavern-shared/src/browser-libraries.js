export const BROWSER_LIBRARY_SCRIPTS = ['jquery.min.js', 'jquery-ui.min.js', 'jquery-ui-touch-punch.min.js', 'lodash.min.js',
  'pixi.min.js', 'showdown.min.js', 'toastr.min.js', 'vue.global.prod.js', 'vue-router.global.prod.js', 'fontawesome/js/all.min.js',
  'tailwind-browser.global.js', 'yaml.global.js', 'zod.global.js', 'document-parsers.global.js'];
export const BROWSER_LIBRARY_STYLES = ['jquery-ui/jquery-ui.min.css', 'toastr.min.css', 'fontawesome/css/all.min.css'];
export const BROWSER_LIBRARY_VERSIONS = Object.freeze({ fontAwesome: '7.3.1', jquery: '3.7.1', tiktoken: '1.0.21', jqueryUi: '1.13.3',
  jqueryUiTouchPunch: '0.2.3', lodash: '4.17.21', pixi: '8.20.1', showdown: '2.1.0', tailwindCss: '4.3.3', toastr: '2.1.4',
  vue: '3.5.42', vueRouter: '4.6.3', yaml: '2.9.0', zod: '4.1.11' });

/** Browser libraries are loaded into each document; the initialized tokenizer stays in the parent. */
export async function installBrowserLibraries(window, baseUrl) {
  if (window.ElecKoiLibraries?.ready) return window.ElecKoiLibraries;
  for (const file of BROWSER_LIBRARY_STYLES) {
    const link = window.document.createElement('link'); link.rel = 'stylesheet'; link.href = baseUrl + file;
    window.document.head.appendChild(link);
  }
  for (const file of BROWSER_LIBRARY_SCRIPTS) await script(window, baseUrl + file);
  const parentRuntime = window.__ElecKoiShared?.tokenizerRuntime;
  if (parentRuntime) window.__ElecKoiTokenizers = parentRuntime;
  else await script(window, baseUrl + 'tiktoken.global.js');
  if (!window.__ElecKoiTokenizers) throw new Error('The real tokenizer browser runtime did not initialize');
  await window.__ElecKoiTokenizers.initialize();
  window.ElecKoiLibraries = Object.freeze({ ready: true, versions: BROWSER_LIBRARY_VERSIONS });
  window.dispatchEvent(new window.CustomEvent('eleckoi:libraries-ready', { detail: window.ElecKoiLibraries }));
  return window.ElecKoiLibraries;
}
function script(window, url) {
  return new Promise((resolve, reject) => {
    const element = window.document.createElement('script'); element.src = url; element.onload = resolve;
    element.onerror = () => reject(new Error(`Browser library failed to load: ${url}`)); window.document.head.appendChild(element);
  });
}

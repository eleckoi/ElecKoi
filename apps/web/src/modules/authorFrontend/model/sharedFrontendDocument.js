import { prepareCharacterAssetDocument } from './characterAssetDocument.js';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { installRichDocumentMeasurement } from '@eleckoi/author-sdk';
import { prepareFrontendCompatibilitySource } from '@eleckoi/tavern-frontend';

const literal = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const attr = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

export function injectFrontendHead(source, head) {
  if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, value => value + head);
  if (/<html\b[^>]*>/i.test(source)) return source.replace(/<html\b[^>]*>/i, value => value + `<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head>${/<body\b/i.test(source) ? source : `<body>${source}</body>`}</html>`;
}

/** Imported scripts start after their owning page has mounted its native capabilities. */
export function buildSharedFrontendDocument(source, runtime, { channel, baseUrl, rich = false, context, globalStyles = [], autoHeight = false, characterId } = {}) {
  if (!runtime?.assetsBaseUrl || !runtime.sdk) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'HTML 显示资源尚未就绪', { what: 'HTML 显示资源' });
  const sdk = runtime.sdk, libraries = runtime.assetsBaseUrl + 'libraries/';
  // Matching the embedding scheme keeps the rich document canvas transparent.
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`
    + `<script type="importmap">${literal({ imports: sdk.browserModuleImports(runtime.assetsBaseUrl) })}</script>`
    + (baseUrl && !/<base\b/i.test(source) ? `<base href="${attr(baseUrl)}">` : '')
    + (rich ? '<style>html{color-scheme:light dark}html,body{margin:0;padding:0;min-width:0;background:transparent;overflow:hidden}body{overflow-wrap:anywhere}img,video,canvas{max-width:100%}</style>' : '')
    + sdk.BROWSER_LIBRARY_STYLES.map(file => `<link rel="stylesheet" href="${attr(libraries + file)}">`).join('')
    + globalStyles.map(url => `<link rel="stylesheet" href="${attr(url)}">`).join('')
    + sdk.BROWSER_LIBRARY_SCRIPTS.map(file => `<script src="${attr(libraries + file)}"></script>`).join('')
    + `<script>
(() => {
  const channel=${literal(channel)};
  const send=(type,payload={})=>parent.postMessage({type,channel,...payload},'*');
  const report=error=>send(${literal(rich ? 'eleckoi:frontend-diagnostic' : 'eleckoi:frontend-error')},{message:error?.message||String(error),stack:error?.stack||''});
  window.ElecKoiFrontendContext=${literal(context ?? null)};
  Object.defineProperty(window,'__ElecKoiDocumentChannel',{value:channel});
  addEventListener('error',event=>report(event.error||new Error(event.message)));
  addEventListener('error',event=>{if(event.target!==window&&event.target?.tagName)report(new Error('资源加载失败: '+(event.target.src||event.target.href||event.target.tagName)));},true);
  addEventListener('unhandledrejection',event=>report(event.reason));
  window.ElecKoiLibraries={ready:true,versions:${literal(sdk.BROWSER_LIBRARY_VERSIONS)}};
  window.__ElecKoiCompleteSharedDocument=error=>error?send('eleckoi:frontend-error',{message:error?.message||String(error)}):send('eleckoi:frontend-ready');
  ${autoHeight ? `const measureSlot=()=>send('eleckoi:slot-height',{height:Math.ceil(document.body?.getBoundingClientRect().height||0)});
  const watchSlot=()=>{const observer=new ResizeObserver(measureSlot);observer.observe(document.body);addEventListener('pagehide',()=>observer.disconnect(),{once:true});measureSlot();};
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',watchSlot,{once:true});else watchSlot();` : ''}
  ${rich ? `(${installRichDocumentMeasurement.toString()})(window,height=>send('eleckoi:rich-height',{height}));` : ''}
})();
</script>`;
  return injectFrontendHead(prepareFrontendCompatibilitySource(prepareCharacterAssetDocument(String(source || ''), characterId)), head);
}

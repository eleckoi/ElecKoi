const literal = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const attr = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

/** Keep author code inert while the owning Client installs its document APIs. */
export function deferFrontendScripts(source) {
  return String(source || '').replace(/<!--[\s\S]*?-->|<script\b(?:[^"'>]|"[^"]*"|'[^']*')*>[\s\S]*?<\/script\s*>/gi, element => {
    if (element.startsWith('<!--')) return element;
    const opening = /^<script\b(?:[^"'>]|"[^"]*"|'[^']*')*>/i.exec(element)[0];
    const declared = /\s+type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(opening);
    const originalType = declared ? declared[1] ?? declared[2] ?? declared[3] : '';
    const type = originalType.trim().toLowerCase();
    if (type && type !== 'module' && !/^(?:text|application)\/(?:x-)?(?:java|ecma)script$/.test(type)) return element;
    const inert = (declared ? opening.replace(declared[0], '') : opening).slice(0, -1)
      + ` type="application/eleckoi-author-script" data-eleckoi-script-type="${attr(originalType)}">`;
    return inert + element.slice(opening.length);
  });
}

/** Execute the original scripts in document order after compatibility readiness. */
export async function activateFrontendScripts(page, current = () => true) {
  for (const inert of page.document.querySelectorAll('script[data-eleckoi-script-type]')) {
    if (!current()) return;
    const script = page.document.createElement('script');
    for (const { name, value } of inert.attributes) {
      if (name !== 'type' && name !== 'data-eleckoi-script-type') script.setAttribute(name, value);
    }
    const type = inert.getAttribute('data-eleckoi-script-type');
    if (type) script.setAttribute('type', type);
    script.textContent = inert.textContent;
    if (script.noModule && 'noModule' in script) { inert.remove(); continue; }
    const asynchronous = !!script.src || type?.trim().toLowerCase() === 'module';
    const executed = asynchronous ? new Promise((resolve, reject) => {
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error(`作者脚本加载失败：${script.src || 'inline module'}`)), { once: true });
    }) : null;
    inert.replaceWith(script);
    if (executed) await executed;
  }
  if (current()) {
    page.document.dispatchEvent(new page.Event('DOMContentLoaded', { bubbles: true }));
    page.dispatchEvent(new page.Event('load'));
    page.dispatchEvent(new page.Event('eleckoi:author-document-ready'));
  }
}

export function injectFrontendHead(source, head) {
  if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, value => value + head);
  if (/<html\b[^>]*>/i.test(source)) return source.replace(/<html\b[^>]*>/i, value => value + `<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head>${/<body\b/i.test(source) ? source : `<body>${source}</body>`}</html>`;
}

/** Presentation resources load first; the owning Client releases the author's code. */
export function buildSharedFrontendDocument(source, runtime, { channel, baseUrl, rich = false, context, globalStyles = [], autoHeight = false } = {}) {
  if (!runtime?.assetsBaseUrl || !runtime.sdk) throw new Error('HTML 显示资源尚未就绪');
  const sdk = runtime.sdk, libraries = runtime.assetsBaseUrl + 'libraries/';
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`
    + `<script type="importmap">${literal({ imports: sdk.browserModuleImports(runtime.assetsBaseUrl) })}</script>`
    + (baseUrl && !/<base\b/i.test(source) ? `<base href="${attr(baseUrl)}">` : '')
    + (rich ? '<style>html,body{margin:0;padding:0;min-width:0;background:transparent;overflow:hidden}body{overflow-wrap:anywhere}img,video,canvas{max-width:100%}</style>' : '')
    + sdk.BROWSER_LIBRARY_STYLES.map(file => `<link rel="stylesheet" href="${attr(libraries + file)}">`).join('')
    + globalStyles.map(url => `<link rel="stylesheet" href="${attr(url)}">`).join('')
    + sdk.BROWSER_LIBRARY_SCRIPTS.map(file => `<script src="${attr(libraries + file)}"></script>`).join('')
    + `<script>
(() => {
  const channel=${literal(channel)};
  const send=(type,payload={})=>parent.postMessage({type,channel,...payload},'*');
  const report=error=>send('eleckoi:frontend-error',{message:error?.message||String(error),stack:error?.stack||''});
  window.ElecKoiFrontendContext=${literal(context ?? null)};
  Object.defineProperty(window,'__ElecKoiDocumentChannel',{value:channel});
  addEventListener('error',event=>report(event.error||new Error(event.message)));
  addEventListener('error',event=>{if(event.target!==window&&event.target?.tagName)report(new Error('资源加载失败: '+(event.target.src||event.target.href||event.target.tagName)));},true);
  addEventListener('unhandledrejection',event=>report(event.reason));
  window.ElecKoiLibraries={ready:true,versions:${literal(sdk.BROWSER_LIBRARY_VERSIONS)}};
  window.__ElecKoiCompleteSharedDocument=error=>error?report(error):send('eleckoi:frontend-ready');
  ${autoHeight ? `const measureSlot=()=>send('eleckoi:slot-height',{height:Math.ceil(document.body?.getBoundingClientRect().height||0)});
  const watchSlot=()=>{const observer=new ResizeObserver(measureSlot);observer.observe(document.body);addEventListener('pagehide',()=>observer.disconnect(),{once:true});measureSlot();};
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',watchSlot,{once:true});else watchSlot();` : ''}
  ${rich ? `let scheduled=false;
  const measure=()=>{scheduled=false;send('eleckoi:rich-height',{height:Math.max(1,Math.ceil(document.body?.scrollHeight||0))});};
  const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(measure);}};
  const observe=()=>{const mutation=new MutationObserver(schedule);mutation.observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});
    const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;resize?.observe(document.body);
    document.fonts?.addEventListener('loadingdone',schedule);schedule();
    addEventListener('pagehide',()=>{mutation.disconnect();resize?.disconnect();document.fonts?.removeEventListener('loadingdone',schedule);},{once:true});};
  addEventListener('resize',schedule);document.addEventListener('load',schedule,true);
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',observe,{once:true});else observe();` : ''}
})();
</script>`;
  return injectFrontendHead(deferFrontendScripts(source), head);
}

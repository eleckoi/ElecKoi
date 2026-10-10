const literal = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const attr = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

export function injectFrontendHead(source, head) {
  if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, value => value + head);
  if (/<html\b[^>]*>/i.test(source)) return source.replace(/<html\b[^>]*>/i, value => value + `<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head>${/<body\b/i.test(source) ? source : `<body>${source}</body>`}</html>`;
}

/** Real browser libraries and the same Host SDK precede authored scripts. */
export function buildSharedFrontendDocument(source, runtime, { frameId, messageId, conversationId, channel = frameId, baseUrl, rich = false, context, globalStyles = [], autoHeight = false } = {}) {
  if (!runtime?.assetsBaseUrl || !runtime.sdk) throw new Error('共享前端 SDK 尚未就绪');
  const sdk = runtime.sdk, libraries = runtime.assetsBaseUrl + 'assets/assets/';
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`
    + (baseUrl && !/<base\b/i.test(source) ? `<base href="${attr(baseUrl)}">` : '')
    + (rich ? '<style>html,body{margin:0;padding:0;min-width:0;background:transparent;overflow:hidden}body{overflow-wrap:anywhere}img,video,canvas{max-width:100%}</style>' : '')
    + sdk.BROWSER_LIBRARY_STYLES.map(file => `<link rel="stylesheet" href="${attr(libraries + file)}">`).join('')
    + globalStyles.map(url => `<link rel="stylesheet" href="${attr(url)}">`).join('')
    + sdk.BROWSER_LIBRARY_SCRIPTS.map(file => `<script src="${attr(libraries + file)}"></script>`).join('')
    + `<script src="${attr(runtime.assetsBaseUrl + 'assets/tavern-runtime.global.js')}"></script>`
    + `<script>
(() => {
  const channel=${literal(channel)};
  const send=(type,payload={})=>parent.postMessage({type,channel,...payload},'*');
  const report=error=>send('eleckoi:frontend-error',{message:error?.message||String(error),stack:error?.stack||''});
  window.ElecKoiFrontendContext=${literal(context ?? null)};
  addEventListener('error',event=>report(event.error||new Error(event.message)));
  addEventListener('error',event=>{if(event.target!==window&&event.target?.tagName)report(new Error('资源加载失败: '+(event.target.src||event.target.href||event.target.tagName)));},true);
  addEventListener('unhandledrejection',event=>report(event.reason));
  window.ElecKoiLibraries={ready:true,versions:${literal(sdk.BROWSER_LIBRARY_VERSIONS)}};
  window.__ElecKoiFrontendReady=parent.__ElecKoiClientCompatibility.prepareDocument(window,${literal({ frameId, messageId, conversationId })});
  window.__ElecKoiFrontendReady.then(()=>{
    const sync=()=>{
      const root=document.getElementById('chat');
      if(!root||window.__ElecKoiFrontendSurfaceRoot===root)return;
      window.__ElecKoiFrontendSurfaceStop?.();window.__ElecKoiFrontendSurfaceRoot=root;
      const retrieve=id=>Array.from(root.querySelectorAll('[data-message-id],[data-native-id],.mes[mesid]')).find(node=>
        node.dataset.messageId===id||node.dataset.nativeId===id||Number(node.getAttribute('mesid'))===SillyTavern.getContext().chat.findIndex(row=>row.native_id===id));
      window.__ElecKoiFrontendSurfaceStop=ElecKoi.ui.registerMessageSurface({root,retrieve,
        format:(${createMessageSurfaceFormatter.toString()})(window),
        refresh:(id,html)=>{const target=retrieve(id)?.querySelector('.mes_text');if(target)target.innerHTML=html;},
        syncMetadata:rows=>rows.forEach((row,index)=>{const node=retrieve(row.native_id);if(node){node.setAttribute('mesid',String(index));node.setAttribute('is_user',String(row.is_user));}})});
    };
    if(document.readyState==='loading')addEventListener('DOMContentLoaded',sync,{once:true});else sync();
    const observer=new MutationObserver(sync);observer.observe(document.documentElement,{childList:true,subtree:true});
    addEventListener('pagehide',()=>{observer.disconnect();window.__ElecKoiFrontendSurfaceStop?.();},{once:true});
  },report);
  window.__ElecKoiFrontendReady.then(()=>send('eleckoi:frontend-ready'),report);
  ${autoHeight ? `const measureSlot=()=>send('eleckoi:slot-height',{height:Math.ceil(document.body?.getBoundingClientRect().height||0)});
  const watchSlot=()=>{const observer=new ResizeObserver(measureSlot);observer.observe(document.body);addEventListener('pagehide',()=>observer.disconnect(),{once:true});measureSlot();};
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',watchSlot,{once:true});else watchSlot();` : ''}
  ${rich ? `let scheduled=false;
  const measure=()=>{scheduled=false;send('eleckoi:rich-height',{height:Math.max(1,Math.ceil(document.body?.scrollHeight||0))});};
  const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(measure);}};
  const observe=()=>{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});
    if(typeof ResizeObserver==='function')new ResizeObserver(schedule).observe(document.body);
    document.fonts?.addEventListener('loadingdone',schedule);schedule();};
  addEventListener('resize',schedule);document.addEventListener('load',schedule,true);
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',observe,{once:true});else observe();` : ''}
})();
</script>`;
  return injectFrontendHead(String(source || ''), head);
}
import { createMessageSurfaceFormatter } from './messageSurfaceFormatting.js';

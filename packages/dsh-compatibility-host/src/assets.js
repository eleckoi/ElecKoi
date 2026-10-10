import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BROWSER_LIBRARY_SCRIPTS, BROWSER_LIBRARY_STYLES, BROWSER_LIBRARY_VERSIONS } from '@eleckoi/compatibility-tavern-shared/browser-libraries';
const require = createRequire(import.meta.url);
export const ASSETS_BASE_URL = '/eleckoi/compat/';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg' };
const librariesUrl = ASSETS_BASE_URL + 'assets/assets/';
const head = `<meta name="viewport" content="width=device-width,initial-scale=1">`
  + BROWSER_LIBRARY_STYLES.map(file => `<link rel="stylesheet" href="${librariesUrl + file}">`).join('')
  + BROWSER_LIBRARY_SCRIPTS.map(file => `<script src="${librariesUrl + file}"></script>`).join('')
  + `<script src="${ASSETS_BASE_URL}assets/tavern-runtime.global.js"></script><script>window.ElecKoiLibraries={ready:true,versions:${JSON.stringify(BROWSER_LIBRARY_VERSIONS)}};parent.__ElecKoiClientCompatibility.prepareFrame(window);</script>`;
const literal = value => JSON.stringify(value).replaceAll('<', '\\u003c');
export function pluginFrameHtml(id, manifest) {
  const entry = manifest.entry || '__eleckoi_source__.js';
  const start = manifest.module === true
    ? `await import(${literal('./' + entry)});`
    : `const response=await fetch(${literal('./' + entry)});if(!response.ok)throw new Error('Plugin source HTTP '+response.status);const source=await response.text();await new (Object.getPrototypeOf(async function(){}).constructor)(source+'\\n//# sourceURL='+response.url).call(window);`;
  return `<!doctype html><html><head>${head}</head><body><script>(async()=>{try{await ElecKoi.ready();${start}await ElecKoi.call('plugins.runtimeReady');}catch(error){console.error(error);await ElecKoi.call('plugins.runtimeError',{error:String(error),stack:error.stack||''});}})();</script></body></html>`;
}
export function panelFrameHtml(html, ownerId) {
  const text = String(html);
  const resourceBase = /<base\b[^>]*\bhref\s*=\s*["']?[^\s"'>]+/i.test(text) || !ownerId ? ''
    : `<base href="${ASSETS_BASE_URL}plugin/${encodeURIComponent(ownerId)}/">`;
  if (/<head\b[^>]*>/i.test(text)) return text.replace(/<head\b[^>]*>/i, value => value + resourceBase + head);
  return `<!doctype html><html><head>${resourceBase}${head}</head><body>${text}</body></html>`;
}
export function createAuthorAssetHandler(operations, assetsDirectory) {
  const root = resolve(assetsDirectory || dirname(require.resolve('@eleckoi/compatibility-tavern-shared/runtime')));
  return async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    let path;
    try { path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(ASSETS_BASE_URL.length)); }
    catch { response.writeHead(400); response.end(); return; }
    let content, contentType;
    if (['runtime.js', 'media-runtime.js', 'application-api.js', 'background-presentation.js', 'client-appearance-capabilities.js', 'client-api-handlers.js', 'client-character-library.js'].some(name => path === 'client/' + name)) {
      content = await readFile(fileURLToPath(new URL('../web/' + path.slice(7), import.meta.url)));
      contentType = mime['.js'];
    } else if (path.startsWith('assets/')) {
      const target = resolve(root, path.slice(7));
      if (!target.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
      try { content = await readFile(target); }
      catch (error) { if (!['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) throw error; }
      contentType = mime[extname(target)] || 'application/octet-stream';
    } else {
      const [kind, id, ...parts] = path.split('/'), resource = parts.join('/');
      if (kind === 'plugin') {
        const manifest = operations.lookupManifest(id);
        if (manifest && resource === '__eleckoi_frame__.html') { content = pluginFrameHtml(id, manifest); contentType = mime['.html']; }
        else if (manifest && resource === '__eleckoi_source__.js' && !manifest.entry) { content = manifest.source; contentType = mime['.js']; }
        else {
          const bytes = operations.store().get(`resources:${id}`, resource);
          if (typeof bytes === 'string') { content = Buffer.from(bytes, 'base64'); contentType = mime[extname(resource)] || 'application/octet-stream'; }
        }
      } else if (kind === 'panel') {
        const descriptor = operations.store().get(`ui:${id}`, resource.replace(/\/index\.html$/, ''));
        if (descriptor && typeof descriptor.html === 'string') { content = panelFrameHtml(descriptor.html, id); contentType = mime['.html']; }
      }
    }
    if (content === undefined) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(`本地插件资源不存在：${path}`); return; }
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : content);
  };
}

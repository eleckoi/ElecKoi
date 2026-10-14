import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const ASSETS_BASE_URL = '/eleckoi/html/';
export const TAVERN_ASSETS_BASE_URL = '/eleckoi/html-assets/';
const entryAssets = new Set(['tavern-native.global.js', 'tavern-tokenizers.global.js', 'html-libraries.global.js', 'zod-module.js', 'lodash-module.js', 'client/runtime.js']);
const mime = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.wasm': 'application/wasm' };

/** Serve the application's HTML libraries and their static resources. */
export function createHtmlAssetHandler(assetsDirectory) {
  const root = resolve(assetsDirectory || dirname(require.resolve('@eleckoi/dsh-client-html-resources/html/html-libraries.global.js')));
  return async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    let path;
    try { path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(ASSETS_BASE_URL.length)); }
    catch { response.writeHead(400); response.end(); return; }
    let target;
    if (path === 'tavern-native.global.js' || path === 'tavern-tokenizers.global.js') target = resolve(root, 'assets', path);
    else if (entryAssets.has(path)) target = resolve(root, path);
    else if (path.startsWith('libraries/')) {
      const libraryRoot = resolve(root, 'assets');
      target = resolve(libraryRoot, path.slice('libraries/'.length));
      if (!target.startsWith(libraryRoot + sep)) { response.writeHead(403); response.end(); return; }
    }
    let content;
    if (target) {
      try { content = await readFile(target); }
      catch (error) { if (!['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) throw error; }
    }
    if (content === undefined) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Resource is unavailable'); return; }
    response.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : content);
  };
}

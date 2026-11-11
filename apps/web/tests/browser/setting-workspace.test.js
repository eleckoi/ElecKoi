import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('implements the setting workspace with manual unified saves, native controls and matching desktop geometry', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-setting-workspace-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/setting-workspace.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'esm', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') }, loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'dataurl', '.png': 'dataurl' }, logLevel: 'warning',
      plugins: [{ name: 'inline-css', setup(builder) {
        builder.onResolve({ filter: /\.css\?inline$/ }, args => ({ path: resolve(dirname(args.importer), args.path.replace(/\?inline$/, '')), namespace: 'inline-css' }));
        builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({ loader: 'text', contents: (await build({ stdin: { contents: await readFile(args.path, 'utf8'), loader: 'css', resolveDir: dirname(args.path) }, bundle: true, write: false, logLevel: 'warning' })).outputFiles[0].text }));
      } }],
    });
    await writeFile(resolve(directory, 'fixture.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}body{margin:0}.side-panel-brand .eleckoi-wordmark{width:139px}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script type="module" src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/setting-workspace.probe.cjs'), resolve(directory, 'fixture.html'), resolve(directory, 'report.json')], { env, windowsHide: true, timeout: 65000 });
    const result = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
    const evidence = resolve('build/setting-workspace-check'); await mkdir(evidence, { recursive: true });
    for (const file of ['report.json', 'content-light-1480.png', 'settings-light-1480.png', 'settings-light-900.png', 'settings-dark-1480.png', 'folder-light-1480.png', 'folder-light-900.png', 'folder-dark-1480.png', 'folder-actions-light-1480.png', 'icons-light-1480.png', 'order-light-1480.png', 'order-light-900.png', 'order-dark-1480.png', 'version-light-1480.png']) await copyFile(resolve(directory, file), resolve(evidence, file));
    const preview = resolve(evidence, 'preview'); await mkdir(preview, { recursive: true });
    for(const file of await readdir(directory))if(/\.(?:html|js|css|woff2?|ttf)$/.test(file))await copyFile(resolve(directory,file),resolve(preview,file));
    expect(result.errors).toEqual([]); expect(result.layouts).toHaveLength(3); expect(Object.values(result.actions).every(Boolean)).toBe(true);
  } finally { const target = relative(tmpdir(), directory); if (!target || target.startsWith('..') || isAbsolute(target)) throw Error('Invalid fixture cleanup'); await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 75000);

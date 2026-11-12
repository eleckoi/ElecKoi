import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('keeps long setting text and variable fields virtualized, editable and complete through saves', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-editor-long-text-'));
  try {
    for (const name of ['setting', 'variable', 'character-openings']) await build({ entryPoints: [`apps/web/tests/browser/${name === 'character-openings' ? name : name + '-workspace'}.fixture.jsx`], outfile: resolve(directory, `${name}.js`), bundle: true, format: 'esm', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') }, loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'dataurl', '.png': 'dataurl' }, logLevel: 'warning',
      plugins: [{ name: 'inline-css', setup(builder) {
        builder.onResolve({ filter: /\.css\?inline$/ }, args => ({ path: resolve(dirname(args.importer), args.path.replace(/\?inline$/, '')), namespace: 'inline-css' }));
        builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({ loader: 'text', contents: (await build({ stdin: { contents: await readFile(args.path, 'utf8'), loader: 'css', resolveDir: dirname(args.path) }, bundle: true, write: false, logLevel: 'warning' })).outputFiles[0].text }));
      } }],
    });
    for (const name of ['setting', 'variable', 'character-openings']) await writeFile(resolve(directory, `${name}.html`), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}body{margin:0}.side-panel-brand .eleckoi-wordmark{width:139px}</style><link rel="stylesheet" href="${name}.css"></head><body><div id="root"></div><script type="module" src="${name}.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/editor-long-text.probe.cjs'), directory, resolve(directory, 'report.json')], { env, windowsHide: true, timeout: 150000 });
    const result = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
    const evidence = resolve('build/editor-long-text-check'); await mkdir(evidence, { recursive: true });
    for (const file of await readdir(directory)) if (/\.png$/.test(file) || file === 'report.json') await copyFile(resolve(directory, file), resolve(evidence, file));
    const preview = resolve(evidence, 'preview'); await mkdir(preview, { recursive: true });
    for(const file of await readdir(directory))if(/\.(?:html|js|css|woff2?|ttf)$/.test(file))await copyFile(resolve(directory,file),resolve(preview,file));
    expect(result.errors).toEqual([]); expect(result.measurements).toHaveLength(8); expect(Object.values(result.actions).every(Boolean)).toBe(true);
  } finally {
    const debug = resolve('build/editor-long-text-check'); await mkdir(debug, { recursive: true });
    for (const name of await readdir(directory)) if (/\.png$/.test(name) || name === 'report.json') await copyFile(resolve(directory, name), resolve(debug, name));
    const target = relative(tmpdir(), directory); if (!target || target.startsWith('..') || isAbsolute(target)) throw Error('Invalid fixture cleanup'); await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 170000);

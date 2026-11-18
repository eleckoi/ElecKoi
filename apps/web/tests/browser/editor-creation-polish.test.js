import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('creates settings and variables without selecting their names, aligns root variable rows and uses the official menu shadow', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-editor-creation-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/mobile-editor-layout.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') }, define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'dataurl', '.png': 'dataurl' }, logLevel: 'silent', plugins: [{ name: 'inline-css', setup(builder) {
      builder.onResolve({ filter: /\.css\?inline$/ }, args => ({ path: resolve(dirname(args.importer), args.path.replace(/\?inline$/, '')), namespace: 'inline-css' }));
      builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({ loader: 'text', contents: (await build({ stdin: { contents: await readFile(args.path, 'utf8'), loader: 'css', resolveDir: dirname(args.path) }, bundle: true, write: false, logLevel: 'silent' })).outputFiles[0].text }));
    } }] });
    await writeFile(resolve(directory, 'fixture.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    let failure;
    try { await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/editor-creation-polish.probe.cjs'), resolve(directory, 'fixture.html'), resolve(directory, 'report.json')], { env, timeout: 45000, windowsHide: true }); } catch(error) { failure = error; }
    const report = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
    const evidence = resolve('build/editor-creation-polish-check'); await mkdir(evidence, { recursive: true });
    for (const file of await readdir(directory)) if (/\.png$/.test(file) || file === 'report.json') await copyFile(resolve(directory, file), resolve(evidence, file));
    expect(failure, JSON.stringify(report)).toBeUndefined();
    expect(report.errors).toEqual([]); expect(report.cases).toHaveLength(18);
    expect(report.assetMenus).toHaveLength(18);
    for (const menu of report.assetMenus) {
      const detail = JSON.stringify(menu);
      expect(menu.sameRoot, detail).toBe(true); expect(menu.visible, detail).toBe(true); expect(menu.gap, detail).toBeLessThan(1);
    }
    for (const row of report.cases) {
      const detail = JSON.stringify(row);
      expect(row.selection.start, detail).toBe(row.selection.end);
      expect(row.selection.focused, detail).toBe(false);
      if (row.shadow) { expect(row.shadow.actual, detail).toBe(row.shadow.official); expect(row.shadow.toolbar, detail).toBe('none'); }
      if (row.alignment) for (const field of ['icon','title']) {
        expect(row.alignment.variable[field], detail).toBeCloseTo(row.alignment.fixed[field], 1);
        expect(row.alignment.group[field], detail).toBeCloseTo(row.alignment.fixed[field], 1);
      }
      if (row.rowLayout && row.kind === 'variables') {
        const reference = report.cases.find(item => item.kind === 'settings' && item.theme === row.theme && item.width === row.width).rowLayout;
        for (const field of ['icon','title','searchGap','height']) expect(row.rowLayout[field], detail).toBeCloseTo(reference[field], 1);
      }
    }
  } finally {
    const path = relative(tmpdir(), directory); if (!path || path.startsWith('..') || isAbsolute(path)) throw Error('Unexpected fixture cleanup path');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);

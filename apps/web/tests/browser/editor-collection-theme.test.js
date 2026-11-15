import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('uses official theme surfaces and switch colors in script and regex lists on compact phone and tablet pages', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-collection-theme-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/mobile-editor-layout.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') }, define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'dataurl', '.png': 'dataurl' }, logLevel: 'silent', plugins: [{ name: 'inline-css', setup(builder) {
      builder.onResolve({ filter: /\.css\?inline$/ }, args => ({ path: resolve(dirname(args.importer), args.path.replace(/\?inline$/, '')), namespace: 'inline-css' }));
      builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({ loader: 'text', contents: (await build({ stdin: { contents: await readFile(args.path, 'utf8'), loader: 'css', resolveDir: dirname(args.path) }, bundle: true, write: false, logLevel: 'silent' })).outputFiles[0].text }));
    } }] });
    await writeFile(resolve(directory, 'fixture.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/editor-collection-theme.probe.cjs'), resolve(directory, 'fixture.html'), resolve(directory, 'report.json')], { env, timeout: 45000, windowsHide: true });
    const report = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
    const evidence = resolve('build/official-neutral-theme-check/collections'); await mkdir(evidence, { recursive: true });
    for (const file of await readdir(directory)) if (/\.png$/.test(file) || file === 'report.json') await copyFile(resolve(directory, file), resolve(evidence, file));
    expect(report.errors).toEqual([]); expect(report.layouts).toHaveLength(24);
    for (const row of report.layouts) {
      const detail = JSON.stringify(row);
      expect(row.surface, detail).toBe(row.officialSurface);
      expect(row.text, detail).toBe(row.officialText);
      expect(row.selected, detail).toBe(row.officialActive);
      expect(row.onTrack, detail).toBe(row.officialOnTrack);
      expect(row.onThumb, detail).toBe(row.officialOnThumb);
      expect(row.offTrack, detail).toBe(row.officialOffTrack);
      expect(row.offThumb, detail).toBe(row.officialOffThumb);
      expect(row.checked, detail).toBe(false);
      expect(row.overflow, detail).toBe(false);
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 60000);

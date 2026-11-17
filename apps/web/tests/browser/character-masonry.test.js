import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('virtualizes 10001 variable-height character cards on PC and mobile, preserving navigation and actions', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-character-masonry-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/character-masonry.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic',
      alias: { '@shared': resolve('packages/shared/src') }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.DSH_CLIENT_TITLE': '"ElecKoi"' },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' }, logLevel: 'silent' });
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><style>html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="fixture.js"></script></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/character-masonry.probe.cjs'), html, report], { env, windowsHide: true, timeout: 60000 });
    const result = JSON.parse(await readFile(report, 'utf8'));
    const evidence = resolve('build/character-masonry-check'); await mkdir(evidence, { recursive: true }); await copyFile(report, resolve(evidence, 'report.json'));
    for (const row of result.layouts) await copyFile(resolve(directory, `masonry-${row.mobile ? 'mobile' : 'pc'}-${row.width}.png`), resolve(evidence, `masonry-${row.mobile ? 'mobile' : 'pc'}-${row.width}.png`));
    expect(result.errors).toEqual([]); expect(result.layouts).toHaveLength(5);
    for (const row of result.layouts) for (const stage of [row.top, row.middle, row.last]) {
      expect(stage.mounted, JSON.stringify(row)).toBeGreaterThan(0); expect(stage.mounted, JSON.stringify(row)).toBeLessThan(65);
      expect(stage.overflow, JSON.stringify(row)).toBe(false); expect(stage.overlap, JSON.stringify(row)).toBe(false);
    }
    for (const row of result.layouts) expect(row.last.cards.some(item => item.id === 'card-10000')).toBe(true);
    expect(result.actions).toContainEqual(['edit', 'card-10000']); expect(result.actions).toContainEqual(['duplicate', 'card-10000']);
    expect(result.resized.columns).toBe(2); expect(result.resized.mounted).toBeLessThan(65); expect(result.resized.offset).toBeGreaterThan(0);
  } finally {
    const path = relative(tmpdir(), directory); if (!path || path.startsWith('..') || isAbsolute(path)) throw Error('Unexpected fixture path');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 70000);

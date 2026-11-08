import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('centers the painted plus inside the visible button across sidebars and fractional zoom', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-sidebar-create-icon-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/sidebar-groups.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic',
      alias: { '@shared': resolve('packages/shared/src') }, loader: { '.png': 'file', '.svg': 'dataurl', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, `<!doctype html><html><head><meta charset="utf-8"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root" style="height:100vh"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/sidebar-create-icon.probe.cjs'), html, report], { env, timeout: 45000, windowsHide: true });
    const { rows, errors } = JSON.parse(await readFile(report, 'utf8'));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(40);
    for (const row of rows) {
      const detail = JSON.stringify(row);
      expect(row.dpr, detail).toBeCloseTo(row.zoom, 3);
      expect(row.button.width, detail).toBeCloseTo(30, 3);
      expect(row.button.height, detail).toBeCloseTo(30, 3);
      expect(row.mass, detail).toBeGreaterThan(100);
      expect(Math.abs(row.offset.x), detail).toBeLessThan(.35);
      expect(Math.abs(row.offset.y), detail).toBeLessThan(.35);
      expect(row.officialArtwork, detail).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 60000);

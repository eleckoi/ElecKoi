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

it('keeps sidebar groups the same width and their active heading reachable while scrolling and collapsing', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-character-groups-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/character-groups.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic',
      alias: { '@shared': resolve('packages/shared/src') }, loader: { '.png': 'file', '.svg': 'dataurl', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, `<!doctype html><html><head><meta charset="utf-8"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/character-groups.probe.cjs'), html, report], { env, timeout: 45000, windowsHide: true });
    const rows = JSON.parse(await readFile(report, 'utf8'));
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      const detail = JSON.stringify(row);
      expect(row.expanded.header.width, detail).toBeCloseTo(row.collapsed.header.width, 1);
      expect(row.sticky.scrollTop, detail).toBeGreaterThan(1000);
      expect(row.sticky.header.top, detail).toBeCloseTo(row.sticky.scroll.top, 1);
      expect(row.sticky.topHit, detail).toBe(true);
      expect(row.sticky.expanded, detail).toBe('true');
      expect(row.folded.header.top, detail).toBeGreaterThanOrEqual(row.folded.scroll.top - 1);
      expect(row.folded.header.bottom, detail).toBeLessThanOrEqual(row.folded.scroll.bottom + 1);
      expect(row.folded.expanded, detail).toBe('false');
      expect(row.nextSticky.topHit, detail).toBe(true);
      expect(row.nextSticky.header.top, detail).toBeCloseTo(row.nextSticky.scroll.top, 1);
      expect(row.old.header.bottom, detail).toBeLessThanOrEqual(row.nextSticky.scroll.top + 1);
      expect(row.nextFolded.header.top, detail).toBeGreaterThanOrEqual(row.nextFolded.scroll.top - 1);
      expect(row.expanded.scrollbarWidth, detail).toBe('5px');
      expect(row.expanded.nativeScrollbar, detail).toBe('none');
      expect(row.expanded.clientWidth, detail).toBeCloseTo(row.expanded.scroll.width, 0);
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 60000);

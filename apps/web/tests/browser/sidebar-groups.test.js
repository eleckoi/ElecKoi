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

it('keeps preset, plugin and model groups reachable and all sidebar scrollbars on the official skin', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-sidebar-groups-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/sidebar-groups.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic',
      alias: { '@shared': resolve('packages/shared/src') }, loader: { '.png': 'file', '.svg': 'dataurl', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, `<!doctype html><html><head><meta charset="utf-8"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root" style="height:100vh"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/sidebar-groups.probe.cjs'), html, report], { env, timeout: 90000, windowsHide: true });
    const { rows, errors } = JSON.parse(await readFile(report, 'utf8'));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(24);
    for (const row of rows) {
      const detail = JSON.stringify(row);
      expect(row.sticky.scrollTop, detail).toBeGreaterThan(100);
      expect(row.sticky.scrollbarWidth, detail).toBe('5px');
      expect(row.collapsed.nativeScrollbar, detail).toBe('none');
      expect(row.collapsed.standardWidth, detail).toBe('none');
      expect(row.collapsed.standardColor, detail).toBe('auto');
      expect(row.sticky.clientWidth, detail).toBeCloseTo(row.sticky.scroll.width, 0);
      expect(row.sticky.item.right, detail).toBeCloseTo(row.sticky.scroll.right, 0);
      expect(row.selected, detail).toBe(true);
      expect(row.filtered.count, detail).toBe(row.kind === 'presets' ? 2 : 1);
      expect(row.filtered.names.every(name => name.includes('合成条目 90')), detail).toBe(true);
      expect(row.restored, detail).toBe(row.kind === 'presets' ? 180 : 90);
      expect(row.short.bar, detail).toBe(false);
      expect(row.short.selected, detail).toBe(true);
      expect(row.short.rightHit, detail).toBe(true);
      expect(row.short.item.right, detail).toBeCloseTo(row.short.scroll.right, 0);
      expect(row.short.clientWidth, detail).toBeCloseTo(row.short.scroll.width, 0);
      expect(row.short.background, detail).not.toBe('rgba(0, 0, 0, 0)');
      expect(row.drag.captured, detail).toBe(true);
      expect(row.drag.released, detail).toBe(true);
      expect(row.drag.value, detail).toBeGreaterThan(row.drag.max * .5);
      expect(row.drag.home, detail).toBe(0);
      expect(row.drag.end, detail).toBeCloseTo(row.drag.max, 0);
      if(row.trackInput) {
        expect(row.trackInput.clicked, detail).toBeGreaterThan(row.drag.max * .4);
        expect(row.trackInput.wheel, detail).toBeGreaterThan(0);
      }
      if (row.kind === 'messages') { expect(row.sticky.header, detail).toBeUndefined(); continue; }
      expect(row.collapsed.scrollWidth, detail).toBeLessThanOrEqual(row.collapsed.clientWidth);
      expect(row.expanded.header.width, detail).toBeCloseTo(row.collapsed.header.width, 1);
      expect(row.sticky.header.top, detail).toBeCloseTo(row.sticky.scroll.top, 1);
      expect(row.sticky.topHit, detail).toBe(true);
      expect(row.sticky.expanded, detail).toBe('true');
      for (const state of [row.folded, row.nextFolded]) {
        expect(state.header.top, detail).toBeGreaterThanOrEqual(state.scroll.top - 1);
        expect(state.header.bottom, detail).toBeLessThanOrEqual(state.scroll.bottom + 1);
        expect(state.expanded, detail).toBe('false');
      }
      expect(row.nextSticky.topHit, detail).toBe(true);
      expect(row.nextSticky.header.top, detail).toBeCloseTo(row.nextSticky.scroll.top, 1);
      expect(row.old.header.bottom, detail).toBeLessThanOrEqual(row.nextSticky.scroll.top + 1);
    }
    for (const kind of ['presets', 'plugins', 'models', 'messages']) {
      const pair = rows.filter(row => row.kind === kind && row.width === 328);
      expect(pair[0].sticky.scrollbarColor).not.toBe(pair[1].sticky.scrollbarColor);
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 105000);

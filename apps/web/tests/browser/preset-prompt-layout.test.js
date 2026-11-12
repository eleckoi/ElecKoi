import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('keeps prompt rows reachable beside the current workspace through selection, resizing and clearing', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-prompt-layout-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/preset-prompt-layout.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(htmlPath, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/preset-prompt-layout.probe.cjs'), htmlPath, reportPath], { env, timeout: 45000, windowsHide: true });
    const { reports } = JSON.parse(await readFile(reportPath, 'utf8'));
    expect(reports).toHaveLength(3);
    for (const report of reports) {
      for (const phase of ['open', 'resized']) {
        const state = report[phase];
        expect(state.rowRight, JSON.stringify(report)).toBeLessThanOrEqual(state.inspectorLeft);
        expect(state.toggleReachable, JSON.stringify(report)).toBe(true);
        expect(state.inspectorTop, JSON.stringify(report)).toBe(state.directoryTop);
        expect(state.resizer, JSON.stringify(report)).toBe(true);
      }
      expect(report.resized.treeWidth, JSON.stringify(report)).toBeLessThan(report.open.treeWidth);
      expect(report.afterClose.treeWidth).toBe(report.resized.treeWidth);
      expect(report.afterClose.empty).toBe(true);
      expect(report.lastVisible).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 60000);

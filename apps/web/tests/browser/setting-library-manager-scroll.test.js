import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('keeps long merge lists and short-screen manager cards scrollable without clipping controls', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-dialog-scroll-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/manager-scroll.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') }, loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(htmlPath, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/manager-scroll.probe.cjs'), htmlPath, reportPath], { env, timeout: 30000, windowsHide: true });
    const reports = JSON.parse(await readFile(reportPath, 'utf8'));
    for (const report of reports) {
      if (report.kind === 'sources') {
        expect(report.initial.overflow, JSON.stringify(report)).toMatch(/^(auto|scroll)$/);
        expect(report.initial.scroll, JSON.stringify(report)).toBeGreaterThan(report.initial.client);
        expect(report.moved, JSON.stringify(report)).toBeGreaterThan(0);
        expect(report.final.bottomVisible, JSON.stringify(report)).toBe(true);
        expect(report.final.search).toBe(report.initial.search);
        expect(report.final.footer).toBe(report.initial.footer);
        expect(report.picker.top).toBeGreaterThan(0);
        expect(report.picker.lastVisible, JSON.stringify(report)).toBe(true);
      } else {
        if (report.mode === 'setting') {
          expect(report.actions).toContain('导出当前版本');
          expect(report.actions).not.toContain('导入为新版本');
          expect(report.actions).not.toContain('并入设定库');
        }
        expect(report.top, JSON.stringify(report)).toBeGreaterThan(0);
        expect(report.noClippedCards, JSON.stringify(report)).toBe(true);
        expect(report.lastVisible, JSON.stringify(report)).toBe(true);
      }
    }
    expect(reports).toHaveLength(6);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 60000);

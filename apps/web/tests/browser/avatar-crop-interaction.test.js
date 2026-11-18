import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('aligns crop controls and pinches in both directions with real touch input before saving', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-crop-gesture-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/avatar-crop-interaction.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'esm', jsx: 'automatic',
      alias: { '@shared': resolve('packages/shared/src') }, loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' }, logLevel: 'silent' });
    await build({ entryPoints: ['apps/web/src/ui/ui/cropPng.worker.js'], outfile: resolve(directory, 'cropPng.worker.js'), bundle: true, format: 'esm', alias: { '@shared': resolve('packages/shared/src') }, logLevel: 'silent' });
    await writeFile(resolve(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + browserThemeCss() + '</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script type="module" src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/avatar-crop-interaction.probe.cjs'), directory], { env, windowsHide: true, timeout: 45000 });
    const report = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
    await mkdir('build/frontend-menu-crop', { recursive: true });
    await copyFile(resolve(directory, 'report.json'), 'build/frontend-menu-crop/crop.json');
    expect(report.failure, JSON.stringify(report)).toBeUndefined(); expect(report.errors).toEqual([]);
    expect(report.layouts).toHaveLength(16);
    for (const row of report.layouts) {
      const detail = JSON.stringify(row), size = row.width < 1000 ? 48 : 40;
      expect(row.buttonWidths, detail).toEqual([size, size]); expect(row.buttonHeights, detail).toEqual([size, size]);
      expect(row.sliderHeight, detail).toBeGreaterThanOrEqual(40); expect(row.gap, detail).toBeGreaterThanOrEqual(12);
      expect(row.hintGap, detail).toBeGreaterThanOrEqual(0); expect(row.overlap, detail).toBe(false); expect(row.overflow, detail).toBe(false);
      for (const icon of row.icons) { expect(icon.size, detail).toBe(16); expect(icon.drift, detail).toBeLessThan(1); }
    }
    expect(report.enlarged).toBeCloseTo(2); expect(report.reduced).toBe(1); expect(report.rotation).toContain('rotate(90deg)');
    expect(report.saved).toMatchObject({ width: 420, height: 560, type: 'image/png' }); expect(report.saved.size).toBeGreaterThan(0);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 55000);

import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('keeps the standalone opening editor usable across themes, short windows and compact navigation', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-character-openings-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/character-openings.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(resolve(directory, 'theme.css'), browserThemeCss());
    await writeFile(htmlPath, '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"></head><body><div id="root" style="height:100vh"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/character-openings.probe.cjs'), htmlPath, reportPath], { env, timeout: 45000, windowsHide: true });
    const reports = JSON.parse(await readFile(reportPath, 'utf8'));
    expect(reports).toHaveLength(8);
    for (const { width, height, layout, backupButtons, settingsSeparated, binding, noOpeningVersions, referenceSearchAppearance } of reports) {
      expect(layout.navigation.slice(0, 3)).toEqual(['基础资料', '开场白', '设定库']);
      expect(layout.horizontalOverflow).toBe(false);
      for (const button of [...layout.iconButtons, ...backupButtons]) {
        expect(Math.abs(button.width - button.height), JSON.stringify(button)).toBeLessThan(2);
        expect(button.right).toBeLessThanOrEqual(layout.panel.right);
        if (width < 700) expect(button.width).toBe(32);
      }
      expect(layout.switchPresent).toBe(false);
      expect(layout.search.width).toBeGreaterThan(0);
      expect(layout.search.x).toBeGreaterThanOrEqual(layout.panel.x);
      expect(layout.search.right).toBeLessThanOrEqual(layout.controls[0].x);
      expect(layout.searchAppearance).toEqual(referenceSearchAppearance);
      expect(layout.panel.bottom).toBeLessThanOrEqual(height);
      expect(layout.panel.right).toBeLessThanOrEqual(width);
      for (const control of layout.controls) { expect(control.x).toBeGreaterThanOrEqual(layout.panel.x); expect(control.right).toBeLessThanOrEqual(layout.panel.right); }
      expect(layout.material.fill).toBe(layout.material.officialFill);
      expect(layout.material.filter).toBe(layout.material.officialFilter);
      expect(layout.title.x-layout.card.x).toBeLessThan(60);
      if (width>640) {
        expect(layout.controls.map(control=>control.height)).toEqual([36,36]);
        expect(layout.controls[1].x).toBeGreaterThan(layout.controls[0].x);
        expect(layout.controls[0].y).toBe(layout.controls[1].y);
      }
      expect(settingsSeparated).toBe(true);
      expect(binding).toBe('synthetic-variables');
      expect(noOpeningVersions).toBe(true);
    }
    await mkdir(resolve('output/playwright'), { recursive: true });
    for (const theme of ['light', 'dark']) for (const width of [1440, 900, 390]) await copyFile(resolve(directory, `character-openings-${theme}-${width}.png`), resolve('output/playwright', `character-openings-${theme}-${width}.png`));
    for (const theme of ['light', 'dark']) await copyFile(resolve(directory, `character-openings-collapsed-${theme}.png`), resolve('output/playwright', `character-openings-collapsed-${theme}.png`));
    await copyFile(resolve(directory, 'character-openings-toolbar-preview.png'), resolve('output/playwright', 'character-openings-toolbar-preview.png'));
    await copyFile(resolve(directory, 'character-openings-list-preview.png'), resolve('output/playwright', 'character-openings-list-preview.png'));
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 60000);

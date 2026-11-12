import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('keeps setting merge controls usable on desktop and mobile in both owners and themes', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-mobile-editor-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/mobile-editor-layout.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file' }, logLevel: 'silent' });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(resolve(directory, 'theme.css'), browserThemeCss());
    await writeFile(htmlPath, '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    // A freshly installed Electron image can stay locked for a moment on Windows
    // CI (antivirus scan); retry the launch instead of failing the layout checks.
    const launch = async (attempt = 0) => {
      try {
        return await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/mobile-editor-layout.probe.cjs'), htmlPath, reportPath], { env, timeout: 45000, windowsHide: true });
      } catch (error) {
        if (attempt >= 2 || !['EBUSY', 'ETXTBSY', 'EPERM'].includes(error.code)) throw error;
        await new Promise(done => setTimeout(done, 1000 * (attempt + 1)));
        return launch(attempt + 1);
      }
    };
    await launch();
    const { merges } = JSON.parse(await readFile(reportPath, 'utf8'));
    expect(merges).toHaveLength(12);
    for (const report of merges) {
      const evidence = JSON.stringify(report);
      expect(report.mixed, evidence).toBe('mixed');
      expect(report.checked, evidence).toEqual(['true', 'true', 'true']);
      expect(report.canMerge, evidence).toBe(true);
      for (const box of report.boxes) {
        expect(box.mark.width, evidence).toBe(16); expect(box.mark.height, evidence).toBe(16);
        expect(box.hit.height, evidence).toBe(report.compact ? 48 : 16);
        expect(box.hit.width, evidence).toBe(report.compact ? 44 : 16);
        expect(box.hit.right, evidence).toBeLessThanOrEqual(report.dialog.right);
      }
    }
  } finally {
    const path = relative(tmpdir(), directory);
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Unexpected fixture path');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);

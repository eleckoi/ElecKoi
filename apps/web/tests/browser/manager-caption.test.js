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

it('matches each manager canvas with native caption buttons across light, dark and system themes', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-manager-caption-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/manager-caption.fixture.jsx'], outfile: resolve(directory, 'fixture.js'),
      bundle: true, format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' }, logLevel: 'silent' });
    await build({ stdin: { contents: 'import { installWindowsAppearance } from "./apps/desktop/src/preload/windowsAppearance.ts"; window.stopCaptionAppearance = installWindowsAppearance();', resolveDir: process.cwd() },
      outfile: resolve(directory, 'appearance.js'), bundle: true, format: 'iife', alias: { '@shared': resolve('packages/shared/src') }, logLevel: 'silent',
      plugins: [{ name: 'caption-host', setup(builder) {
        builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'caption-host' }));
        builder.onLoad({ filter: /.*/, namespace: 'caption-host' }, () => ({ contents:
          'window.nativeCaptionColors = []; export const ipcRenderer = { send(channel, ...colors) { window.nativeCaptionColors.push(colors); } };', loader: 'js' }));
      } }] });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script><script src="appearance.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/manager-caption.probe.cjs'), htmlPath, reportPath],
      { env, timeout: 45000, windowsHide: true });
    const result = JSON.parse(await readFile(reportPath, 'utf8'));
    if (process.env.ELECKOI_MANAGER_CAPTION_REPORT) await writeFile(process.env.ELECKOI_MANAGER_CAPTION_REPORT, JSON.stringify(result, null, 2));
    expect(result.errors).toEqual([]);
    expect(result.reports).toHaveLength(8);
    for (const report of result.reports) for (const state of report.states) {
      const detail = JSON.stringify({ ...report, states: [state] });
      expect(state.native[1], detail).toBe(state.expected);
      expect(state.native[2], detail).toBe(state.theme === 'dark' || (state.theme === 'system' && report.initial === 'system-dark')
        ? 'rgba(242, 242, 245, 1)' : 'rgba(17, 17, 17, 1)');
      expect(state.customControls, detail).toBe(0);
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 60000);

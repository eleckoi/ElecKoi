import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('keeps every desktop plugin header action on one visible, clickable row after fractional measurement and reentry', async () => {
  const evidence = resolve('build/plugin-header-20261114'); await mkdir(evidence, { recursive: true });
  const directory = await mkdtemp(resolve(evidence, 'desktop-'));
  await build({ entryPoints: ['apps/web/tests/browser/mobile-plugin-header.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') }, loader: { '.png': 'file', '.svg': 'dataurl', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
  const source = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-plugin-manager/client'), 'utf8');
  await writeFile(resolve(directory, 'official.js'), source.replace('return module.exports', 'return {...module.exports,PluginManagerPage,createPluginHeaderRef,IDLE_INSTALL,zh};'));
  const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
  await writeFile(html, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script><script src="official.js"></script></body></html>`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/desktop-plugin-header.probe.cjs'), html, report], { env, windowsHide: true, timeout: 45000 });
  const result = JSON.parse(await readFile(report, 'utf8'));
  expect(result.errors).toEqual([]); expect(result.rows).toHaveLength(54);
  for (const row of result.rows) {
    const detail = JSON.stringify(row);
    expect(row.overflow, detail).toBe(false); expect(row.buttons, detail).toHaveLength(3);
    expect(row.toolbar.height, detail).toBeLessThan(40);
    for (const button of row.buttons) {
      expect(button.clickable, detail).toBe(true);
      expect(button.top, detail).toBeCloseTo(row.buttons[0].top, 1);
      expect(button.top, detail).toBeGreaterThanOrEqual(row.head.top - 1);
      expect(button.bottom, detail).toBeLessThanOrEqual(row.head.bottom + 1);
    }
  }
}, 60000);

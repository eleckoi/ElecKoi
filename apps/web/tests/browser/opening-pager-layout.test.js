import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('keeps opening arrows below the floor and message and switches to blank content without losing the pager', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-opening-pager-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/message-layout.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') }, loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'dataurl' }, logLevel: 'silent' });
    await writeFile(resolve(directory, 'fixture.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}#eleckoi-root{--chat-reading-width:680px}.chat-panel{height:100%}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="eleckoi-root"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/opening-pager-layout.probe.cjs'), resolve(directory, 'fixture.html'), resolve(directory, 'report.json')], { env, windowsHide: true, timeout: 60000 });
    const report = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
    const evidence = resolve('build/opening-management-check'); await mkdir(evidence, { recursive: true });
    await copyFile(resolve(directory, 'report.json'), resolve(evidence, 'pager.json'));
    expect(report.errors).toEqual([]);
    expect(report.layouts).toHaveLength(36);
    for (const data of report.layouts) {
      const detail = JSON.stringify(data);
      expect(data.arrowsTop, detail).toBeGreaterThanOrEqual(data.floorBottom - .5);
      expect(data.arrowsTop, detail).toBeGreaterThanOrEqual(data.contentBottom - .5);
      expect(data.arrowOffset, detail).toBeLessThan(.5);
      expect(data.overflow, detail).toBe(false);
      expect(data.blankPage, detail).toBe('2/3');
      expect(data.blankHasBody, detail).toBe(false);
      expect(data.returnPage, detail).toBe('1/3');
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 75000);

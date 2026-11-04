import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { BROWSER_LIBRARY_SCRIPTS, BROWSER_LIBRARY_STYLES } from '@eleckoi/dsh-client-html-resources/browser-libraries';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('commits every rich card without scrolling on first entry and after changing conversations', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-rich-settling-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/rich-message-settling.fixture.jsx'], outfile: resolve(directory, 'fixture.js'),
      bundle: true, format: 'iife', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.png': 'file', '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'dataurl' }, logLevel: 'silent' });
    for (const file of [...BROWSER_LIBRARY_SCRIPTS, ...BROWSER_LIBRARY_STYLES]) {
      const destination = resolve(directory, 'libraries', file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve('packages/client/features/dsh-client-html-resources/assets', file), destination);
    }
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css">
      <style>body{margin:0;font:16px sans-serif}.chat-conversation-body{min-height:0;flex:1;display:flex;flex-direction:column}</style>
      </head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/rich-message-settling.probe.cjs'), htmlPath, reportPath],
      { env, timeout: 90000, windowsHide: true });
    const reports = JSON.parse(await readFile(reportPath, 'utf8'));
    expect(reports).toHaveLength(16);
    for (const report of reports) {
      const evidence = JSON.stringify(report);
      expect(report.stages, evidence).toEqual(['false']);
      expect(report.heights, evidence).toEqual(['600px', '600px', '600px']);
      expect(report.modules, evidence).toEqual(report.native ? [null, null, null] : [null, null, ['first', 'second', 'dom-ready']]);
      expect(report.raw, evidence).toBe(false);
      expect(report.scrollTop, evidence).toBe(0);
    }
  } finally {
    const path = relative(tmpdir(), directory);
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Unexpected fixture path');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 100000);

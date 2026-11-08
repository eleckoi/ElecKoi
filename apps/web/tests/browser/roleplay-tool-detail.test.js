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
it('settles result details without a scrollbar measurement loop and keeps complete long results readable', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-tool-detail-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/roleplay-tool-detail.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic',
      alias: { '@shared': resolve('packages/shared/src') }, loader: { '.png': 'file', '.svg': 'dataurl', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/roleplay-tool-detail.probe.cjs'), html, report], { env, timeout: 55000, windowsHide: true });
    const { rows, errors } = JSON.parse(await readFile(report, 'utf8'));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      const detail = JSON.stringify(row);
      expect(row.frameStates, detail).toHaveLength(1);
      expect(row.overlapping, detail).toBe(false);
      expect(row.count, detail).toBe(row.domain === 'variables' ? 128 : 86);
      expect(row.tailVisible, detail).toBe(true);
      expect(row.mountedParts, detail).toBeLessThan(30);
      expect(row.returnedToDirectory, detail).toBe(true);
      expect(row.horizontalOverflow, detail).toBe(false);
      if (row.domain === 'variables') expect(row.falseValuePreserved, detail).toBe(true);
      if (row.resizedFrameStates) expect(row.resizedFrameStates, detail).toHaveLength(1);
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 65000);

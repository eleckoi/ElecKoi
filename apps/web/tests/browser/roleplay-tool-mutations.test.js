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

it('shows readable mutation rows, complete large changes and stable mobile/desktop layouts in both themes', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-mutations-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/roleplay-tool-mutations.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic',
      alias: { '@shared': resolve('packages/shared/src') }, loader: { '.png': 'file', '.svg': 'dataurl', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/roleplay-tool-mutations.probe.cjs'), html, report], { env, timeout: 55000, windowsHide: true });
    const { rows, errors } = JSON.parse(await readFile(report, 'utf8'));
    expect(errors).toEqual([]); expect(rows).toHaveLength(4);
    for (const row of rows) {
      const message = JSON.stringify(row);
      expect(row.readable, message).toBe(true); expect(row.fallback, message).toBe(false);
      expect(row.bookPaths, message).toBe(1); expect(row.noOverlap, message).toBe(true); expect(row.horizontalOverflow, message).toBe(false);
      expect(row.editIcon, message).toBe(true); expect(row.iconArtwork, message).toBe(true);
      expect(row.failed, message).toBe('error'); expect(row.unchanged, message).toBe('unchanged');
      expect(row.settings.every(item => item.body), message).toBe(true);
      expect(row.settings.find(item => item.id === 'move_file').text, message).toContain('新位置');
      expect(row.settings.find(item => item.id === 'failed').text, message).toContain('120');
      expect(row.variableTail, message).toBe(true); expect(row.settingTail, message).toBe(true);
      expect(row.mountedVariables, message).toBeLessThan(30); expect(row.mountedText, message).toBeLessThan(30);
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 65000);

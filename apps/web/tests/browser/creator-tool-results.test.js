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

it('renders creator operations, all preset results and continuation fragments in desktop and mobile layouts', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-creator-tools-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/creator-tool-results.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic',
      alias: { '@shared': resolve('packages/shared/src') }, loader: { '.png': 'file', '.svg': 'dataurl', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/creator-tool-results.probe.cjs'), html, report, resolve('build/creator-tool-check')], { env, windowsHide: true, timeout: 55000 });
    const result = JSON.parse(await readFile(report, 'utf8'));
    await writeFile(resolve('build/creator-tool-check/browser.json'), JSON.stringify(result, null, 2));
    expect(result.errors).toEqual([]); expect(result.rows).toHaveLength(4);
    for (const row of result.rows) {
      const detail = JSON.stringify(row);
      for(const fonts of row.typography){expect(fonts.summaries.length).toBeGreaterThan(2);for(const summary of fonts.summaries)expect(summary,detail).toEqual(fonts.reference);}
      for (const key of ['finalDirectoryEntry', 'writeTail', 'pageTail', 'readTail', 'readable', 'receipt', 'preview', 'noOverlap']) expect(row[key], detail).toBe(true);
      expect(row.required, detail).toBe('必读'); expect(row.failed, detail).toBe('error'); expect(row.cancelled, detail).toBe('cancelled');
      expect(row.inspected, detail).toBe('edit'); expect(row.fallback, detail).toBe('spilled');
      expect(row.operationIcon, detail).toContain('edit'); expect(row.horizontalOverflow, detail).toBe(false);
      expect(row.operationArtwork, detail).toBe(true);
      expect(row.mountedText, detail).toBeLessThan(35); expect(row.mountedEntries, detail).toBeLessThan(25);
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 65000);

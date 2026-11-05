import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('fills the character region without global CSS and preserves measured slots inside shadow workbenches', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-native-project-layout-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/native-project-layout.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src'), '@eleckoi/author-sdk': resolve('packages/sdk/author/src/index.ts') }, logLevel: 'silent' });
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><style>html,body{margin:0;height:100%}</style><script src="fixture.js"></script>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/native-project-layout.probe.cjs'), html, report], { env, timeout: 45000, windowsHide: true });
    const rows = JSON.parse(await readFile(report, 'utf8')); expect(rows).toHaveLength(8);
    for (const row of rows) {
      const evidence = JSON.stringify(row);
      expect(row.frame.width, evidence).toBe(row.host.width);
      expect(row.frame.height, evidence).toBe(row.automatic ? 240 : row.host.height);
      expect(row.frame.x, evidence).toBe(row.host.x);
      expect(row.frame.y, evidence).toBe(row.host.y);
      expect(row.frame.bottom, evidence).toBeLessThanOrEqual(row.footer.top);
      expect(row.region.height, evidence).toBe(row.frame.height);
    }
  } finally {
    const path = relative(tmpdir(), directory);
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Unexpected fixture path');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);

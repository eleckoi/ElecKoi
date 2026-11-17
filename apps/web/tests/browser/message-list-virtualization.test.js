import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('mounts only viewport rows across 10001 sessions, restores mobile position, and keeps all end-row actions', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-message-virtual-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/message-list-virtualization.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic',
      alias: { '@shared': resolve('packages/shared/src') }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.DSH_CLIENT_TITLE': '"ElecKoi"' },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' }, logLevel: 'silent' });
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script src="fixture.js"></script></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/message-list-virtualization.probe.cjs'), html, report], { env, windowsHide: true, timeout: 45000 });
    const result = JSON.parse(await readFile(report, 'utf8'));
    if (process.env.ELECKOI_AVATAR_REPORT) await writeFile(process.env.ELECKOI_AVATAR_REPORT, JSON.stringify(result, null, 2));
    expect(result.layouts).toHaveLength(4); expect(result.errors).toEqual([]);
    for (const row of result.layouts) {
      for (const stage of [row.top, row.middle, row.last]) expect(stage.mounted, JSON.stringify(row)).toBeLessThan(30);
      expect(row.top.height).toBeGreaterThan(0); expect(row.top.total).toBeGreaterThan(500000); expect(Math.abs(row.top.first)).toBeLessThan(1);
      expect(row.last.hasLast).toBe(true); expect(row.last.overflow).toBe(false);
    }
    expect(result.actions.filter(([name]) => name === 'open')).toEqual(Array(4).fill(['open', 'chat-10000']));
    expect(result.actions.filter(([name]) => name === 'pin')).toEqual(Array(4).fill(['pin', 'chat-10000']));
    expect(result.actions.filter(([name]) => name === 'menu')).toEqual(Array(2).fill(['menu', 'chat-10000']));
  } finally {
    const path = relative(tmpdir(), directory); if (!path || path.startsWith('..') || isAbsolute(path)) throw Error('Unexpected fixture path');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);

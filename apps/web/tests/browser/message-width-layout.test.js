import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('bounds Markdown to its reading column and scrolls wide tables within it on PC and mobile', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-message-layout-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/message-layout.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true, format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') }, loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'dataurl' }, logLevel: 'silent' });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(htmlPath, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><style>#eleckoi-root{--chat-reading-width:680px;--dsw-font-markdown-base:16px/1.5 sans-serif}.chat-panel{height:100%}</style></head><body><div id="eleckoi-root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/message-layout.probe.cjs'), htmlPath, reportPath], { env, timeout: 45000, windowsHide: true });
    const { reports, shortReplies } = JSON.parse(await readFile(reportPath, 'utf8'));
    for (const report of reports) {
      const detail = JSON.stringify(report);
      if (report.query.includes('assistant-bubble')) expect(report.bubbleColor, detail).toBe('rgb(247, 247, 247)');
      expect(report.body.right, detail).toBeLessThanOrEqual(report.column.right + 1);
      expect(report.body.right, detail).toBeLessThanOrEqual(report.viewport);
      expect(report.bodyScroll, detail).toBeLessThanOrEqual(report.bodyClient + 1);
      expect(report.code.right, detail).toBeLessThanOrEqual(report.column.right + 1);
      expect(report.table.right, detail).toBeLessThanOrEqual(report.column.right + 1);
      expect(report.tableScroll, detail).toBeGreaterThan(report.tableClient);
      if (!report.query.includes('desktop')) expect(report.tableOverflow, detail).toBe('auto');
      expect(report.unwrapped.right, detail).toBeLessThanOrEqual(report.column.right + 1);
      expect(report.unwrapped.wrapped, detail).toBe('false');
      expect(report.unwrapped.scroll, detail).toBeGreaterThan(report.unwrapped.client);
      expect(report.unwrapped.overflow, detail).toBe('auto');
      if (!report.query.includes('agent') && !report.query.includes('streaming')) {
        expect(report.more, detail).not.toBeNull();
        expect(report.edit.left, detail).toBeGreaterThan(report.more.right);
        expect(report.edit.top + report.edit.height / 2, detail).toBeCloseTo(report.more.top + report.more.height / 2, 0);
        expect(report.more.top, detail).toBeLessThan(report.heading.bottom);
        expect(report.body.right, detail).toBeLessThanOrEqual(report.more.right + 1);
        if (!report.query.includes('desktop')) {
          expect(report.body.right, detail).toBeGreaterThanOrEqual(report.more.right - 1);
          expect(report.expanded.ready, detail).toBe(true);
          expect(report.expanded.body.right, detail).toBeCloseTo(report.body.right, 0);
          expect(report.expanded.body.width, detail).toBeCloseTo(report.body.width, 0);
          expect(report.collapsed.ready, detail).toBe(true);
          expect(report.collapsed.body.right, detail).toBeCloseTo(report.more.right, 0);
        }
      }
    }
    expect(reports).toHaveLength(10);
    for (const { desktop, rows } of shortReplies) {
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        const detail = JSON.stringify(row);
        expect(row.bubbleWidth, detail).toBeLessThan(row.rowWidth / 2);
        expect(Math.abs(row.bubbleWidth - row.textWidth - row.padding), detail).toBeLessThan(2);
        expect(row.authorFont, detail).toBe(row.shellFont);
        expect(row.authorFont.includes('ElecKoi Mobile Rounded'), detail).toBe(!desktop);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 60000);

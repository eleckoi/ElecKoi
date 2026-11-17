import { execFile } from 'node:child_process';
import { mkdtemp, copyFile, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);

it('preserves crop PNG pixels, transparency and dimensions through real worker encoding', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-crop-png-'));
  try {
    for (const name of ['encodeCropPng.js', 'cropPng.worker.js']) await copyFile(resolve('apps/web/src/ui/ui', name), resolve(directory, name));
    await writeFile(resolve(directory, 'index.html'), '<!doctype html><html><body><script type="module">import {encodeCropPng} from "./encodeCropPng.js";window.encodeCropPng=encodeCropPng;</script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/avatar-crop-encoding.probe.cjs'), directory], { env, windowsHide: true, timeout: 30000 });
    const report = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
    expect(report.errors).toEqual([]);
    expect(report.images).toHaveLength(6);
    for (const row of report.images) {
      expect(row.pixelDifferences, JSON.stringify(row)).toBe(0);
      expect(row.workerSize).toBe(row.originalSize);
      expect(row.samePngBytes, JSON.stringify(row)).toBe(true);
    }
    await mkdir('build/cover-crop-speed-check', { recursive: true });
    await copyFile(resolve(directory, 'report.json'), 'build/cover-crop-speed-check/pixel-comparison.json');
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 45000);

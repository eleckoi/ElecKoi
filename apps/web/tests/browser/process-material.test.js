import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('keeps native reasoning and tool disclosures on the process surface across backdrops and scrolling', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-process-material-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/process-material.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'dataurl' }, logLevel: 'silent' });
    for (const [name, exposed] of [['chat', 'ReasoningRow,ReasoningContent'], ['tool', 'ToolRow']]) {
      const source = await readFile(require.resolve(`@deepseek-ai/dsh-client-ui-${name}/client`), 'utf8');
      if (source.split('return module.exports;').length !== 2) throw Error('Unexpected Client bundle boundary');
      await writeFile(resolve(directory, name + '.js'), source.replace('return module.exports;', `return {...module.exports,${exposed}};`));
    }
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script><script src="chat.js"></script><script src="tool.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/process-material.probe.cjs'), html, report], { env, windowsHide: true, timeout: 35000 });
    const result = JSON.parse(await readFile(report, 'utf8'));
    const evidence = resolve('build/process-material-check'); await mkdir(evidence, { recursive: true });
    for (const name of ['report.json', 'light-390.png', 'light-1000.png', 'dark-390.png', 'dark-1000.png', 'tools-light-1000.png', 'tools-dark-1000.png']) await copyFile(resolve(directory, name), resolve(evidence, name));
    expect(result.errors).toEqual([]);
    expect(result.layouts).toHaveLength(16);
    for (const layout of result.layouts) {
      const detail = JSON.stringify(layout);
      expect(layout.position, detail).toBe('sticky');
      expect(layout.overflow, detail).toBe(false);
      if (layout.stuck) expect(Math.abs(layout.headerTop - layout.scrollTop - layout.paddingTop), detail).toBeLessThan(1);
      expect(Math.max(...layout.headerPixel.map((value, index) => Math.abs(value - layout.surfacePixel[index]))), detail).toBeLessThan(3);
    }
    expect(result.tools).toHaveLength(8);
    for (const tool of result.tools) for (const row of tool.rows) {
      expect(Math.max(...row.header.map((value, index) => Math.abs(value - row.surface[index]))), JSON.stringify({ ...tool, row })).toBeLessThan(3);
    }
    expect(result.actions).toEqual({ nativeCollapsed: true, readable: true, body: true });
  } finally {
    const target = relative(tmpdir(), directory);
    if (!target || target.startsWith('..') || isAbsolute(target)) throw Error('Invalid probe cleanup target');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 45000);

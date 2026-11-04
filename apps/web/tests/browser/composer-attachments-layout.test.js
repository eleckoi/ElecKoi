import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('keeps the official composer centered while all draft attachments scroll within it on PC and mobile', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-composer-attachments-'));
  try {
    const sources = await Promise.all(['conversation', 'attachment'].map(async name => {
      const source = await readFile(require.resolve(`@deepseek-ai/dsh-client-ui-${name}/client`), 'utf8');
      if (source.split('return module.exports;').length !== 2) throw new Error('Locked composer factory changed');
      const exposed = name === 'conversation' ? 'InputBar, QueueDock, DraftEditorRuntime, registerPlainText: O$1' : 'ComposerAttachments';
      return `let ${name};{const captureModule=value=>{${name}=value;};${source.replace('window.__ModuleLoader__.load(', 'captureModule(').replace('return module.exports;', `return {${exposed}};`)}\n}`;
    }));
    await build({ entryPoints: ['apps/web/tests/browser/composer-attachments.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' }, logLevel: 'silent',
      plugins: [{ name: 'official-composer-fixture', setup(build) {
        build.onResolve({ filter: /^official-composer-fixture$/ }, () => ({ path: 'official-composer-fixture', namespace: 'composer-fixture' }));
        build.onLoad({ filter: /.*/, namespace: 'composer-fixture' }, () => ({ resolveDir: resolve('.'), contents: `
          import * as React from 'react';import * as jsxRuntime from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';
          import * as Cordis from '@deepseek-ai/cordis';import * as zod from 'zod';
          import * as store from '@deepseek-ai/dsh-client-store';import * as slots from '@deepseek-ai/dsh-client-ui-slots';
          import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
          ${sources.join('\n')}
          const modules={react:React,'react/jsx-runtime':jsxRuntime,'react-dom':ReactDOM,zod,'@deepseek-ai/cordis':Cordis,
            '@deepseek-ai/dsh-client-store':store,'@deepseek-ai/dsh-client-ui-slots':slots,'@deepseek-ai/dsh-client-ui-primitives':primitives};
          const load=name=>{if(!(name in modules))throw new Error(name);return modules[name]};
          export const {InputBar,QueueDock,DraftEditorRuntime,registerPlainText}=conversation.factory(load);
          export const {ComposerAttachments}=attachment.factory(load);
        ` }));
      } }],
    });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(resolve(directory, 'theme.css'), browserThemeCss());
    await writeFile(htmlPath, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"><style>html,body,#root,main{height:100%;margin:0;min-width:0}*{box-sizing:border-box}.chat-panel{height:100%}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/composer-attachments.probe.cjs'), htmlPath, reportPath], { env, timeout: 90000, windowsHide: true });
    const { attachments: reports, queues } = JSON.parse(await readFile(reportPath, 'utf8')); expect(reports).toHaveLength(80);
    expect(queues).toHaveLength(24);
    const evidence = resolve('output/playwright/composer-attachments'); await mkdir(evidence, { recursive: true });
    await copyFile(reportPath, resolve(evidence, 'report.json'));
    for (const surface of ['roleplay', 'studio']) for (const width of [390, 1440]) await copyFile(resolve(directory, `${surface}-${width}.png`), resolve(evidence, `${surface}-${width}.png`));
    await copyFile(resolve(directory, 'official-upload.png'), resolve(evidence, 'official-upload.png'));
    for (const theme of ['light', 'dark']) await copyFile(resolve(directory, `studio-queue-${theme}.png`), resolve(evidence, `studio-queue-${theme}.png`));
    for (const row of queues) {
      const detail = JSON.stringify(row);
      expect(row.queue.x + row.queue.width / 2, detail).toBeCloseTo(row.card.x + row.card.width / 2, 0);
      expect(row.panel.x, detail).toBeGreaterThanOrEqual(row.card.x);
      expect(row.panel.right, detail).toBeLessThanOrEqual(row.card.right);
      expect(row.panel.bottom - row.card.y, detail).toBeCloseTo(3, 0);
      expect(row.pageWidth, detail).toBeLessThanOrEqual(row.width);
      expect(row.draft, detail).toBe('合成草稿');
      expect(row.actionPresent, detail).toBe(true);
    }
    for (const report of reports) {
      const detail = JSON.stringify(report), baseline = reports.find(item => item.surface === report.surface && item.width === report.width && item.theme === report.theme && item.count === 0);
      expect(report.card.x, detail).toBeCloseTo(baseline.card.x, 0);
      expect(report.card.width, detail).toBeCloseTo(baseline.card.width, 0);
      expect(report.card.right, detail).toBeLessThanOrEqual(report.width);
      expect(report.pageWidth, detail).toBeLessThanOrEqual(report.width);
      expect(report.draft, detail).toBe('合成草稿');
      if (report.count >= 6) expect(report.rail.scroll, detail).toBeGreaterThan(report.rail.client);
    }
  } finally {
    const path = relative(tmpdir(), directory); if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Unexpected fixture path');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 120000);

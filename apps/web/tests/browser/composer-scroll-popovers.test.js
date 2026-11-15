import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('keeps official composer popovers attached through long roleplay scrolling, resizing and trajectory switches', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-scroll-popovers-'));
  try {
    const source = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-chat/client'), 'utf8');
    if (source.split('return module.exports').length !== 2) throw new Error('Locked Chat Client factory changed');
    await build({ entryPoints: ['apps/web/tests/browser/composer-scroll-popovers.fixture.jsx'], outfile: resolve(directory, 'fixture.js'),
      bundle: true, format: 'iife', jsx: 'automatic', logLevel: 'silent', alias: { '@shared': resolve('packages/shared/src') },
      define: { 'process.env.NODE_ENV': '"production"' },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' },
      plugins: [{ name: 'official-scroll-popovers', setup(build) {
        build.onResolve({ filter: /^official-scroll-popovers$/ }, () => ({ path: 'official-scroll-popovers', namespace: 'scroll-popovers' }));
        build.onLoad({ filter: /.*/, namespace: 'scroll-popovers' }, () => ({ resolveDir: resolve('.'), contents: `
          import * as React from 'react'; import * as jsxRuntime from 'react/jsx-runtime'; import * as ReactDOM from 'react-dom';
          import * as virtual from '@tanstack/react-virtual'; import * as store from '@deepseek-ai/dsh-client-store';
          import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
          export { ContextMeter } from './node_modules/@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ContextMeter.tsx';
          export { PermissionSelect } from './node_modules/@deepseek-ai/dsh-client-ui-permission-presets/src/client/PermissionSelect.tsx';
          let registration; const captureModule = value => { registration = value; };
          ${source.replace('window.__ModuleLoader__.load(', 'captureModule(')
            .replace('return module.exports', 'return { ...module.exports, ChatView, ChatFlow, ActivityPill, UsagePill };')}
          const modules = { '@tanstack/react-virtual': virtual, react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM,
            '@deepseek-ai/dsh-client-store': store, '@deepseek-ai/dsh-client-ui-primitives': primitives };
          const load = Object.assign(name => { if (!(name in modules)) throw new Error(name); return modules[name]; }, { asset: name => name });
          const { ChatView: OfficialChatView, ChatFlow, ActivityPill, UsagePill } = registration.factory(load);
          export { ActivityPill, UsagePill };
          export function ChatView(props) {
            return React.createElement(OfficialChatView, { ...props, renderSlot: (name, owner, options) => name !== 'conversation.chat.flow'
              ? props.renderSlot(name, owner, options)
              : React.createElement('div', { 'data-slot': name, style: { display: 'contents' } }, React.createElement(ChatFlow, {
                  ...props, ...owner, useChatNodeBottom: () => false, useGroupAction: () => React.useRef(null), useGroupHeaderAction() {}, renderFactorySlot: () => null,
                })) });
          }
        ` }));
      } }],
    });
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(resolve(directory, 'theme.css'), browserThemeCss());
    await writeFile(html, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"><style>html,body,#root{height:100%;margin:0}.chat-panel{height:100%;width:100%}</style><div id="root"></div><script src="fixture.js"></script>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    // Alternate isolated Electron runtimes exercise the system-WebView Chromium generation.
    const browser = process.env.ELECKOI_POPOVER_BROWSER || require('electron');
    await promisify(execFile)(browser, [resolve('apps/web/tests/browser/composer-scroll-popovers.probe.cjs'), html, report], { env, windowsHide: true, timeout: 75000 });
    const result = JSON.parse(await readFile(report, 'utf8'));
    const evidence = resolve('output/playwright/composer-scroll-popovers'); await mkdir(evidence, { recursive: true });
    await copyFile(report, resolve(evidence, `chromium-${result.chromium}.json`));
    expect(result.errors).toEqual([]);
    expect(result.streaming).toHaveLength(10);
    for (const stream of result.streaming) {
      expect(stream.samples).toHaveLength(24);
      expect(stream.samples.at(-1).scrollHeight).toBeGreaterThan(stream.samples[0].scrollHeight + 1000);
      expect(stream.samples.at(-1).textLength).toBeGreaterThan(stream.samples[0].textLength);
      for (const sample of stream.samples) expect(Math.abs(sample.gap - stream.expectedGap), JSON.stringify({ ...stream, samples: sample })).toBeLessThan(1);
    }
    expect(result.scenarios).toHaveLength(18);
    for (const scenario of result.scenarios) {
      const detail = JSON.stringify(scenario);
      expect(scenario.draft, detail).toBe('Synthetic edited draft');
      expect(scenario.horizontalOverflow, detail).toBeLessThanOrEqual(1);
      expect(scenario.composerBottom, detail).toBeCloseTo(scenario.bodyBottom, 0);
      if (scenario.phase !== 'empty') {
        expect(scenario.floor, detail).toBeGreaterThan(1000);
        expect(scenario.tailGap, detail).toBeGreaterThanOrEqual(-1);
        expect(scenario.returnedToTail, detail).toBe(true);
      }
      for (const panel of scenario.panels) {
        expect(Math.abs(panel.gap - panel.expectedGap), detail).toBeLessThan(1);
        expect(panel.top, detail).toBeGreaterThanOrEqual(0);
        expect(panel.bottom, detail).toBeLessThanOrEqual(scenario.height);
        expect(Math.abs(panel.scrollAfter - panel.scrollBefore), detail).toBeLessThan(1);
      }
    }
    expect(result.historyOpened).toBe(true);
    expect(result.trajectoryKeepsDraft).toBe(true);
    expect(result.moreGap).toBeCloseTo(4, 0);
  } finally {
    const path = relative(tmpdir(), directory); if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Unexpected fixture directory');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 90000);

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('keeps official chat controls and extension content on their shared layout tracks across screen sizes', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-chat-bottom-'));
  try {
    const source = await readFile(resolve('node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js'), 'utf8');
    if (source.split('return module.exports;').length !== 2) throw new Error('Unexpected Chat Client bundle boundary');
    await build({ entryPoints: ['apps/web/tests/browser/chat-bottom-control.fixture.jsx'], outfile: resolve(directory, 'fixture.js'),
      bundle: true, format: 'iife', jsx: 'automatic', logLevel: 'silent',
      alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' },
      plugins: [{ name: 'official-chat-fixture', setup(build) {
        build.onResolve({ filter: /^official-chat-fixture$/ }, () => ({ path: 'official-chat-fixture', namespace: 'chat-fixture' }));
        build.onLoad({ filter: /.*/, namespace: 'chat-fixture' }, () => ({ resolveDir: resolve('.'), contents: `
          import * as React from 'react'; import * as jsxRuntime from 'react/jsx-runtime'; import * as ReactDOM from 'react-dom';
          import * as virtual from '@tanstack/react-virtual';
          import * as store from '@deepseek-ai/dsh-client-store'; import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
          let registration; const captureModule = value => { registration = value; };
          ${source.replace('window.__ModuleLoader__.load(', 'captureModule(')
            .replace('return module.exports;', 'return { ...module.exports, ChatView, ChatFlow };')}
          const modules = { '@tanstack/react-virtual': virtual, react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM,
            '@deepseek-ai/dsh-client-store': store, '@deepseek-ai/dsh-client-ui-primitives': primitives };
          const { ChatView: OfficialChatView, ChatFlow } = registration.factory(Object.assign(name => { if (!(name in modules)) throw new Error(name); return modules[name]; }, { asset: name => name }));
          export function ChatView(props) {
            return React.createElement(OfficialChatView, { ...props, renderSlot: (name, owner, options) => {
              if (name !== 'conversation.chat.flow') return props.renderSlot(name, owner, options);
              return React.createElement('div', { 'data-slot': name, style: { display: 'contents' } }, React.createElement(ChatFlow, { ...props, ...owner,
                useChatNodeBottom: () => false, useGroupAction: () => React.useRef(null), useGroupHeaderAction() {}, renderFactorySlot: () => null }));
            } });
          }
        ` }));
      } }],
    });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css">
      <style>html,body,#root{height:100%;margin:0}*{box-sizing:border-box}.chat-panel{height:100%;--chat-window-resize-edge-inset:0px;--dsh-chat-content-width:900px;--dsh-composer-side-clearance:16px}
      .chat-conversation-body{flex:1;min-height:0;display:flex}.synthetic-message{height:96px;padding:12px}
      .chat-composer-region{height:152px;padding:16px;background:white}.chat-composer-region textarea{width:100%;height:120px}</style>
      </head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/chat-bottom-control.probe.cjs'), htmlPath, reportPath],
      { env, timeout: 45000, windowsHide: true });
    const { scroll: reports, alignment } = JSON.parse(await readFile(reportPath, 'utf8'));
    expect(reports).toHaveLength(2);
    for (const report of reports) {
      const evidence = JSON.stringify(report);
      for (const state of [report.long, report.shortened, report.restored]) {
        expect(state.buttonBottom, evidence).toBeGreaterThan(state.composerTop - 24);
        expect(state.buttonBottom, evidence).toBeLessThanOrEqual(state.composerTop - 8);
      }
      expect(report.shortened.floor, evidence).toBe(0);
      expect(report.restored.following, evidence).toBe(false);
      expect(report.restored.scrollTop, evidence).toBe(0);
      expect(report.returned.following, evidence).toBe(true);
      expect(report.returned.scrollTop, evidence).toBe(report.returned.floor);
    }
    expect(alignment).toHaveLength(12);
    for (const report of alignment) {
      const evidence = JSON.stringify(report);
      expect(report.horizontalOverflow, evidence).toBeLessThanOrEqual(1);
      expect(report.targets, evidence).toHaveLength(3);
      for (const rect of report.targets) {
        expect(rect.left, evidence).toBeCloseTo(report.body.left, 0);
        expect(rect.right, evidence).toBeCloseTo(report.body.right, 0);
      }
    }
  } finally {
    const path = relative(tmpdir(), directory);
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Unexpected fixture path');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);

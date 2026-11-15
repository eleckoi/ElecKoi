import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as store from '@deepseek-ai/dsh-client-store';

/** Installed public Client plugin, without substituting its controller, store or frame. */
export function loadOfficialLayout(globals = {}) {
  const require = createRequire(import.meta.url);
  const source = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-layout/client'), 'utf8');
  let registration;
  runInNewContext(source, {
    ...globals,
    window: Object.assign(Object.create(globals.window ?? null), { innerWidth: 1280, __ModuleLoader__: { load: value => { registration = value; } } }),
    AbortController, console, setTimeout, clearTimeout,
  });
  const modules = { react: React, 'react/jsx-runtime': globals.jsxRuntime ?? jsxRuntime, '@deepseek-ai/dsh-client-store': store };
  return registration.factory(name => {
    if (!(name in modules)) throw new Error(`Unexpected Layout dependency ${name}`);
    return modules[name];
  });
}

/** Capture the real root/store supplied by public apply, for isolated rendering tests. */
export function officialLayoutFixture(globals = {}) {
  let Frame, options;
  const cleanups = [];
  const context = {
    locale: { register: () => () => {}, bind: () => key => key },
    shortcuts: { register: () => () => {} },
    reflect: { provide: () => () => {} },
    slots: {
      entries: () => [], subscribe: () => () => {}, provideRoot: () => () => {},
      register: (next, component) => { Frame = component; options = next; return () => {}; },
    },
    effect: (run, label) => { if (label === 'ui-layout: service + root registration') cleanups.push(run()); },
  };
  loadOfficialLayout(globals).apply(context);
  return { Frame, store: options.store.create(), dispose: () => cleanups.reverse().forEach(stop => stop()) };
}

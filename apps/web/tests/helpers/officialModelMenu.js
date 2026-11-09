import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as cordis from '@deepseek-ai/cordis';
import * as store from '@deepseek-ai/dsh-client-store';
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
const require = createRequire(import.meta.url);
const source = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-model-selection/client'), 'utf8');
let registration;
runInNewContext(source.replace('return module.exports;', 'return { ...module.exports, ModelSelect, zh };'), {
  window: new Proxy({}, { get: (_target, key) => key === '__ModuleLoader__' ? { load: entry => { registration = entry; } } : window[key] }),
  document, Element, HTMLElement, HTMLInputElement, HTMLButtonElement, Node, queueMicrotask,
  get setTimeout() { return globalThis.setTimeout; }, get clearTimeout() { return globalThis.clearTimeout; },
});
const modules = { react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM,
  '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-store': store, '@deepseek-ai/dsh-client-ui-primitives': primitives };
const native = registration.factory(name => { if (!(name in modules)) throw Error('Unexpected model-menu dependency: ' + name); return modules[name]; });
export const OfficialModelMenu = native.ModelSelect;
export const modelMenuText = (key, values = {}) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll('{' + key + '}', value), native.zh[key] || key);

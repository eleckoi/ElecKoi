import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
import * as store from '@deepseek-ai/dsh-client-store';
import { Context } from '@deepseek-ai/cordis';

const require = createRequire(import.meta.url);
let registration;
runInNewContext(readFileSync(require.resolve('@deepseek-ai/dsh-client-locale/client'), 'utf8'), {
  window: { __ModuleLoader__: { load: value => { registration = value; } } },
});
const dependencies = { react: React, 'react/jsx-runtime': jsxRuntime,
  '@deepseek-ai/dsh-client-ui-primitives': primitives, '@deepseek-ai/dsh-client-store': store };
const { LocaleRuntime } = registration.factory(name => {
  if (!(name in dependencies)) throw new Error(`Unexpected locale dependency: ${name}`);
  return dependencies[name];
});

/** The installed official implementation, with its process-local preference mode. */
export function officialLocale(preference = 'zh') {
  const locale = new LocaleRuntime(new Context(), undefined, { preference, languages: ['zh-CN'] });
  // Same selectable definitions registered by the installed locale plugin's apply().
  for (const [id, label] of [['ja', '日本語'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['ru', 'Русский'], ['pt', 'Português']]) {
    locale.addLanguage({ id, label, fallback: 'en' });
  }
  return locale;
}

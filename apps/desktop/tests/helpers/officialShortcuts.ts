import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import * as cordis from '@deepseek-ai/cordis'
import * as store from '@deepseek-ai/dsh-client-store'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShortcutRegistry as Registry } from '../../../../node_modules/@deepseek-ai/dsh-client-shortcuts/lib/types/client/registry'
import type { installKeyboard as Keyboard } from '../../../../node_modules/@deepseek-ai/dsh-client-shortcuts/lib/types/client/dom'
import type { installNativeKeyboard as NativeKeyboard } from '../../../../node_modules/@deepseek-ai/dsh-client-shortcuts/lib/types/client/native'

const source = readFileSync(resolve('node_modules/@deepseek-ai/dsh-client-shortcuts/lib/client.js'), 'utf8')
let registration: { factory(require: (name: string) => unknown): { ShortcutRegistry: typeof Registry; installKeyboard: typeof Keyboard; installNativeKeyboard: typeof NativeKeyboard } } | undefined
runInNewContext(source.replace('return module.exports;', 'return { ShortcutRegistry, installKeyboard, installNativeKeyboard };'), {
  window: { __ModuleLoader__: { load: (value: typeof registration) => { registration = value } } },
  setTimeout, clearTimeout, console, AbortController, MutationObserver, HTMLElement, Element, Node, KeyboardEvent
})
const modules: Record<string, unknown> = { '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-store': store,
  '@deepseek-ai/dsh-client-ui-primitives': primitives }
if (!registration) throw new Error('Installed shortcut module registration is missing')
export const { ShortcutRegistry, installKeyboard, installNativeKeyboard } = registration.factory(name => {
  if (!(name in modules)) throw new Error(`Unexpected shortcut module ${name}`)
  return modules[name]
})

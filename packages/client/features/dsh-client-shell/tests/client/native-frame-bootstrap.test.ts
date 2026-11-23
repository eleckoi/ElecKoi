import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { apply } from '../../src/index.js'

it('enqueues the unchanged public layout and sidebar factories before Client plugins start', () => {
  const require = createRequire(import.meta.url)
  let indexInjection: (table: any[]) => void
  apply({ on: (name: string, callback: typeof indexInjection) => {
    expect(name).toBe('webserver/index-inject')
    indexInjection = callback
  } })
  const table: any[] = []
  indexInjection!(table)
  expect(table[0]).toEqual({ kind: 'global', name: '__DSH_UI_WORKSPACE_CONFIG__', value: { autoSelectSession: false } })
  const moduleIds = ['@deepseek-ai/dsh-client-ui-layout', '@deepseek-ai/dsh-client-ui-sidebar']
  expect(table.slice(1)).toEqual(moduleIds.map(id => ({ kind: 'script', placement: 'head',
    text: readFileSync(require.resolve(`${id}/client`), 'utf8') })))
  const pendingQueue: any[] = []
  for (const row of table.slice(1)) {
    runInNewContext(row.text, { window: { __ModuleLoader__: { load: (entry: any) => pendingQueue.push(entry) } } })
  }
  expect(pendingQueue.map(entry => ({ id: entry.id, factory: typeof entry.factory })))
    .toEqual(moduleIds.map(id => ({ id, factory: 'function' })))
})

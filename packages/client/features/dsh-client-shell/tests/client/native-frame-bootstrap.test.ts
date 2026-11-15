import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { apply } from '../../src/index.js'

it('enqueues the unchanged public frame module before required Client plugins start', () => {
  const require = createRequire(import.meta.url)
  let indexInjection: (table: any[]) => void
  apply({ on: (name: string, callback: typeof indexInjection) => {
    expect(name).toBe('webserver/index-inject')
    indexInjection = callback
  } })
  const table: any[] = []
  indexInjection!(table)
  expect(table).toHaveLength(1)
  expect(table[0]).toEqual({ kind: 'script', placement: 'head',
    text: readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-layout/client'), 'utf8') })
  const pendingQueue: any[] = []
  runInNewContext(table[0].text, { window: { __ModuleLoader__: { load: (entry: any) => pendingQueue.push(entry) } } })
  expect(pendingQueue.map(entry => entry.id)).toEqual(['@deepseek-ai/dsh-client-ui-layout'])
  expect(pendingQueue[0].factory).toBeTypeOf('function')
})

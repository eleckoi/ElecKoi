import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { build } from 'vite'
import { expect, it } from 'vitest'
import webConfig from '../../vite.config.mjs'

const require = createRequire(import.meta.url)

it('bundles dnd-kit against the production DSH platform and shares its React and React DOM exports', async () => {
  const entryId = '\0test-dsh-dnd-platform'
  const platformPlugin = webConfig.plugins.find(plugin => plugin.name === 'eleckoi-dsh-platform-react')
  expect(platformPlugin).toBeDefined()

  const result = await build({
    configFile: false,
    root: webConfig.root,
    logLevel: 'silent',
    plugins: [platformPlugin, {
      name: 'test-dsh-dnd-entry',
      resolveId: source => source === entryId ? entryId : null,
      load: id => id === entryId
        ? "export { DndContext } from '@dnd-kit/core'; export { unstable_batchedUpdates } from 'react-dom';"
        : null
    }],
    build: {
      write: false,
      minify: false,
      rollupOptions: {
        preserveEntrySignatures: 'strict',
        input: entryId,
        output: { format: 'iife', name: 'DndPlatformProbe', exports: 'named' }
      }
    }
  })

  const react = require('react')
  const reactDom = require('react-dom')
  const runtime = {
    __ELECKOI_DSH_PLATFORM__: { react, reactDom }
  }
  const chunk = result.output.find(item => item.type === 'chunk' && item.isEntry)
  expect(chunk).toBeDefined()
  runInNewContext(chunk.code, runtime)

  const markup = require('react-dom/server').renderToStaticMarkup(
    react.createElement(runtime.DndPlatformProbe.DndContext, null,
      react.createElement('div', null, 'Drag item'))
  )
  expect(markup).toContain('Drag item')
  expect(runtime.DndPlatformProbe.unstable_batchedUpdates).toBe(reactDom.unstable_batchedUpdates)
  let calls = 0
  const value = runtime.DndPlatformProbe.unstable_batchedUpdates(argument => {
    calls += 1
    return argument
  }, 42)
  expect(calls).toBe(1)
  expect(value).toBe(42)
}, 30_000)

it('shares the DSH primitive instances without bundling a second copy of their styles', async () => {
  const entryId = '\0test-dsh-primitives-platform'
  const platformPlugin = webConfig.plugins.find(plugin => plugin.name === 'eleckoi-dsh-platform-react')
  const result = await build({
    configFile: false, root: webConfig.root, logLevel: 'silent',
    plugins: [platformPlugin, {
      name: 'test-dsh-primitives-entry',
      resolveId: source => source === entryId ? entryId : null,
      load: id => id === entryId ? "export * from '@deepseek-ai/dsh-client-ui-primitives';" : null
    }],
    build: { write: false, minify: false, rollupOptions: {
      preserveEntrySignatures: 'strict', input: entryId,
      output: { format: 'iife', name: 'PrimitivePlatformProbe', exports: 'named' }
    } }
  })
  expect(result.output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'))).toHaveLength(0)
  const chunk = result.output.find(item => item.type === 'chunk' && item.isEntry)
  expect(chunk.exports).toEqual(expect.arrayContaining(['Button', 'Modal', 'IconChevronLeftOutlineMedium']))
  expect(Object.keys(chunk.modules).filter(id => id.endsWith('.css'))).toHaveLength(0)
  const primitives = Object.fromEntries(chunk.exports.map(name => [name, {}]))
  const runtime = { __ELECKOI_DSH_PLATFORM__: { primitives } }
  runInNewContext(chunk.code, runtime)
  for (const name of chunk.exports) expect(runtime.PrimitivePlatformProbe[name], name).toBe(primitives[name])
}, 30_000)

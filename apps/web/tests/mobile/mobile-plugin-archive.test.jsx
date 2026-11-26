// @vitest-environment jsdom
import React, { act, useState } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import { createRoot } from 'react-dom/client'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import * as slots from '@deepseek-ai/dsh-client-ui-slots'
import * as store from '@deepseek-ai/dsh-client-store'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
let official
let root
let host

beforeAll(() => {
  const source = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-plugin-manager/client'), 'utf8')
  const modules = { react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM,
    '@deepseek-ai/dsh-client-ui-primitives': primitives, '@deepseek-ai/dsh-client-ui-slots': slots,
    '@deepseek-ai/dsh-client-store': store }
  new Function('window', source.replace('return module.exports', 'return { InstallDialog, IDLE_INSTALL, zh };'))({
    __ModuleLoader__: { load(entry) { official = entry.factory(name => modules[name]) } },
  })
})

afterEach(async () => {
  if (root) await act(() => root.unmount())
  host?.remove()
  delete globalThis.ElecKoiPlatform
  delete globalThis.__ELECKOI_CLIENT_PLATFORM__
  vi.unstubAllGlobals()
})

async function openDialog(kind, pickPluginArchive) {
  const { InstallDialog, IDLE_INSTALL, zh } = official
  const run = vi.fn()
  const edit = vi.fn()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  globalThis.ElecKoiPlatform = { pickPluginArchive }
  globalThis.__ELECKOI_CLIENT_PLATFORM__ = { kind }
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  function Fixture() {
    const [spec, setSpec] = useState('')
    const [open, setOpen] = useState(true)
    return <>
      <button onClick={() => setOpen(true)}>打开添加插件</button>
      <InstallDialog install={{ ...IDLE_INSTALL, open, spec }} language="zh" t={key => zh[key] ?? key}
        onClose={() => { setOpen(false); setSpec('') }}
        onEditSpec={value => { edit(value); setSpec(value) }}
        onRun={() => run(spec)} />
    </>
  }
  await act(() => root.render(<Fixture />))
  return { run, edit }
}

const dialog = () => document.querySelector('[role="dialog"]')
const input = () => dialog().querySelector('input[type="text"]')
const button = (label, container = dialog()) => [...container.querySelectorAll('button')].find(node => node.textContent === label)
const click = node => act(() => node.click())

it.each(['.tgz', '.tar.gz'])('passes a selected %s to the official install action', async suffix => {
  const archive = { name: '本地插件' + suffix, path: '/private/plugin-imports/content' + suffix }
  const choose = vi.fn().mockResolvedValueOnce(archive).mockResolvedValueOnce(null)
  const { run, edit } = await openDialog('android', choose)
  expect(dialog().textContent).toContain('.tgz 或 .tar.gz')
  expect(button('安装').disabled).toBe(true)
  await click(button('选择本地插件包'))
  expect(input().value).toBe(archive.name)
  expect(edit).toHaveBeenLastCalledWith(archive.path)
  expect(run).not.toHaveBeenCalled()
  await click(button('选择本地插件包'))
  expect(input().value).toBe(archive.name)
  await click(button('安装'))
  expect(run).toHaveBeenCalledWith(archive.path)
  await click(button('清除选择'))
  expect(input().value).toBe('')
  expect(input().readOnly).toBe(false)
  expect(button('安装').disabled).toBe(true)
})

it('shows a clear format error and discards a result from a closed Android dialog', async () => {
  let complete
  const choose = vi.fn().mockRejectedValueOnce(new Error('unsupported-plugin-archive'))
    .mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  const { edit, run } = await openDialog('android', choose)
  await click(button('选择本地插件包'))
  expect(dialog().querySelector('[role="alert"]').textContent).toContain('请选择 .tgz 或 .tar.gz')
  await click(button('选择本地插件包'))
  expect(button('读取插件包中…').disabled).toBe(true)
  await click(dialog().querySelector('[aria-label="关闭"]'))
  await click(button('打开添加插件', host))
  await act(() => { complete({ name: '本地插件.tgz', path: '/private/archive.tgz' }) })
  expect(input().value).toBe('')
  expect(edit).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled()
})

it('keeps the PC add-plugin dialog and its local directory wording', async () => {
  await openDialog('electron', vi.fn())
  expect(dialog().textContent).toContain('本地目录路径')
  expect(button('选择本地插件包')).toBeUndefined()
  expect(input().hasAttribute('data-modal-autofocus')).toBe(true)
})

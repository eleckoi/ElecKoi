// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
import React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as cordis from '@deepseek-ai/cordis'
import * as store from '@deepseek-ai/dsh-client-store'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { withDshAssets } from '../../../../../../tests/helpers/clientModuleRequire.js'

let registration: any
const source = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js', 'utf8')
runInNewContext(source.replace('return module.exports', 'return {...module.exports, UiWorkspaceService};'), {
  window: { __ModuleLoader__: { load: (value: any) => { registration = value } } }, AbortController, AbortSignal, console,
})
const modules: any = { react: React, 'react/jsx-runtime': jsx, '@deepseek-ai/cordis': cordis,
  '@deepseek-ai/dsh-client-store': store, '@deepseek-ai/dsh-client-ui-primitives': primitives }
const { UiWorkspaceService } = registration.factory(withDshAssets((name: string) => modules[name]))
const contexts: cordis.Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose(); localStorage.clear() })
const observable = (value: any) => {
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, subscribe: (f: () => void) => { listeners.add(f); return () => listeners.delete(f) },
    set: (next: any) => { value = next; listeners.forEach(f => f()) } }
}
async function fixture(autoSelectSession: boolean | undefined) {
  const ctx = new cordis.Context(); contexts.push(ctx)
  const layout = { beginNavigation: () => new AbortController().signal, selectPanel: vi.fn() }
  ctx.provide('layout', layout)
  const workspace = { workspaceId: 'synthetic-workspace', path: 'D:/synthetic', sessionIds: [] }
  const list = observable({ phase: 'ready', items: [], archivedSessionIds: [] })
  const workspaces = { list, initializeDefault: vi.fn(async () => { list.set({ ...list.getSnapshot(), items: [workspace] }); return workspace }) }
  const releases = new Map()
  const sessions = {
    list: observable({ phase: 'ready', ids: [], byId: {} }),
    create: vi.fn(async () => 'synthetic-created'), subagentAddress: () => undefined,
    retain: vi.fn((id: string) => { const release = vi.fn(); releases.set(id, release); return { sessionId: id, release } }),
  }
  let service: any
  await ctx.plugin({ apply(scope) { service = new UiWorkspaceService(scope, {}, workspaces, sessions, {}, () => {}, autoSelectSession) } })
  for (let i = 0; i < 8; i++) await Promise.resolve()
  return { ctx, service, workspaces, sessions, releases, layout }
}
it('retains official default Workspace initialization when product policy is absent', async () => {
  const f = await fixture(undefined)
  expect(f.workspaces.initializeDefault).toHaveBeenCalledOnce()
  expect(f.sessions.create).toHaveBeenCalledWith({ workspaceId: 'synthetic-workspace' })
  expect(f.sessions.retain).toHaveBeenCalledWith('synthetic-created', { source: 'mainView' })
})
it('lets product navigation own startup while explicit opens and archived-current cleanup remain native', async () => {
  const f = await fixture(false)
  expect(f.workspaces.initializeDefault).not.toHaveBeenCalled()
  expect(f.sessions.create).not.toHaveBeenCalled()
  f.service.openSession('synthetic-roleplay')
  expect(f.sessions.retain).toHaveBeenCalledWith('synthetic-roleplay', { source: 'mainView' })
  f.workspaces.list.set({ ...f.workspaces.list.getSnapshot(), archivedSessionIds: ['synthetic-roleplay'] })
  expect(f.releases.get('synthetic-roleplay')).toHaveBeenCalledOnce()
  expect(f.layout.selectPanel).toHaveBeenLastCalledWith(null)
  expect(f.workspaces.initializeDefault).not.toHaveBeenCalled()
})
it('keeps current-session ownership and releases it once when the native service unloads', async () => {
  const f = await fixture(false)
  f.service.openSession('first')
  f.service.openSession('second')
  expect(f.releases.get('first')).toHaveBeenCalledOnce()
  expect(f.releases.get('second')).not.toHaveBeenCalled()
  await f.ctx.fiber.dispose()
  expect(f.releases.get('second')).toHaveBeenCalledOnce()
})

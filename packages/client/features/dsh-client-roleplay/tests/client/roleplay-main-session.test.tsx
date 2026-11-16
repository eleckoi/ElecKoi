// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as jsx from 'react/jsx-runtime'
import * as cordis from '@deepseek-ai/cordis'
import * as store from '@deepseek-ai/dsh-client-store'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { withDshAssets } from '../../../../../../tests/helpers/clientModuleRequire.js'

const source = readFileSync('packages/client/features/dsh-client-roleplay/src/client.js', 'utf8')
let nativeRegistration: any
runInNewContext(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js', 'utf8')
  .replace('return module.exports', 'return {...module.exports, UiWorkspaceService};'), {
  window: { __ModuleLoader__: { load: (value: any) => { nativeRegistration = value } } }, AbortController, AbortSignal, console,
})
const modules: any = { react: React, 'react/jsx-runtime': jsx, '@deepseek-ai/cordis': cordis,
  '@deepseek-ai/dsh-client-store': store, '@deepseek-ai/dsh-client-ui-primitives': primitives }
const { UiWorkspaceService } = nativeRegistration.factory(withDshAssets((name: string) => modules[name]))
const observable = (value: any) => ({ getSnapshot: () => value, subscribe: () => () => {} })
const CharacterView = () => <textarea defaultValue="保留草稿" />
const SessionProvider = ({ children }: any) => children

it.each(['android', 'desktop'])('switches the official foreground Session from a previous Workspace to each roleplay on %s', async kind => {
  let registration: any, roleplay: any
  runInNewContext(source, {
    __ELECKOI_CLIENT_PLATFORM__: { kind },
    window: { __ModuleLoader__: { load: (value: any) => { registration = value } } },
  })
  const ctx = new cordis.Context(), host = document.createElement('div'), root = createRoot(host)
  document.body.append(host)
  const references: any[] = []
  const binding = new Map(['workspace', 'role-a', 'role-b'].map(id => [id, {}]))
  const sessions = { list: observable({ phase: 'ready', ids: [], byId: {} }), subagentAddress: () => undefined,
    retain: vi.fn((sessionId: string, info: any) => {
      const ref = { sessionId, binding: binding.get(sessionId), source: info.source, released: false,
        release: vi.fn(() => { ref.released = true }) }
      references.push(ref); return ref
    }) }
  ctx.provide('layout', { beginNavigation: () => new AbortController().signal, selectPanel: vi.fn() })
  let workspace: any
  await ctx.plugin({ apply(scope) { workspace = new UiWorkspaceService(scope, {},
    { list: observable({ phase: 'ready', items: [], archivedSessionIds: [] }) }, sessions, {}, () => {}, false) } })
  workspace.openSession('workspace')
  const ready = new Map(['role-a', 'role-b'].map(sessionId => [sessionId, { sessionId, binding: binding.get(sessionId) }]))
  const conversations = { subscribeDetails: () => () => {}, getDetailsSnapshot: observable({}).getSnapshot,
    getSessionReference: (id: string) => ready.get(id) }
  const plugin = registration.factory((name: string) => { if (name === 'react') return React; throw Error(name) })
  const slots = {
    inject: (name: string, create: () => void) => { if (name === 'eleckoi.roleplay') create() },
    register: (options: any, component: any) => { roleplay = { options, component }; return () => {} },
  }
  plugin.apply({ slots, sessions, eleckoiConversations: conversations, get: () => workspace })
  const injected = roleplay.options.inject()
  const render = (id: string) => React.createElement(roleplay.component, { ...injected,
    matched: { component: CharacterView, props: { conversationId: id, runtimeSessionId: id } },
    SessionProvider, renderSlot: (_name: string, _owner: any, options: any) => options.fallback,
    renderFactorySlot: () => null })
  const mains = () => references.filter(ref => ref.source === 'mainView' && !ref.released).map(ref => ref.sessionId)
  try {
    expect(plugin.inject).toContain('uiWorkspace')
    await act(() => root.render(render('role-a')))
    expect(mains()).toEqual(['role-a'])
    expect(references.find(ref => ref.sessionId === 'workspace').release).toHaveBeenCalledOnce()
    expect(sessions.retain).toHaveBeenCalledWith('role-a', { source: 'eleckoiRoleplayView' })
    await act(() => root.render(render('role-b')))
    expect(mains()).toEqual(['role-b'])
    expect(references.find(ref => ref.sessionId === 'role-a' && ref.source === 'eleckoiRoleplayView').release).toHaveBeenCalledOnce()
    const draft = host.querySelector('textarea')
    await act(() => root.render(render('role-b')))
    expect(mains()).toEqual(['role-b'])
    expect(host.querySelector('textarea')).toBe(draft)
  } finally { await act(() => root.unmount()); host.remove(); await ctx.fiber.dispose() }
  expect(mains()).toEqual([])
})

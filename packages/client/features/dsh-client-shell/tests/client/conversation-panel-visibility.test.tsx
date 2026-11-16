// @vitest-environment jsdom
import React, { act, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
import { RightbarRoot } from '../../../../../../node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/src/client/shell/RightbarRoot'
import { ExpandButton } from '../../../../../../node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/src/client/shell/ExpandButton'
import { dshClientRequire } from '../../../../../../tests/helpers/dshClientPlugin'

let registration: any
const source = readFileSync('packages/client/features/dsh-client-shell/src/client.js', 'utf8')
runInNewContext(source.replace("inject: ['slots', 'locale', 'theme', 'eleckoiCharacters'", "createConversationPanelInfo, inject: ['slots', 'locale', 'theme', 'eleckoiCharacters'"), {
  window: { __ModuleLoader__: { load: (next: any) => { registration = next } } },
})
const { createConversationPanelInfo } = registration.factory(dshClientRequire)
const observable = (initial: any) => {
  let value = initial
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    set(next: any) { value = next; for (const listener of listeners) listener() } }
}
vi.stubGlobal('React', React)
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
let root: ReturnType<typeof createRoot> | undefined, host: HTMLElement
afterEach(async () => { if (root) await act(() => root!.unmount()); host?.remove(); root = undefined; localStorage.clear() })

it.each(['messages', 'creatorStudio'])('keeps native rightbar opening and closing visible inside %s and hides it outside the mounted foreground Conversation', async panel => {
  const current = observable({ key: 'synthetic-session' }), navigation = observable({ activePanelId: panel })
  const policy = createConversationPanelInfo({ get: () => ({ adapter: { current } }) })
  const projected = policy.bind(navigation), release = policy.retain('synthetic-session')
  const store = Object.assign(observable({ bySession: { 'synthetic-session': { layout: { expanded: false } } } }), {
    actions: { setExpanded(sessionId: string, expanded: boolean) { store.set({ bySession: { [sessionId]: { layout: { expanded } } } }) } }
  })
  const useStore = (select: any) => select(useSyncExternalStore(store.subscribe, store.getSnapshot))
  const usePanelInfo = (select: any) => select(useSyncExternalStore(projected.subscribe, projected.getSnapshot))
  const view = { sessionId: 'synthetic-session', reference: {}, selected: true, retainTab: () => () => {} }
  const views = [view], mountView = () => () => {}
  function Fixture() {
    return <><ExpandButton {...{ sessionId: view.sessionId, useStore, actions: store.actions, useShortcuts: (select: any) => select([]), t: (key: string) => key } as any} />
      <RightbarRoot {...{ usePanelInfo, useViews: (select: any) => select(views), mountView,
        SessionProvider: ({ children }: any) => children, width: 300, viewportWidth: 1200, canShow: true,
        renderSlot: (_name: string, owner: any) => <div data-panel-active={String(owner.active)}><button onClick={() => store.actions.setExpanded(view.sessionId, false)}>关闭</button></div> } as any} /></>
  }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(() => root!.render(<Fixture />))
  const session = () => host.querySelector<HTMLElement>('[data-sidebar-right-session]')!
  const expand = () => host.querySelector<HTMLButtonElement>('[data-sidebar-right-expand]')
  expect(expand()).not.toBeNull()
  await act(() => expand()!.click())
  expect(store.getSnapshot().bySession[view.sessionId].layout.expanded).toBe(true)
  expect(session().hidden).toBe(false)
  expect(host.querySelector('[data-panel-active="true"]')).not.toBeNull()
  expect(navigation.getSnapshot().activePanelId).toBe(panel)
  await act(() => host.querySelector<HTMLButtonElement>('[data-panel-active] button')!.click())
  expect(expand()).not.toBeNull()
  await act(() => navigation.set({ activePanelId: 'model' }))
  expect(session().hidden).toBe(true)
  await act(() => navigation.set({ activePanelId: panel }))
  expect(session().hidden).toBe(false)
  await act(release)
  expect(session().hidden).toBe(true)
  expect(projected.getSnapshot()).toBe(navigation.getSnapshot())
})

it('projects only the mounted foreground Session and retains a stable snapshot across unrelated notifications', () => {
  const current = observable({ key: 'first' }), navigation = observable({ activePanelId: 'messages' })
  const policy = createConversationPanelInfo({ get: () => ({ adapter: { current } }) }), projected = policy.bind(navigation)
  const changed = vi.fn(), stop = projected.subscribe(changed)
  const releaseFirst = policy.retain('first'), releaseDuplicate = policy.retain('first'), releaseSecond = policy.retain('second')
  const visible = projected.getSnapshot()
  expect(visible.activePanelId).toBeNull()
  releaseFirst(); expect(projected.getSnapshot()).toBe(visible)
  current.set({ key: 'second' }); expect(projected.getSnapshot()).toBe(visible)
  current.set({ key: 'unmounted' }); expect(projected.getSnapshot()).toBe(navigation.getSnapshot())
  releaseDuplicate(); releaseSecond(); stop()
  const count = changed.mock.calls.length
  current.set({ key: 'first' }); navigation.set({ activePanelId: null })
  expect(changed).toHaveBeenCalledTimes(count)
})

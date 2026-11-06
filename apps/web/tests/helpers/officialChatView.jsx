import * as reactVirtual from '@tanstack/react-virtual'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import * as store from '@deepseek-ai/dsh-client-store'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { withDshAssets } from '../../../../tests/helpers/clientModuleRequire.js'

// Execute the installed, pinned Client bundle. Only the test loader exposes
// private components; production obtains ChatView from its public slot entry.
const source = readFileSync(resolve('node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js'), 'utf8')
if (source.split('return module.exports;').length !== 2) throw new Error('Unexpected Chat Client bundle boundary')
let registration
const browser = new Proxy({}, { get: (_target, key) => key === '__ModuleLoader__'
  ? { load: value => { registration = value } }
  : typeof window === 'undefined' ? undefined : window[key] })
runInNewContext(source.replace('return module.exports;', 'return { ...module.exports, RawChatView: ChatView, ChatFlow, ChatReading, ChatViewport, ScrollFollow, TurnNavigator, mergeTurnRailItems, ActivityPill, ManualCompactionNodeView };'), {
  window: browser,
  document: typeof document === 'undefined' ? undefined : document,
  HTMLElement: typeof HTMLElement === 'undefined' ? undefined : HTMLElement,
  Element: typeof Element === 'undefined' ? undefined : Element,
  KeyboardEvent: typeof KeyboardEvent === 'undefined' ? undefined : KeyboardEvent,
  get setTimeout() { return globalThis.setTimeout },
  get clearTimeout() { return globalThis.clearTimeout },
  get setInterval() { return globalThis.setInterval },
  get clearInterval() { return globalThis.clearInterval },
  get Date() { return globalThis.Date },
  console,
  get requestAnimationFrame() { return globalThis.requestAnimationFrame },
  get cancelAnimationFrame() { return globalThis.cancelAnimationFrame },
  get ResizeObserver() { return globalThis.ResizeObserver },
  get matchMedia() { return globalThis.matchMedia },
})
const modules = { '@tanstack/react-virtual': reactVirtual,
  react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM,
  '@deepseek-ai/dsh-client-store': store,
  '@deepseek-ai/dsh-client-ui-primitives': primitives,
}
const { RawChatView, ChatFlow, ChatReading, ChatViewport, ScrollFollow, TurnNavigator, mergeTurnRailItems, ActivityPill, ManualCompactionNodeView } = registration.factory(withDshAssets(name => {
  if (!(name in modules)) throw new Error(`Unexpected Chat Client dependency: ${name}`)
  return modules[name]
}))

export { ChatReading, ChatViewport, ScrollFollow, TurnNavigator, mergeTurnRailItems, ActivityPill, ManualCompactionNodeView }
export function ChatView(props) {
  return React.createElement(RawChatView, { ...props, renderSlot: (name, owner, options) => {
    if (name !== 'conversation.chat.flow') return props.renderSlot(name, owner, options)
    return <div data-slot="conversation.chat.flow" style={{ display: 'contents' }}><ChatFlow {...props} {...owner}
      useChatNodeBottom={() => false} useGroupAction={() => React.useRef(null)} useGroupHeaderAction={() => {}}
      renderFactorySlot={() => null} /></div>
  } })
}

export function chatFixture(sessionId = 'session-test') {
  const listeners = new Set()
  const empty = []
  let state = {
    order: empty, nodes: new Map(), grouped: undefined, rail: empty,
    session: { running: false, openState: 'open', openError: null, hasMore: false, loadingOlder: false, pendingSubmissions: empty },
    inbox: { 'next-step': empty },
  }
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }
  const useStateSnapshot = () => React.useSyncExternalStore(subscribe, () => state, () => state)
  let saved = null
  const props = {
    sessionId,
    useContextMenu: () => ({ getTriggerProps: () => ({}) }),
    resolveFilePath: path => path,
    useConnectionState: select => select('connected'),
    useInteractionIds: select => select(empty),
    dispatchInteraction: async () => {},
    useSession: select => select(useStateSnapshot().session),
    useChat: select => {
      const value = useStateSnapshot()
      return select({ ...value, navigation: { items: () => value.rail } })
    },
    useChatNode: (key, select = value => value) => select(useStateSnapshot().nodes.get(key)),
    useChatNodeProcess: () => undefined,
    useChatGroup: (_key, select = value => value) => select(undefined),
    useConversation: select => select({ views: { grouped: () => state.grouped } }),
    useSessions: select => select({ byId: { [sessionId]: {} } }),
    useProjection: key => key === 'inbox' ? useStateSnapshot().inbox : undefined,
    usePresentation: select => select({ foldCompletedTurns: false, stepGrouping: 'none' }),
    useStore: select => select({ turnProcess: {} }),
    actions: { setTurnProcessOpen() {} },
    t: key => key,
    chatScroll: { read: () => saved, save: value => { saved = value } },
    loadOlder: async () => {}, loadThrough: async () => {},
    openFile: async () => {}, openSkill() {}, openExternalLink() {}, loadImage: async () => '',
    inspectCall() {}, fileMentions() {},
    renderSlot: (_name, _owner, options) => options?.fallback ?? null,
  }
  return { props, get state() { return state }, get saved() { return saved }, listeners,
    update(next) { state = { ...state, ...next }; for (const listener of listeners) listener() } }
}

export function userNode(key, seq, requestId, turn = 1, text = '合成输入') {
  return { key, kind: 'user', target: 'chat', visibility: 'visible', groupTree: 'input', anchorSeq: seq,
    location: { kind: 'turn', turn: { turn, status: 'closed', data: { get() {} } } },
    data: { kind: 'user', seq, time: 1, content: [{ type: 'text', text }], source: { kind: 'user', rpcId: requestId } } }
}

export function turnNode(key, turn, status = 'open') {
  return { key, kind: 'turn-process', anchorSeq: turn * 10,
    location: { kind: 'turn', turn: { turn, status, data: { get() {} } } }, data: { turn } }
}

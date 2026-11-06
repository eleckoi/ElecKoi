import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { resolve } from 'node:path'
import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../../src/client.js', import.meta.url), 'utf8')
const slotTypes = readFileSync(new URL('../../src/slots.d.ts', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const rowId = 'eleckoi-client-roleplay'

function clientRequire(React: unknown) {
  return (name: string) => {
    if (name === 'react') return React
    throw new Error(`Unexpected client module: ${name}`)
  }
}

describe('ElecKoi roleplay client contribution', () => {
  it('uses the official view roster and shared shell store for arbitrary plugin views', async () => {
    let registration: any
    runInNewContext(source, {
      window: { __ModuleLoader__: { load: (value: any) => { registration = value } } }
    })
    const React = { createElement: (type: unknown, props: unknown) => ({ type, props }) }
    const slots: any = new SlotCore()
    const disposers: Array<() => void> = []
    slots.inject = (name: string, register: () => () => void) => {
      let release: (() => void) | undefined
      const sync = () => { release?.(); release = slots.spec(name) ? register() : undefined }
      const unsubscribe = slots.subscribeDeclaration(name, sync)
      sync()
      disposers.push(() => { unsubscribe(); release?.() })
    }
    const releaseRoot = slots.register({ name: 'root', children: {
      'eleckoi.roleplay': { kind: 'chain', scope: 'root' },
      'conversation.session.header': { kind: 'single', scope: 'session' },
      'conversation.session': { kind: 'single', scope: 'session' },
    } }, () => null)
    registration.factory(clientRequire(React)).apply({ sessions: {}, slots })
    const store = () => null
    const injectHeader = () => ({})
    const injectBody = () => ({})
    const releaseHeader = slots.register({ name: 'conversation.session.header', store, inject: injectHeader, locale: 'conversation', children: {
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    } }, () => null)
    const SubagentAction = () => null
    const opened: unknown[] = []
    const injectedOwner = {}
    const injectSubagents = (owner: unknown) => ({ owner, openChild: () => { throw new Error('Main conversation must stay mounted') },
      openChildAside: (address: unknown) => opened.push(address) })
    const releaseHeaderAction = slots.register({ name: 'conversation.session.header.actions', id: 'subagent-catalog', order: 10,
      inject: injectSubagents }, SubagentAction)
    const releasePresetLabel = slots.register({ name: 'conversation.session.header.actions', id: 'agent-preset', order: 0 }, () => null)
    const releaseBody = slots.register({ name: 'conversation.session', store, inject: injectBody, children: {
      'conversation.chat.user.images': { kind: 'single', scope: 'session' },
        'conversation.chat.message.images': { kind: 'single', scope: 'session' },
        'conversation.view': { kind: 'list', scope: 'session' }
    } }, () => null)
    await Promise.resolve()
    const releaseChat = slots.register({ name: 'conversation.view', id: 'chat', order: 0, label: () => '对话', children: {
      'conversation.chat.flow': { kind: 'single', scope: 'session' },
      'conversation.chat.text-interaction': { kind: 'keyed', scope: 'session' }
    } }, () => null)
    const releaseTextInteraction = slots.register({ name: 'conversation.chat.text-interaction', key: 'synthetic-text' }, () => null)
    await Promise.resolve()
    expect(slots.entriesOfSlot('eleckoi.roleplay.chat.text-interaction').map((entry: any) => entry.options.key)).toEqual(['synthetic-text'])
    releaseTextInteraction()
    const releaseFlow = slots.register({ name: 'conversation.chat.flow', children: {
      'conversation.chat.before': { kind: 'single', scope: 'session' },
      'conversation.chat.pending-input': { kind: 'single', scope: 'session' },
      'conversation.chat.node': { kind: 'keyed', scope: 'session' }
    } }, () => null)
    await Promise.resolve()
    expect(slots.entriesOfSlot('eleckoi.roleplay.chat.flow')).toHaveLength(1)
    expect(slots.entriesOfSlot('eleckoi.roleplay.view.conversation.chat.flow')).toHaveLength(1)
    expect(slots.spec('eleckoi.roleplay.chat.before')).toBeDefined()
    expect(slots.spec('eleckoi.roleplay.view.conversation.chat.before')).toBeDefined()
    const releaseCustom = slots.register({ name: 'conversation.view', id: 'sample-view', order: 5, label: () => '示例视图',
      children: { 'sample-view.controls': { kind: 'list', scope: 'session' } },
      store: () => null, inject: () => ({ hooks: {} }),
    }, () => null)
    const releaseTrajectory = slots.register({ name: 'conversation.view', id: 'trajectory', order: 10, label: () => '轨迹' }, () => null)
    await Promise.resolve()
    const pluginView = slots.entriesOfSlot('conversation.view').find((entry: any) => entry.options.id === 'sample-view')
    const projectedView = slots.entriesOfSlot('eleckoi.roleplay.session.view').find((entry: any) => entry.options.id === 'sample-view')
    expect(projectedView.store).toBe(pluginView.store)
    expect(projectedView.inject).toBe(pluginView.inject)
    const Controls = () => null
    const releaseControls = slots.register({ name: 'sample-view.controls', id: 'sample-control', order: 2 }, Controls)
    await Promise.resolve()
    expect(slots.entriesOfSlot('eleckoi.roleplay.view.sample-view.controls')[0].options.id).toBe('sample-control')
    const viewProps = { sessionId: 'session-sample', renderSlot: (name: string, owner: unknown, options: unknown) => ({ name, owner, options }) }
    const viewNode = projectedView.component(viewProps)
    expect(viewNode.type).toBe(pluginView.component)
    expect(viewNode.props.sessionId).toBe(viewProps.sessionId)
    expect(viewNode.props.renderSlot('sample-view.controls', { active: true }, { only: 'sample-control' })).toEqual({
      name: 'eleckoi.roleplay.view.sample-view.controls', owner: { active: true }, options: { only: 'sample-control' }
    })
    const header = slots.entriesOfSlot('eleckoi.roleplay.session.header')[0]
    const body = slots.entriesOfSlot('eleckoi.roleplay.session.body')[0]
    expect(header.store).toBe(store)
    expect(header.inject).toBe(injectHeader)
    expect(body.store).toBe(store)
    expect(body.inject).toBe(injectBody)
    expect(body.children['eleckoi.roleplay.session.view']).toMatchObject({ kind: 'list', scope: 'session' })
    const ProductView = () => null
    const matched = { component: ProductView, props: { renderRoleplaySlot: (name: string, owner: unknown) => ({ name, owner }) } }
    const useConversationViews = (select: any) => select(slots.entriesOfSlot('conversation.view').map((entry: any) => ({
      id: entry.options.id, label: entry.options.label()
    })))
    let preferred = 'sample-view'
    const useStore = (select: any) => select({ view: preferred, viewRequest: { view: 'sample-view', focus: 'sample-focus' } })
    const selectView = (id: string) => { preferred = id }
    const headerProps = { matched, useConversationViews, useStore, selectView,
      useEntryPins: (select: any) => select([]), useEntryActions: (select: any) => select(false), setPinned() {} }
    const headerNode = header.component(headerProps)
    const selected = headerNode.type(headerNode.props)
    expect(selected.owner.navigation.tabs.map((tab: any) => tab.id)).toEqual(['chat', 'sample-view', 'trajectory'])
    expect(selected.owner.navigation.activeView).toBe('sample-view')
    expect(slots.entriesOfSlot('eleckoi.roleplay.view.conversation.session.header.actions').map((entry: any) => entry.options.id))
      .toEqual(['agent-preset', 'subagent-catalog'])
    const projectedCatalog = slots.entriesOfSlot('eleckoi.roleplay.view.conversation.session.header.actions')[1]
    const catalogActions = projectedCatalog.inject(injectedOwner)
    const childAddress = { parentSessionId: 'parent', childSessionId: 'child', mode: 'continuable' }
    catalogActions.openChild(childAddress)
    expect(catalogActions.owner).toBe(injectedOwner)
    expect(opened).toEqual([childAddress])
    const renderHeaderSlot = (name: string, owner: unknown) => ({ name, owner })
    const selectedHeader = headerNode.type({ ...headerNode.props, renderSlot: renderHeaderSlot })
    expect(selectedHeader.owner.navigation.renderHeaderActions()).toEqual({ name: 'eleckoi.roleplay.view.conversation.session.header.actions', owner: {} })
    const renderSlot = (name: string, owner: unknown, options: unknown) => ({ name, owner, options })
    const completeViewRequest = () => {}
    const inspectCall = () => {}
    const openView = () => {}
    const bodyNode = body.component({ ...selected.owner, useStore, useInspectCall: (select: any) => select(inspectCall),
      actions: { completeViewRequest }, openView, renderSlot })
    const product = bodyNode.type(bodyNode.props)
    expect(product.type).toBe(ProductView)
    expect(product.props.dshConversation.renderView('sample-view')).toEqual({
      name: 'eleckoi.roleplay.session.view', options: { only: 'sample-view' },
      owner: { inspectCall, viewRequest: { view: 'sample-view', focus: 'sample-focus' }, openView, completeViewRequest }
    })
    product.props.dshConversation.selectView('trajectory')
    expect(preferred).toBe('trajectory')
    preferred = 'sample-view'
    releaseCustom()
    releaseControls()
    await Promise.resolve()
    const removed = headerNode.type(headerProps)
    expect(removed.owner.navigation.activeView).toBe('chat')
    expect(slots.spec('sample-view.controls')).toBeUndefined()
    expect(slots.spec('eleckoi.roleplay.view.sample-view.controls')).toBeUndefined()
    releaseBody()
    releaseHeaderAction()
    releasePresetLabel()
    releaseHeader()
    await Promise.resolve()
    expect(slots.entriesOfSlot('eleckoi.roleplay.session.body')).toHaveLength(0)
    expect(slots.entriesOfSlot('eleckoi.roleplay.session.header')).toHaveLength(0)
    releaseFlow()
    releaseChat()
    releaseTrajectory()
    for (const dispose of disposers.reverse()) dispose()
    releaseRoot()
  })

  it('mounts the existing chat view through a removable DSH chain entry', () => {
    let registration: any
    let unregister = false
    let entry: any
    let component: any
    runInNewContext(source, {
      window: { __ModuleLoader__: { load: (value: any) => { registration = value } } }
    })
    expect(registration.id).toBe('@eleckoi/dsh-client-roleplay')
    const React = {
      createElement: (type: unknown, props: unknown) => ({ type, props }),
      useState: () => [null, () => {}],
      useEffect: () => {},
      useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
      useRef: (value: unknown) => ({ current: value }), useLayoutEffect() {},
      useCallback: (callback: unknown) => callback
    }
    const plugin = registration.factory(clientRequire(React))
    plugin.apply({
      sessions: {},
      slots: {
        inject: (name: string, register: () => () => void) => {
          if (name !== 'eleckoi.roleplay') return
          const dispose = register()
          dispose()
        },
        register: (options: unknown, view: unknown) => {
          entry = options
          component = view
          return () => { unregister = true }
        }
      }
    })
    const ChatView = () => null
    const owner = { component: ChatView, props: { conversationId: 'session-1' } }
    expect(entry.name).toBe('eleckoi.roleplay')
    expect(entry.children).toEqual({
      'eleckoi.roleplay.session': { kind: 'single', scope: 'session' }
    })
    expect(entry.select(owner)).toBe(owner)
    expect(entry.select({ component: null })).toBeNull()
    expect(component({ matched: owner, conversations: { subscribeDetails() {}, getDetailsSnapshot: () => ({}), getSessionReference: () => null } })).toEqual({ type: ChatView, props: {
      ...owner.props,
      renderRoleplaySlot: undefined,
      renderRoleplaySlotChain: undefined,
      renderRoleplayMessage: undefined,
      dshConversation: undefined,
      dshComposerOwner: undefined,
      dshInputZone: undefined
    } })
    expect(unregister).toBe(true)
  })

  it('allows the user profile layer to disable the bundled row', () => {
    const patch = loadOverlayPatches('dsh', resolve('packages/client/features/dsh-client-roleplay/cordis.patch.yml'))
    expect(composeEntries([patch]).find(row => row.id === rowId)?.disabled).toBeFalsy()
    const disabled = composeEntries([patch, [{ id: rowId, disabled: true }]])
    expect(disabled.find(row => row.id === rowId)?.disabled).toBe(true)
  })

  it('renders extension seats only under the retained DSH Session scope', () => {
    let registration: any
    let roleplayComponent: any
    let sessionComponent: any
    const reference = { sessionId: 'dsh-session-1' }
    const sessionSnapshot = { id: reference.sessionId, running: false }
    const inputSnapshot = { text: 'draft' }
    const pendingInteraction = { kind: 'approval' }
    const renderSlot = (name: string, owner: unknown, options: unknown) => ({ name, owner, options })
    const renderSlotChain = (name: string, owner: unknown, options: unknown) => ({ name, owner, options })
    const SessionProvider = () => null
    runInNewContext(source, {
      window: { __ModuleLoader__: { load: (value: any) => { registration = value } } }
    })
    const React = {
      createElement: (type: unknown, props: unknown, child: unknown) => ({ type, props, child }),
      useState: () => [reference, () => {}],
      useEffect: () => {},
      useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
      useRef: (value: unknown) => ({ current: value }), useLayoutEffect() {},
      useCallback: (callback: unknown) => callback
    }
    const plugin = registration.factory(clientRequire(React))
    plugin.apply({ sessions: {}, slots: {
      inject: (name: string, register: () => void) => {
        if (name === 'eleckoi.roleplay' || name === 'eleckoi.roleplay.session') register()
      },
      register: (options: any, view: unknown) => {
        if (options.name === 'eleckoi.roleplay') roleplayComponent = view
        if (options.name === 'eleckoi.roleplay.session') sessionComponent = view
      }
    } })
    const ChatView = () => null
    const matched = {
      component: ChatView,
      props: { conversationId: 'product-chat-1', runtimeSessionId: reference.sessionId }
    }
    const result = roleplayComponent({
      matched, conversations: { subscribeDetails() {}, getDetailsSnapshot: () => ({}), getSessionReference: () => reference }, SessionProvider, renderSlot
    })
    expect(result.type).toBe(SessionProvider)
    expect(result.props.session).toBe(reference)
    expect(result.child).toEqual({
      name: 'eleckoi.roleplay.session',
      owner: { matched },
      options: expect.objectContaining({ fallback: expect.anything() })
    })

    const sessionResult = sessionComponent({
      matched,
      sessionId: reference.sessionId,
      useSession: (selector: (snapshot: unknown) => unknown) => selector(sessionSnapshot),
      useSessionStatus: (selector: (snapshot: Map<string, unknown>) => unknown) => selector(new Map([
        [reference.sessionId, { pendingInteraction }]
      ])),
      useInput: (selector: (snapshot: unknown) => unknown) => selector(inputSnapshot),
      renderSlot,
      renderSlotChain
    })
    expect(sessionResult.name).toBe('eleckoi.roleplay.session.header')
    const productProps = sessionResult.owner.matched.props
    expect(productProps.renderRoleplaySlot).toBe(renderSlot)
    expect(productProps.renderRoleplaySlotChain).toBe(renderSlotChain)
    expect(productProps.dshComposerOwner).toEqual({
      sessionId: reference.sessionId,
      session: sessionSnapshot,
      pendingInteraction
    })
    expect(productProps.dshInputZone).toEqual({ session: sessionSnapshot, input: inputSnapshot })
    const messageOwner = { productMessageId: 'm1', content: '流式正文', streaming: true }
    const content = { type: 'official-markdown', props: { text: '流式正文', streaming: true } }
    const rendered = productProps.renderRoleplayMessage(messageOwner, content)
    expect(rendered.name).toBe('eleckoi.roleplay.message.content')
    expect(rendered.owner).toEqual(messageOwner)
    expect(rendered.options.fallback).toBe(content)
  })

  it('uses the loaded chat Session on the first render and switches scopes without an empty composer frame', () => {
    let registration: any, component: any
    runInNewContext(source, { window: { __ModuleLoader__: { load: (value: any) => { registration = value } } } })
    const React = {
      createElement: (type: unknown, props: unknown, child: unknown) => ({ type, props, child }),
      useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
      useRef: (value: unknown) => ({ current: value }), useLayoutEffect() {},
    }
    registration.factory(clientRequire(React)).apply({ slots: {
      inject: (name: string, register: () => void) => { if (name === 'eleckoi.roleplay') register() },
      register: (_options: unknown, value: unknown) => { component = value },
    } })
    let current = { sessionId: 'synthetic-first' }
    const conversations = { subscribeDetails() {}, getDetailsSnapshot: () => ({}),
      getSessionReference: (id: string) => current.sessionId === id ? current : null }
    const SessionProvider = () => null
    const renderSlot = (name: string) => ({ name })
    const render = (id: string) => component({ conversations, SessionProvider, renderSlot,
      matched: { component: () => null, props: { runtimeSessionId: id } } })
    const first = render(current.sessionId)
    expect(first.type).toBe(SessionProvider)
    expect(first.props.session).toBe(current)
    expect(first.child.name).toBe('eleckoi.roleplay.session')
    current = { sessionId: 'synthetic-second' }
    const second = render(current.sessionId)
    expect(second.type).toBe(SessionProvider)
    expect(second.props.session).toBe(current)
    expect(second.child.name).toBe('eleckoi.roleplay.session')
    expect(render('unavailable').type).not.toBe(SessionProvider)
  })

  it('projects live DSH composer contributions into the retained roleplay seats', async () => {
    let registration: any
    runInNewContext(source, {
      window: { __ModuleLoader__: { load: (value: any) => { registration = value } } }
    })
    const React = {
      createElement: (type: unknown, props: unknown) => ({ type, props }),
      useState: () => [null, () => {}], useEffect: () => {},
      useMemo: (read: () => unknown) => read(),
      useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
      useRef: (value: unknown) => ({ current: value }),
      useCallback: (callback: unknown) => callback
    }
    const plugin = registration.factory(clientRequire(React))
    const slots: any = new SlotCore()
    const injectors: Array<() => void> = []
    const clientSlots = Object.assign(slots, {
      inject(name: string, register: () => () => void) {
        let release: (() => void) | undefined
        const sync = () => {
          release?.()
          release = slots.spec(name) ? register() : undefined
        }
        const unsubscribe = slots.subscribeDeclaration(name, sync)
        sync()
        injectors.push(() => { unsubscribe(); release?.() })
      }
    })
    const releaseRoot = slots.register({
      name: 'root',
      children: {
        'eleckoi.roleplay': { kind: 'chain', scope: 'root' },
        'conversation.session.header.corner': { kind: 'single', scope: 'session' },
        'conversation.composer': { kind: 'chain', scope: 'session' },
        'conversation.composer.bar': { kind: 'single', scope: 'session-maybe' },
        'conversation.input.dock': { kind: 'list', scope: 'session' },
        'conversation.input.attachments': { kind: 'single', scope: 'session-maybe' },
        'conversation.input.permission': { kind: 'single', scope: 'session' },
        'conversation.input.left': { kind: 'list', scope: 'session' },
        'conversation.input.plan': { kind: 'single', scope: 'session' },
        'conversation.input.right': { kind: 'list', scope: 'session' },
        'conversation.input.model': { kind: 'single', scope: 'session' },
        'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true },
        'conversation.input.activity': { kind: 'single', scope: 'session' },
        'conversation.input.overlay': { kind: 'list', scope: 'session' },
        'conversation.composer.dock': { kind: 'list', scope: 'session' },
        'conversation.approval.detail': { kind: 'single', scope: 'session' },
        'conversation.plan-review.actions': { kind: 'list', scope: 'session' },
        'conversation.trajectory.images': { kind: 'single', scope: 'session' },
        'conversation.view': { kind: 'list', scope: 'session' }
      }
    }, () => null)
    let productDetails: any = { id: '', runtimeSessionId: '' }
    let productStats: any = { id: '', stats: null }
    const conversations = {
      getDetailsSnapshot: () => productDetails, subscribeDetails: () => () => {},
      getStatsSnapshot: () => productStats, subscribeStats: () => () => {},
    }
    plugin.apply({ sessions: {}, slots: clientSlots, eleckoiConversations: conversations })

    const ModelLabel = () => null
    const releaseModelLabel = slots.register({ name: 'conversation.input.model.label', locale: 'model-label' }, ModelLabel)
    await Promise.resolve()
    const projectedLabel = slots.entriesOfSlot('eleckoi.roleplay.conversation.input.model.label')[0]
    expect(projectedLabel.locale).toBe('model-label')
    const labelOwner = { provider: { id: 'synthetic-provider', name: 'Synthetic' }, model: { id: 'example', name: 'Example' }, placement: 'trigger', selected: true }
    expect(projectedLabel.component(labelOwner)).toMatchObject({ type: ModelLabel, props: labelOwner })
    releaseModelLabel()
    await Promise.resolve()
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.input.model.label')).toHaveLength(0)

    const officialChat = () => null
    const chatInject = () => ({ useChatNode: () => null })
    const chatStore = () => null
    const nodeInject = () => ({ useTurnData: () => null })
    const releaseChatView = slots.register({
      name: 'conversation.view', id: 'chat', inject: chatInject, store: chatStore, locale: 'chat',
      children: {
        'conversation.chat.flow': { kind: 'single', scope: 'session' },
      },
    }, officialChat)
    const releaseFlow = slots.register({ name: 'conversation.chat.flow',
      children: {
        'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: nodeInject },
        'conversation.chat.before': { kind: 'single', scope: 'session' },
        'conversation.chat.pending-input': { kind: 'single', scope: 'session' },
      },
    }, officialChat)
    const releaseChat = () => { releaseFlow(); releaseChatView() }
    await Promise.resolve()
    const toolNode = () => null
    const toolCard = () => null
    const releaseToolNode = slots.register({ name: 'conversation.chat.node', key: 'tool-call', children: {
      'tool.call.toolview': { kind: 'keyed', scope: 'session' },
    } }, toolNode)
    const releaseToolCard = slots.register({ name: 'tool.call.toolview', key: 'synthetic-read' }, toolCard)
    await Promise.resolve()
    expect(slots.spec('eleckoi.roleplay.chat.node.tool.call.toolview')).toEqual({ kind: 'keyed', scope: 'session' })
    const toolProjection = slots.entriesOfSlot('eleckoi.roleplay.chat.node').find((entry: any) => entry.options.key === 'tool-call')
    const projectedTool = toolProjection.component({ renderSlot: (name: string, owner: unknown, options: unknown) => ({ name, owner, options }) })
    expect(projectedTool.type).toBe(toolNode)
    expect(projectedTool.props.renderSlot('tool.call.toolview', { callId: 'native-call' }, { entryKey: 'synthetic-read' }))
      .toEqual({ name: 'eleckoi.roleplay.chat.node.tool.call.toolview', owner: { callId: 'native-call' }, options: { entryKey: 'synthetic-read' } })
    const ownToolOwner = { callId: 'owned-call', toolName: 'eleckoi_read_setting_files' }
    const customCard = { type: 'custom-results' }
    const renderToolCall = (owner: unknown, renderNative: () => unknown) => owner === ownToolOwner ? customCard : renderNative()
    const customTool = toolProjection.component({ renderToolCall,
      renderSlot: (name: string, owner: unknown, options: unknown) => ({ name, owner, options }) })
    expect(customTool.props.renderSlot('tool.call.toolview', ownToolOwner, { entryKey: ownToolOwner.toolName })).toBe(customCard)
    const foreignOwner = { callId: 'foreign-call', toolName: 'synthetic-read' }
    expect(customTool.props.renderSlot('tool.call.toolview', foreignOwner, { entryKey: foreignOwner.toolName }))
      .toEqual({ name: 'eleckoi.roleplay.chat.node.tool.call.toolview', owner: foreignOwner, options: { entryKey: foreignOwner.toolName } })
    expect(slots.entriesOfSlot('eleckoi.roleplay.chat.node.tool.call.toolview')[0].component({}).type).toBe(toolCard)

    const typeDeclarations = [...slotTypes.matchAll(/'([^']+)':\s*\{\s*kind:\s*'([^']+)'\s*scope:\s*'([^']+)'/g)]
      .filter(([, id]) => !id!.startsWith('eleckoi.roleplay.session'))
    expect(manifest.eleckoi.developerInterfaces.filter((item: any) => item.kind === 'ui-slot').map((item: any) => item.id).sort())
      .toEqual(typeDeclarations.map(([, id]) => id).sort())
    const modes: Record<string, string> = { single: 'replace', keyed: 'replace', chain: 'replace', list: 'append' }
    for (const [, id, kind, scope] of typeDeclarations) {
      const metadata = manifest.eleckoi.developerInterfaces.find((item: any) => item.id === id)
      expect(slots.spec(id), id).toMatchObject({ kind, scope })
      expect(metadata, id).toMatchObject({ kind: 'ui-slot', mode: modes[kind!], scope })
    }
    for (const id of ['eleckoi.roleplay.input.left', 'eleckoi.roleplay.input.right',
      'eleckoi.roleplay.input.overlay', 'eleckoi.roleplay.composer.dock']) {
      expect(slots.spec(id), id).toBeUndefined()
    }

    const extensionButton = () => null
    const extensionDock = () => null
    const extensionImage = () => null
    const officialComposer = () => null
    const officialRightbarButton = () => null
    const skinComposer = () => null
    const losingComposer = () => null
    const takeoverComposer = () => null
    const store = () => null
    const inject = () => ({ value: 1 })
    const releaseOfficialComposer = slots.register({
      name: 'conversation.composer.bar',
      registrant: '@deepseek-ai/dsh-client-ui-conversation'
    }, officialComposer)
    const releaseOfficialRightbarButton = slots.register({
      name: 'conversation.session.header.corner',
      inject,
      store,
      locale: 'sidebarRight',
      registrant: '@deepseek-ai/dsh-client-ui-sidebar-right'
    }, officialRightbarButton)
    const releaseLosingComposer = slots.register({
      name: 'conversation.composer.bar', priority: 10, registrant: 'sample-losing-skin'
    }, losingComposer)
    await Promise.resolve()
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.composer.bar')).toHaveLength(1)
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.composer.bar')[0]?.component({}).type)
      .toBe(officialComposer)
    const releaseSkinComposer = slots.register({
      name: 'conversation.composer.bar', priority: -10, registrant: 'sample-input-skin'
    }, skinComposer)
    const takeoverRequest = { sessionId: 'session-1', kind: 'approval' }
    const takeoverSelect = (owner: any) => owner.pendingInteraction ? takeoverRequest : null
    const releaseTakeover = slots.register({
      name: 'conversation.composer', priority: 1, select: takeoverSelect, registrant: 'sample-approval'
    }, takeoverComposer)
    const releaseButton = slots.register({
      name: 'conversation.input.right', id: 'sample-button', order: 12,
      inject, store, locale: 'sample', registrant: 'sample-extension'
    }, extensionButton)
    const releaseDock = slots.register({
      name: 'conversation.composer.dock', id: 'sample-dock', order: 4,
      registrant: 'sample-extension'
    }, extensionDock)
    const releaseInputDock = slots.register({
      name: 'conversation.input.dock', id: 'sample-input-dock', order: 2,
      registrant: 'sample-extension'
    }, extensionDock)
    const releaseQueueDock = slots.register({
      name: 'conversation.input.dock', id: 'queue', order: 20,
      registrant: '@deepseek-ai/dsh-client-ui-conversation'
    }, extensionDock)
    const releaseLeft = slots.register({ name: 'conversation.input.left', id: 'left-button' }, extensionButton)
    const releaseOverlay = slots.register({ name: 'conversation.input.overlay', id: 'overlay' }, extensionButton)
    const releaseImage = slots.register({ name: 'conversation.trajectory.images', id: 'trajectory-images' }, extensionImage)
    const trajectory = () => null
    const releaseTrajectory = slots.register({
      name: 'conversation.view', id: 'trajectory', inject, store, locale: 'trajectory',
      children: { 'sample.trajectory.child': { kind: 'single', scope: 'session' } }
    }, trajectory)
    await Promise.resolve()

    const bar = slots.entriesOfSlot('eleckoi.roleplay.conversation.composer.bar')[0]
    expect(bar?.options.priority).toBe(-10)
    expect(bar?.registrant).toBe('sample-input-skin')
    const childCalls: Array<{ name: string, owner: unknown, options: unknown }> = []
    const renderBridgeSlot = (name: string, owner: unknown, options: unknown) => {
      childCalls.push({ name, owner, options })
      return 'bridged-child'
    }
    const barRender = bar?.component({ marker: 'skin', renderBridgeSlot })
    expect(barRender.type).toBe(skinComposer)
    expect(barRender.props.renderBridgeSlot).toBeUndefined()
    expect(barRender.props.renderSlot('conversation.input.model', { locked: false }, { fallback: 'fallback' }))
      .toBe('bridged-child')
    expect(childCalls[0]).toEqual({
      name: 'eleckoi.roleplay.conversation.input.model',
      owner: { locked: false },
      options: { fallback: 'fallback' }
    })
    const takeover = slots.entriesOfSlot('eleckoi.roleplay.conversation.composer')[0]
    expect(takeover?.select).toBe(takeoverSelect)
    expect(takeover?.select({ pendingInteraction: true })).toBe(takeoverRequest)
    const takeoverRender = takeover?.component({ matched: takeoverRequest, renderBridgeSlot })
    expect(takeoverRender.type).toBe(takeoverComposer)
    expect(takeoverRender.props.renderSlot('conversation.approval.detail', {}, undefined))
      .toBe('bridged-child')

    const button = slots.entriesOfSlot('eleckoi.roleplay.conversation.input.right')[0]
    const rightbarButton = slots.entriesOfSlot('eleckoi.roleplay.conversation.header.corner')[0]
    const dock = slots.entriesOfSlot('eleckoi.roleplay.conversation.composer.dock')[0]
    const inputDock = slots.entriesOfSlot('eleckoi.roleplay.conversation.input.dock')[0]
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.input.dock')
      .some((entry: any) => entry.options.id === 'dsh:conversation.input.dock:queue')).toBe(false)
    expect(button?.component({ marker: 'button' })).toEqual({ type: extensionButton, props: { marker: 'button' } })
    expect(rightbarButton?.component({ marker: 'rightbar' })).toEqual({
      type: officialRightbarButton,
      props: { marker: 'rightbar' }
    })
    expect(rightbarButton?.inject).toBe(inject)
    expect(rightbarButton?.store).toBe(store)
    expect(rightbarButton?.locale).toBe('sidebarRight')
    expect(button?.options).toMatchObject({ id: 'dsh:conversation.input.right:sample-button', order: 12 })
    expect(button?.inject).toBe(inject)
    expect(button?.store).toBe(store)
    expect(button?.locale).toBe('sample')
    const upstreamProjection = (key: string) => `old:${key}`
    const dockRender = dock?.component({ useProjection: upstreamProjection })
    expect(dockRender.type).toBe(extensionDock)
    expect(dockRender.props.useProjection).toBe(upstreamProjection)
    expect(dockRender.props.useProjection('sessionStats')).toBe('old:sessionStats')
    expect(dockRender.props.useProjection('tokenUsage')).toBe('old:tokenUsage')
    expect(dockRender.props.useProjection('other')).toBe('old:other')
    expect(inputDock?.component({ session: { id: 's1' }, input: { text: 'draft' } })).toEqual({
      type: extensionDock,
      props: { session: { id: 's1' }, input: { text: 'draft' } }
    })
    const releaseStats = slots.register({ name: 'conversation.composer.dock', id: 'usage' }, extensionDock)
    await Promise.resolve()
    const statsEntry = slots.entriesOfSlot('eleckoi.roleplay.conversation.composer.dock')
      .find((entry: any) => entry.options.id === 'dsh:conversation.composer.dock:usage')
    expect(statsEntry).toBeDefined()
    let statsAvailable = true
    const statsProjection = (key: string) => !statsAvailable ? null : key === 'sessionStats'
      ? { turns: 3, steps: 5, llmMs: 1 }
      : key === 'eleckoiHistoryStatsAdjustment' ? { turns: 1, steps: 2 }
        : `official:${key}`
    productDetails = { id: 'sample-chat', runtimeSessionId: 'sample-session' }
    productStats = { id: 'sample-chat', stats: {
      sessionStats: { turns: 2, steps: 3, llmMs: 1 }, tokenUsage: 'official:tokenUsage',
    } }
    const statsRender = statsEntry?.component({ sessionId: 'sample-session', useProjection: statsProjection })
    expect(statsRender.type).toBe(extensionDock)
    expect(statsRender.props.useProjection('sessionStats')).toEqual({ turns: 2, steps: 3, llmMs: 1 })
    expect(statsRender.props.useProjection('tokenUsage')).toBe('official:tokenUsage')
    statsAvailable = false
    const statsDuringRebind = statsEntry?.component({ sessionId: 'sample-session', useProjection: statsProjection })
    expect(statsDuringRebind.props.useProjection('sessionStats')).toEqual({ turns: 2, steps: 3, llmMs: 1 })
    expect(statsDuringRebind.props.useProjection('tokenUsage')).toBe('official:tokenUsage')
    expect(statsDuringRebind.props.useProjection('sessionStats', (value: any) => value.steps)).toBe(3)
    const otherSession = statsEntry?.component({ sessionId: 'other-session', useProjection: statsProjection })
    expect(otherSession.props.useProjection('sessionStats')).toBeNull()
    expect(statsEntry?.component({ useProjection: statsProjection, generationStatsEnabled: false })).toBeNull()
    releaseStats()
    const seat = slots.entriesOfSlot('eleckoi.roleplay.trajectory')[0]
    expect(seat?.inject).toBe(inject)
    expect(seat?.store).toBe(store)
    expect(seat?.locale).toBe('trajectory')
    const productView = () => null
    const renderSlot = (name: string, owner: unknown) => ({ name, owner })
    const rendered = seat?.component({ component: productView, useProjection: upstreamProjection, renderSlot })
    expect(rendered.type).toBe(productView)
    expect(rendered.props.useProjection).toBe(upstreamProjection)
    expect(rendered.props.renderSlot('conversation.trajectory.images', { id: 'image' }))
      .toEqual({ name: 'eleckoi.roleplay.trajectory.images', owner: { id: 'image' } })
    expect(slots.spec('eleckoi.roleplay.conversation.input.right')).toEqual({ kind: 'list', scope: 'session' })
    expect(slots.spec('conversation.trajectory.images')).toEqual({ kind: 'single', scope: 'session' })
    expect(slots.entriesOfSlot('conversation.trajectory.images')[0]?.component).toBe(extensionImage)
    expect(slots.spec('eleckoi.roleplay.trajectory.images')).toEqual({ kind: 'single', scope: 'session' })
    expect(slots.entriesOfSlot('eleckoi.roleplay.trajectory.images')[0]?.component({ marker: 'image' }))
      .toEqual({ type: extensionImage, props: { marker: 'image' } })
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.input.left')).toHaveLength(1)
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.input.overlay')).toHaveLength(1)
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.header.corner')).toHaveLength(1)

    const chatEntry = slots.entriesOfSlot('eleckoi.roleplay.chat')[0]
    expect(chatEntry.inject).toBe(chatInject)
    expect(chatEntry.store).toBe(chatStore)
    expect(chatEntry.locale).toBe('chat')
    expect(slots.spec('eleckoi.roleplay.chat.node').inject).toBe(nodeInject)
    const useChatNode = () => null
    const renderedChat = chatEntry.component({
      useChat: (select: any) => select({ order: [] }),
      useChatNode, renderSlot: renderBridgeSlot, before: 'opening',
      useProjection: () => undefined,
      renderChatNode: ({ node }: any) => node.kind === 'user' ? 'roleplay-input' : node.kind === 'turn-process' ? null : undefined,
      renderPendingInput: () => 'roleplay-pending',
      usePresentation: (select: any) => select({ foldCompletedTurns: true, stepGrouping: 'collapsed', showImages: true }),
    })
    expect(renderedChat.type).toBe(officialChat)
    expect(renderedChat.props.useChatNode).toBe(useChatNode)
    expect(renderedChat.props.usePresentation((value: any) => value)).toEqual({
      foldCompletedTurns: false, stepGrouping: 'none', showImages: true,
    })
    expect(renderedChat.props.renderSlot('conversation.chat.node', { node: { kind: 'user' } }, {})).toBe('roleplay-input')
    expect(renderedChat.props.renderSlot('conversation.chat.node', { node: { kind: 'turn-process' } }, {})).toBeNull()
    const nodeOptions = { entryKey: 'turn-error', hookContext: { exact: true } }
    renderedChat.props.renderSlot('conversation.chat.node', { node: { kind: 'turn-error' } }, nodeOptions)
    expect(childCalls.at(-1)).toEqual({ name: 'eleckoi.roleplay.chat.node', owner: { node: { kind: 'turn-error' } }, options: nodeOptions })
    renderedChat.props.renderSlot('conversation.chat.pending-input', { input: {} }, {})
    expect(childCalls.at(-1)).toMatchObject({ name: 'eleckoi.roleplay.chat.pending-input', options: { fallback: 'roleplay-pending' } })
    renderedChat.props.renderSlot('conversation.chat.before', {}, {})
    expect(childCalls.at(-1)).toMatchObject({ name: 'eleckoi.roleplay.chat.before', options: { fallback: 'opening' } })

    releaseSkinComposer()
    releaseTakeover()
    releaseButton()
    releaseDock()
    releaseInputDock()
    releaseQueueDock()
    releaseLeft()
    releaseOverlay()
    releaseImage()
    releaseTrajectory()
    await Promise.resolve()
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.composer.bar')).toHaveLength(1)
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.composer.bar')[0]?.component({}).type)
      .toBe(officialComposer)
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.composer')).toHaveLength(0)
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.input.right')).toHaveLength(0)
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.composer.dock')).toHaveLength(0)
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.input.left')).toHaveLength(0)
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.input.overlay')).toHaveLength(0)
    expect(slots.entriesOfSlot('conversation.trajectory.images')).toHaveLength(0)
    expect(slots.entriesOfSlot('eleckoi.roleplay.trajectory.images')).toHaveLength(0)
    expect(slots.entriesOfSlot('eleckoi.roleplay.trajectory')).toHaveLength(0)
    releaseOfficialRightbarButton()
    await Promise.resolve()
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.header.corner')).toHaveLength(0)
    releaseLosingComposer()
    releaseOfficialComposer()
    await Promise.resolve()
    expect(slots.entriesOfSlot('eleckoi.roleplay.conversation.composer.bar')).toHaveLength(0)
    releaseToolCard()
    releaseToolNode()
    releaseChat()
    await Promise.resolve()
    expect(slots.entriesOfSlot('eleckoi.roleplay.chat')).toHaveLength(0)
    expect(slots.spec('eleckoi.roleplay.chat.node')).toBeUndefined()
    expect(slots.spec('conversation.chat.node')).toBeUndefined()
    for (const dispose of injectors.reverse()) dispose()
    releaseRoot()
  })
})

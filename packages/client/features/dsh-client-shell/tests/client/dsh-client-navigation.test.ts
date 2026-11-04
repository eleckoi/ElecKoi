import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { dshClientRequire } from '../../../../../../tests/helpers/dshClientPlugin'

const packages = [
  'dsh-client-shell', 'dsh-client-conversations', 'dsh-client-characters',
  'dsh-client-presets', 'dsh-client-models'
]

const uiPrimitives = {
  MarkdownText: 'OfficialMarkdownText',
  PluginArtworkDefault: 'PluginArtworkDefault',
  StateDot: 'StateDot',
  Tag: 'Tag',
}

describe('ElecKoi DSH client navigation', () => {
  it.each(['desktop', 'android'])('lets %s feature plugins register formal pages and navigation entries', async (platform) => {
    let root: any
    const OfficialSidebar = () => null
    const officialSidebar = {
      inject: [],
      apply: (scope: any) => scope.slots.inject('sidebar', () =>
        scope.slots.register({ name: 'sidebar' }, OfficialSidebar)),
    }
    const entries: Array<{ options: any; component: any; dispose: () => void }> = []
    const startSession = vi.fn()
    let currentSessionId: string | undefined
    const services: Record<string, any> = {
      uiWorkspace: { startSession },
      uiSession: { adapter: { current: { getSnapshot: () => ({ key: currentSessionId }) } } },
      eleckoiConversations: { getSnapshot: () => ({ items: [{ runtimeSessionId: 'roleplay-session' }] }) },
    }
    const slots = {
      provideRoot: () => () => {},
      register: (options: any, component: any) => {
        const entry = { options, component, dispose: () => { entries.splice(entries.indexOf(entry), 1) } }
        entries.push(entry)
        if (options.name === 'root') root = options
        return entry.dispose
      },
      inject: (_name: string, register: () => Iterable<() => void> | (() => void)) => {
        const result = register()
        if (typeof result === 'function') return
        for (const _dispose of result) { /* Cordis owns each disposer. */ }
      },
      entriesOfSlot: (name: string) => entries.filter(entry => entry.options.name === name),
      spec: () => undefined,
      subscribe: () => () => {},
    }
    for (const packageName of packages) {
      let registration: any
      const source = readFileSync(new URL(`../../../${packageName}/src/client.js`, import.meta.url), 'utf8')
      runInNewContext(source, {
        __ELECKOI_CLIENT_PLATFORM__: { kind: platform },
        __ELECKOI_DSH_APP__: () => null,
        __ELECKOI_DSH_SIDEBAR_READY__: true,
        window: { __ModuleLoader__: { load: (value: any) => { registration = value } },
          addEventListener: () => {}, removeEventListener: () => {} },
        AbortController,
      })
      const plugin = registration.factory((name: string) => {
        if (name === 'react') return {
          Suspense: 'Suspense',
          useEffect: () => {},
          lazy: (load: any) => ({ load }),
          createElement: (component: any, props: any, ...children: any[]) => ({ component, props, children })
        }
        if (name === 'react-dom') return {}
        if (name === '@deepseek-ai/dsh-client-ui-primitives') return uiPrimitives
        if (name === '@deepseek-ai/dsh-client-ui-sidebar') return officialSidebar
        return dshClientRequire(name)
      })
      let effectCount = 0
      const context: any = {
        slots,
        inject: () => {},
        provide: () => {},
        get: (name: string) => services[name],
        plugin: (child: any) => { child.apply(context); return { dispose: async () => {} } },
        extend: (values: any) => ({ ...context, ...values }),
        remote: { eleckoiAgentPresets: {} },
        reflect: { provide: () => () => {} },
        effect: (run: () => void, label: string) => {
          if (packageName === 'dsh-client-shell' && (effectCount++ === 0 || label === 'eleckoi: native workspace sidebar library')) run()
        },
      }
      plugin.apply(context)
    }

    expect(root.children['sidebar.panellist']).toBeUndefined()
    expect(root.children.main).toEqual({ kind: 'keyed', scope: 'root' })
    const panels = slots.entriesOfSlot('main').map(entry => entry.options.key)
    const railItems = slots.entriesOfSlot('sidebar.panellist').map(entry => entry.options.id)
    expect(railItems).toEqual(['creatorStudio', 'community', 'messages', 'character', 'presets', 'model'])
    expect(panels).toEqual(['settings', 'messages', 'character', 'presets', 'model'])

    for (const id of panels) {
      const entry = entries.find(item => item.options.name === 'main' && item.options.key === id)
      const rendered = entry?.component({})
      expect(entry?.options.registrant).toMatch(/^@eleckoi\/dsh-client-/)
      expect(rendered?.component.load).toBeTypeOf('function')
      expect(rendered?.props).toBeUndefined()
    }

    const layout = root.inject().layout
    const workspaceEntry = slots.entriesOfSlot('sidebar.panellist.actions').find(entry => entry.options.id === 'eleckoi-workspace')!
    expect(workspaceEntry.options.order).toBeGreaterThan(0)
    const dismiss = vi.fn()
    const action = workspaceEntry.component({ onDismiss: dismiss })
    expect(action.children).toEqual(['进入工作区界面'])
    action.props.onSelect()
    expect(dismiss).toHaveBeenCalledOnce()
    expect(startSession).toHaveBeenCalledExactlyOnceWith(undefined, { agentPreset: 'cordis' })
    slots.register({ name: 'main', key: 'extension-page' }, () => null)
    layout.selectPanel('extension-page')
    expect(layout.panelInfo.getSnapshot().activePanelId).toBe('extension-page')
    layout.selectPanel('messages')
    expect(layout.panelInfo.getSnapshot().activePanelId).toBe(null)
    if (platform === 'android') {
      expect(layout.panelInfo.getSnapshot().windowPanelId).toBe('messages')
      slots.register({ name: 'main', key: 'creatorStudio' }, () => null)
      layout.selectPanel('creatorStudio')
      expect(layout.panelInfo.getSnapshot()).toEqual({ activePanelId: null, windowPanelId: 'creatorStudio' })
      expect(slots.entriesOfSlot('sidebar')).toHaveLength(1)
      const sidebar = slots.entriesOfSlot('sidebar')[0]!
      const workspace = sidebar.component({ workspace: true, renderContent: (_render: any, workspace: any) => workspace,
        collapsed: false, width: 288, renderSlot: vi.fn() })
      expect(workspace).toMatchObject({ component: OfficialSidebar, props: { collapsed: false, width: 288 } })
      expect(workspace.props.usePanels()).toEqual([])
      expect(workspace.props.useEntryActions()).toBe(false)
      layout.selectPanel(null)
      expect(layout.panelInfo.getSnapshot()).toEqual({ activePanelId: null, windowPanelId: 'conversation' })
    } else {
      layout.selectPanel(null)
      expect(layout.panelInfo.getSnapshot()).toEqual({ activePanelId: null, windowPanelId: 'conversation' })
      const sidebar = slots.entriesOfSlot('sidebar')[0]!
      expect(sidebar).toBeTruthy()
      const renderNativeSlot = vi.fn()
      expect(sidebar.component({ renderContent: (render: any) => render('sidebar.workspaces', { content: 'original product list' }),
        renderSlot: renderNativeSlot })).toBe('original product list')
      expect(renderNativeSlot).not.toHaveBeenCalled()
      const renderContent = vi.fn((_render: any, workspace: any) => workspace)
      const workspace = sidebar.component({ workspace: true, renderContent, collapsed: false, width: 280, renderSlot: renderNativeSlot })
      expect(renderContent).toHaveBeenCalledOnce()
      expect(workspace).toMatchObject({
        component: OfficialSidebar, props: { collapsed: false, width: 280 },
      })
      expect(workspace.props.usePanels()).toEqual([])
      expect(workspace.props.useEntryActions()).toBe(false)
      workspace.props.renderSlot('sidebar.settings', {})
      expect(renderNativeSlot).not.toHaveBeenCalled()
      workspace.props.renderSlot('sidebar.workspaces', { wide: true })
      expect(renderNativeSlot).toHaveBeenCalledWith('sidebar.workspaces', expect.objectContaining({ wide: true,
        open: expect.any(Function), searchSessions: expect.any(Function) }), undefined)
      expect(slots.entriesOfSlot('sidebar.panellist').some(entry => entry.options.id === 'community')).toBe(true)
      expect(layout.sidebarInfo.getSnapshot()).toEqual({ shown: true })
      layout.toggleSidebar()
      expect(layout.sidebarInfo.getSnapshot()).toEqual({ shown: false })
      layout.toggleSidebar()
      layout.selectPanel('messages')
      await new Promise(resolve => setImmediate(resolve))
      expect(layout.panelInfo.getSnapshot().activePanelId).toBe(null)
      expect(slots.entriesOfSlot('sidebar')).toHaveLength(1)
      expect(slots.entriesOfSlot('sidebar')[0]).toBe(sidebar)
      expect(slots.entriesOfSlot('sidebar.panellist').filter(entry => entry.options.id === 'community')).toHaveLength(1)
      currentSessionId = 'roleplay-session'
      layout.selectPanel(null)
      expect(layout.panelInfo.getSnapshot()).toEqual({ activePanelId: null })
      expect(layout.sidebarInfo.getSnapshot().shown).toBe(false)
      currentSessionId = 'workspace-session'
      layout.selectPanel(null)
      expect(layout.panelInfo.getSnapshot()).toEqual({ activePanelId: null, windowPanelId: 'conversation' })
      expect(layout.sidebarInfo.getSnapshot().shown).toBe(true)
    }
    layout.openRightbar(true, false)
    expect(layout.rightbarInfo.getSnapshot()).toMatchObject({
      shown: true, track: true, fullscreen: false, width: expect.any(Number)
    })
    layout.closeRightbar()
    expect(layout.rightbarInfo.getSnapshot()).toMatchObject({
      shown: false, track: false, fullscreen: false
    })
    expect(() => layout.selectPanel('missing-page')).toThrow('not registered')
  })

  it('keeps the mobile sidebar contract and renders its footer without a second slot', () => {
    let registration: any
    let rootComponent: any
    let rootOptions: any
    const slotCalls: Array<{ name: string; owner: any }> = []
    const footerEntries = [{ options: { name: 'sidebar.footer.action', id: 'example' } }]
    const settingsEntries = [
      { options: { name: 'settings.section', id: 'plugins', order: 15, label: '内置插件' } },
      { options: { name: 'settings.section', id: 'web-search', order: 20, label: '网页搜索' } },
    ]
    const slots = {
      subscribe: () => () => {},
      getVersion: () => 1,
      entriesOfSlot: (name: string) => name === 'sidebar.footer.action' ? footerEntries
        : name === 'settings.section' ? settingsEntries : [],
      provideRoot: () => () => {},
      register: (options: any, component: any) => {
        if (options.name === 'root') {
          rootComponent = component
          rootOptions = options
        }
        return () => {}
      },
      inject: (_name: string, register: () => void) => { register() },
    }
    const ProductApp = () => null
    const sidebarRight = { isExpanded: () => true, toggleExpanded: vi.fn() }
    let stateIndex = 0
    const React = {
      Fragment: 'Fragment',
      lazy: () => ProductApp,
      useState: () => [stateIndex++ === 0 ? ProductApp : '', () => {}],
      useSyncExternalStore: (_subscribe: any, getSnapshot: () => any) => getSnapshot(),
      useMemo: (calculate: () => any) => calculate(),
      useEffect: () => {},
      createElement: (component: any, props: any, ...children: any[]) => ({ component, props, children }),
    }
    const source = readFileSync(new URL('../../src/client.js', import.meta.url), 'utf8')
    runInNewContext(source, {
      __ELECKOI_CLIENT_PLATFORM__: { kind: 'android' },
      window: { __ModuleLoader__: { load: (value: any) => { registration = value } } },
      AbortController,
    })
    const plugin = registration.factory((name: string) => {
      if (name === 'react') return React
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return uiPrimitives
      if (name === '@eleckoi/dsh-product-api') return dshClientRequire(name)
      throw new Error(`Unexpected module ${name}`)
    })
    let effectCount = 0
    plugin.apply({
      slots,
      inject: () => {},
      reflect: { provide: () => () => {} },
      effect: (run: () => void) => { if (effectCount++ === 0) run() },
    })
    const render = (panel = { activePanelId: null } as any) => {
      stateIndex = 0
      const rightbarInfo = { subscribe: () => () => {}, getSnapshot: () => ({ shown: false }) }
      const tree = rootComponent({
        layout: {
          panelInfo: { subscribe: () => () => {}, getSnapshot: () => panel },
          rightbarInfo,
          setViewportWidth: () => {},
          setRightbar: () => {},
        },
        slots,
        sidebarRight,
        locale: { subscribe: () => () => {}, getSnapshot: () => ({ revision: 0 }) },
        renderSlot: (name: string, owner: any) => {
          if (!rootOptions.children[name]) throw new Error(`root cannot render ${name}`)
          slotCalls.push({ name, owner })
          return { slot: name }
        },
      })
      return tree.children[0].children[0].props
    }

    expect(rootOptions.children.sidebar).toEqual({ kind: 'single', scope: 'root' })
    expect(render().markdownComponent).toBe(uiPrimitives.MarkdownText)
    expect(render().navigation.hasSidebarFooterActions).toBe(true)
    expect(render().navigation.selectedPanelId).toBe('messages')
    expect(render({ activePanelId: null, windowPanelId: 'conversation' }).navigation.selectedPanelId).toBe('conversation')
    expect(render().rightbar.render({ width: 360, viewportWidth: 1200, canShow: true })).toEqual({ slot: 'rightbar' })
    render().rightbar.close()
    expect(sidebarRight.toggleExpanded).toHaveBeenCalledTimes(1)
    const content = (renderSidebarSlot: any) => renderSidebarSlot('sidebar.footer.action', { wide: true })
    expect(render().navigation.renderSidebar(content)).toEqual({ slot: 'sidebar' })
    expect(slotCalls.some(call => call.name === 'sidebar' && call.owner.renderContent === content)).toBe(true)
    expect(rootOptions.children['eleckoi.sidebar.footer.action']).toBeUndefined()
    expect(render().settingsSections).toEqual([
      { id: 'plugins', order: 15, label: '内置插件' },
      { id: 'web-search', order: 20, label: '网页搜索' },
    ])
  })
})

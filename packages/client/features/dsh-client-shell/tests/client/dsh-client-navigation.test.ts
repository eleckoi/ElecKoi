import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { dshClientRequire } from '../../../../../../tests/helpers/dshClientPlugin'

import { loadOfficialLayout } from '../../../../../../tests/helpers/officialLayout.js'

const officialLayout = loadOfficialLayout()

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
    let rootShares: any, conversationPanels: any
    const OfficialSidebar = () => null
    const SettingsPage = () => null
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
      sessions: { list: { getSnapshot: () => ({ byId: {}, projectionsBySession: {} }) } },
      eleckoiConversations: { getSnapshot: () => ({ items: [{ runtimeSessionId: 'roleplay-session' }] }) },
    }
    const slots = {
      provideRoot: (shares: any) => { rootShares = shares; return () => {} },
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
      entries: (name: string) => entries.filter(entry => entry.options.name === name),
      entriesOfSlot: (name: string) => entries.filter(entry => entry.options.name === name),
      spec: () => undefined,
      subscribe: () => () => {},
    }
    for (const packageName of packages) {
      let registration: any
      const source = readFileSync(new URL(`../../../${packageName}/src/client.js`, import.meta.url), 'utf8')
      runInNewContext(source.replace('const conversationPanels = createConversationPanelInfo(ctx)',
        'const conversationPanels = createConversationPanelInfo(ctx); captureConversationPanels(conversationPanels)'), {
        captureConversationPanels: (value: any) => { conversationPanels = value },
        __ELECKOI_CLIENT_PLATFORM__: { kind: platform },
        __ELECKOI_DSH_APP__: Object.assign(() => null, { shell: { OfficialFrameSidebar: 'OfficialFrameSidebar', SettingsPage } }),
        window: { __ModuleLoader__: { load: (value: any) => { registration = value } },
          addEventListener: () => {}, removeEventListener: () => {} },
        AbortController,
      })
      const plugin = registration.factory((name: string) => {
        if (name === 'react') return {
          Suspense: 'Suspense',
          useEffect: () => {},
          useCallback: (callback: unknown) => callback,
          useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
          lazy: (load: any) => ({ load }),
          createElement: (component: any, props: any, ...children: any[]) => ({ component, props, children })
        }
        if (name === 'react-dom') return {}
        if (name === '@deepseek-ai/dsh-client-ui-primitives') return uiPrimitives
        if (name === '@deepseek-ai/dsh-client-ui-sidebar') return officialSidebar
        if (name === '@deepseek-ai/dsh-client-ui-layout') return officialLayout
        return dshClientRequire(name)
      })
      const context: any = {
        slots,
        locale: { register: () => () => {}, bind: () => (key: string) => key },
        shortcuts: { register: () => () => {} },
        inject: () => {},
        provide: () => {},
        get: (name: string) => services[name],
        plugin: (child: any) => { child.apply(context); return { dispose: async () => {} } },
        extend: (values: any) => ({ ...context, ...values }),
        remote: { eleckoiAgentPresets: {} },
        reflect: { provide: (name: string, value: unknown) => { services[name] = value; context[name] = value; return () => {} } },
        effect: (run: () => void, label: string) => {
          if (packageName === 'dsh-client-shell' && ['layout: command labels', 'ui-layout: service + root registration', 'eleckoi: product Session destination', 'eleckoi: native workspace sidebar library'].includes(label)) run()
        },
      }
      plugin.apply(context)
    }

    expect(root.children['sidebar.panellist']).toBeUndefined()
    expect(root.children.main).toEqual({ kind: 'keyed', scope: 'root' })
    for (const feature of ['characters', 'presets']) {
      const manifest = JSON.parse(readFileSync(new URL(`../../../dsh-client-${feature}/package.json`, import.meta.url), 'utf8'))
      for (const entry of manifest.eleckoi.developerInterfaces.filter((entry: { kind: string }) => entry.kind === 'ui-slot')) {
        expect(root.children[entry.id], entry.id).toEqual({ kind: entry.mode === 'append' ? 'list' : 'chain', scope: 'root' })
      }
    }
    const panels = slots.entriesOfSlot('main').map(entry => entry.options.key)
    const railItems = slots.entriesOfSlot('sidebar.panellist').map(entry => entry.options.id)
    expect(railItems).toEqual(['creatorStudio', 'community', 'messages', 'character', 'presets', 'model'])
    expect(panels).toEqual(['settings', 'messages', 'character', 'presets', 'model'])
    const renderFactorySlot = vi.fn(() => 'official panel icon')
    const owner = { size: 24, active: true }
    const renderedSidebar = slots.entriesOfSlot('sidebar')[0]!.component({ renderFactorySlot })
    const sidebarFace = renderedSidebar.children[0].props
    expect(sidebarFace.renderSidebarSlot('sidebar.panellist', owner, { only: 'plugins' })).toBe('official panel icon')
    expect(renderFactorySlot).toHaveBeenCalledWith('sidebar.panel.icon', { ...owner, id: 'plugins' })

    for (const id of panels) {
      const entry = entries.find(item => item.options.name === 'main' && item.options.key === id)
      const rendered = entry?.component({})
      expect(entry?.options.registrant).toMatch(/^@eleckoi\/dsh-client-/)
      if (id === 'settings') {
        expect(rendered?.component).toBe(SettingsPage)
        expect(rendered?.props.getUrl).toBeTypeOf('function')
        continue
      }
      expect(rendered?.component.load).toBeTypeOf('function')
      expect(rendered?.props).toBeUndefined()
    }

    const layout = root.inject().layout
    expect(slots.entriesOfSlot('sidebar.panellist.actions').some(entry => entry.options.id === 'eleckoi-workspace')).toBe(false)
    slots.register({ name: 'main', key: 'extension-page' }, () => null)
    layout.selectPanel('extension-page')
    expect(layout.panelInfo.getSnapshot().activePanelId).toBe('extension-page')
    layout.selectPanel('messages')
    expect(layout.panelInfo.getSnapshot().activePanelId).toBe('messages')
    slots.register({ name: 'main', key: 'creatorStudio' }, () => null)
    layout.selectPanel('creatorStudio')
    expect(layout.panelInfo.getSnapshot()).toEqual({ activePanelId: 'creatorStudio' })
    expect(slots.entriesOfSlot('sidebar')).toHaveLength(1)
    const sidebar = slots.entriesOfSlot('sidebar')[0]!
    expect(sidebar.options.children['sidebar.update']).toMatchObject({ kind: 'single', scope: 'root' })
    const renderNativeSlot = vi.fn()
    const face = sidebar.component({ renderSlot: renderNativeSlot,
      usePanels: (select: any) => select([{ id: 'schedules' }, { id: 'plugins' }]), collapsed: false, width: 280 }).children[0].props
    const workspace = face.workspaceSidebar
    expect(workspace).toMatchObject({ component: OfficialSidebar, props: { collapsed: false, width: 280 } })
    expect(workspace.props.usePanels((rows: any) => rows)).toEqual([{ id: 'schedules' }])
    expect(workspace.props.useEntryActions()).toBe(false)
    workspace.props.renderSlot('sidebar.settings', {})
    expect(renderNativeSlot).not.toHaveBeenCalled()
    workspace.props.renderSlot('sidebar.workspaces', { wide: true })
    expect(renderNativeSlot).toHaveBeenCalledWith('sidebar.workspaces', expect.objectContaining({ wide: true,
      open: expect.any(Function), searchSessions: expect.any(Function) }), undefined)
    expect(face.renderSidebarSlot('sidebar.workspaces', { content: 'original product list' })).toBe('original product list')
    expect(slots.entriesOfSlot('sidebar.panellist').filter(entry => entry.options.id === 'community')).toHaveLength(1)
    // Geometry is reported by the actual Frame sidebar owner, not guessed from panel identity.
    layout.reportSidebar({ shown: true, width: 280, drawer: platform === 'android' })
    expect(layout.sidebarInfo.getSnapshot().shown).toBe(true)
    const store = root.store.create()
    expect(store.getSnapshot().layoutInfo.sidebarDrawer).toBe(platform === 'android')
    const expansion = platform === 'android' ? 'narrowExpanded' : 'sidebar'
    const before = store.getSnapshot().layoutInfo[expansion]
    layout.toggleSidebar()
    expect(store.getSnapshot().layoutInfo[expansion]).not.toBe(before)
    layout.toggleSidebar()
    currentSessionId = 'roleplay-session'
    layout.selectPanel(null)
    expect(layout.panelInfo.getSnapshot()).toEqual({ activePanelId: 'messages' })
    currentSessionId = 'workspace-session'
    layout.selectPanel(null)
    expect(layout.panelInfo.getSnapshot()).toEqual({ activePanelId: null })
    expect(slots.entriesOfSlot('sidebar')[0]).toBe(sidebar)
    expect(root.children['shell.bottom']).toEqual({ kind: 'single', scope: 'root' })
    expect(services.layout).toBeInstanceOf(officialLayout.LayoutController)
    for (const panel of ['messages', 'creatorStudio']) {
      currentSessionId = `${panel}-foreground`
      const release = conversationPanels.retain(currentSessionId)
      layout.selectPanel(panel)
      expect(layout.panelInfo.getSnapshot().activePanelId).toBe(panel)
      expect(services.layout.panelInfo.getSnapshot().activePanelId).toBeNull()
      expect(rootShares.hooks.panelInfo.getSnapshot().activePanelId).toBeNull()
      const rootEntry = slots.entriesOfSlot('root')[0]!
      const frame = rootEntry.component({ renderSlot: () => null }).props.nativeFrame
      expect(frame.props.usePanelInfo((value: any) => value.activePanelId)).toBe(panel)
      release()
      expect(services.layout.panelInfo.getSnapshot().activePanelId).toBe(panel)
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
    const slotCalls: Array<{ name: string; owner: any; filter?: any }> = []
    const footerEntries = [{ options: { name: 'sidebar.footer.action', id: 'example' } }]
    const settingsEntries = [
      { options: { name: 'settings.section', id: 'general', order: 0, label: '通用设置' } },
      { options: { name: 'settings.section', id: 'plugins', order: 15, label: '内置插件' } },
      { options: { name: 'settings.section', id: 'web-search', order: 20, label: '网页搜索' } },
    ]
    const slots = {
      subscribe: () => () => {},
      getVersion: () => 1,
      entries: () => [],
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
      useCallback: (callback: unknown) => callback,
      createElement: (component: any, props: any, ...children: any[]) => ({ component, props, children }),
    }
    const source = readFileSync(new URL('../../src/client.js', import.meta.url), 'utf8')
    runInNewContext(source, {
      __ELECKOI_CLIENT_PLATFORM__: { kind: 'android' },
      __ELECKOI_DSH_APP__: ProductApp,
      window: { __ModuleLoader__: { load: (value: any) => { registration = value } } },
      AbortController,
    })
    const plugin = registration.factory((name: string) => {
      if (name === 'react') return React
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return uiPrimitives
      if (name === '@eleckoi/dsh-product-api') return dshClientRequire(name)
      if (name === '@deepseek-ai/dsh-client-ui-layout') return officialLayout
      throw new Error(`Unexpected module ${name}`)
    })
    const services: Record<string, any> = {}
    const context: any = {
      slots, locale: { register: () => () => {}, bind: () => (key: string) => key },
      shortcuts: { register: () => () => {} },
      inject: () => {}, get: (name: string) => services[name],
      plugin: (child: any) => child.apply(context), extend: (values: any) => ({ ...context, ...values }),
      reflect: { provide: (name: string, value: unknown) => { services[name] = value; return () => {} } },
      effect: (run: () => void, label: string) => { if (['layout: command labels', 'ui-layout: service + root registration'].includes(label)) run() },
    }
    plugin.apply(context)
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
        locale: { bind: () => (key: string) => key, subscribe: () => () => {}, getSnapshot: () => ({ revision: 0 }) },
        renderSlot: (name: string, owner: any, filter?: any) => {
          if (!rootOptions.children[name]) throw new Error(`root cannot render ${name}`)
          slotCalls.push({ name, owner, filter })
          return { slot: name }
        },
      })
      return tree.component(tree.props).children[0].children[0].props
    }

    expect(rootOptions.children.sidebar).toEqual({ kind: 'single', scope: 'root' })
    expect(render().markdownComponent).toBe(uiPrimitives.MarkdownText)
    expect(render().navigation.hasSidebarFooterActions).toBe(true)
    expect(render().navigation.selectedPanelId).toBe('conversation')
    expect(render({ activePanelId: null, windowPanelId: 'conversation' }).navigation.selectedPanelId).toBe('conversation')
    expect(render().rightbar.render({ width: 360, viewportWidth: 1200, canShow: true })).toEqual({ slot: 'rightbar' })
    render().rightbar.close()
    expect(sidebarRight.toggleExpanded).toHaveBeenCalledTimes(1)
    expect(render().nativeFrame.component).toBeTypeOf('function')
    expect(render().navigation.renderSidebar).toBeUndefined()
    expect(rootOptions.children['eleckoi.sidebar.footer.action']).toBeUndefined()
    expect(render().settingsSections).toEqual([
      { id: 'plugins', order: 15, label: '内置插件' },
      { id: 'web-search', order: 20, label: '网页搜索' },
    ])
    expect(render().renderLanguageSettings()).toEqual({ slot: 'settings.section' })
    expect(slotCalls.at(-1)).toEqual({ name: 'settings.section', owner: { itemId: 'language' }, filter: { only: 'general' } })
    render().renderSettingsSection({ id: 'plugins' }, undefined)
    expect(slotCalls.at(-1)).toEqual({ name: 'settings.section', owner: { close: undefined }, filter: { only: 'plugins' } })
  })
})

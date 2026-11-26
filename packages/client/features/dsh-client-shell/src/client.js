window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-shell',
  factory(require) {
    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const {
      MarkdownText,
      PluginArtworkDefault,
      SegmentedTabs,
      StateDot,
      Switch
    } = primitives
    const { productFailure, ELECKOI_FAILURE_CODES, unwrapOrFail, failureAlreadyPublished } = require('@eleckoi/dsh-product-api')
    const settingsPageUrl = () => new URL('eleckoi-page-settings.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href
    const nativeSettingsSections = new Set(['account', 'models', 'agent-presets', 'general'])
    const shellActions = new Set(['community'])
    const builtInBundles = [
      "@eleckoi/dsh-client-characters",
      "@eleckoi/dsh-client-character-configuration",
      "@eleckoi/dsh-client-conversations",
      "@eleckoi/dsh-client-creator-studio",
      "@eleckoi/dsh-client-display-preferences",
      "@eleckoi/dsh-client-models",
      "@eleckoi/dsh-client-persona",
      "@eleckoi/dsh-client-presets",
      "@eleckoi/dsh-client-web-search",
      "@eleckoi/dsh-client-shell",
      "@eleckoi/dsh-client-roleplay",
      "@eleckoi/dsh-auto-illustration",
      "@eleckoi/dsh-client-author",
      "@eleckoi/dsh-client-html-resources",
      "@eleckoi/dsh-product-api",
      "@eleckoi/dsh-runtime",
      "@eleckoi/dsh-web-search-tavily"
    ]
    const phaseLabels = { pending: '等待中', loading: '加载中', active: '运行中', failed: '加载失败', unloading: '卸载中' }
    const phaseDots = { pending: 'idle', loading: 'ongoing', active: 'done', failed: 'error', unloading: 'ongoing' }
    const interfaceKindLabels = {
      'ui-slot': '界面槽位', service: '服务接口', event: '事件接口', contribution: '能力接入', remote: '远程接口'
    }
    const interfaceModeLabels = { replace: '可替换', append: '可追加', register: '可注册', call: '可调用', listen: '可订阅' }
    const interfaceScopeLabels = { root: '全局', session: '会话', 'session-maybe': '会话可为空', client: '客户端', host: 'Host' }
    function BuiltInPluginContents({ packageName, face, locale }) {
      const tUi = locale.bind('eleckoi.ui')
      React.useSyncExternalStore(listener => locale.subscribe(listener), () => locale.getSnapshot().revision)
      const snapshot = React.useSyncExternalStore(
        listener => face.hooks.pluginManager.subscribe(listener),
        () => face.hooks.pluginManager.getSnapshot()
      )
      const pkg = snapshot.packages.find(candidate => candidate.name === packageName)
      const [section, setSection] = React.useState('components')
      const prefix = React.useId()
      if (!pkg) return React.createElement('p', { role: 'status' }, tUi("插件包信息尚未就绪。"))
      const developerInterfaces = pkg.developerInterfaces || []
      const tabs = [
        { value: 'components', label: tUi("运行组件 {value0}", {value0: pkg.rows.length}) },
        { value: 'interfaces', label: tUi("开发接口 {value0}", {value0: developerInterfaces.length}) }
      ].map(tab => ({ ...tab, id: `${prefix}-${tab.value}-tab`, panelId: `${prefix}-${tab.value}-panel` }))
      const components = pkg.rows.map(row => {
        const title = row.meta?.title === undefined ? row.rowId : face.resolveText(row.meta.title)
        const description = row.meta?.description === undefined ? '' : face.resolveText(row.meta.description)
        const state = !row.enabled ? 'idle' : row.phase === null ? 'idle' : phaseDots[row.phase]
        const label = !row.enabled ? tUi("已停用") : row.phase === null ? tUi("未运行") : tUi(phaseLabels[row.phase])
        const locked = row.entryId === undefined || row.readOnlyReason !== undefined || pkg.readOnlyReason !== undefined
        const busy = snapshot.busy.includes(packageName) || snapshot.busy.includes(`row:${row.entryId}`)
        return React.createElement('li', {
          key: row.rowId, className: 'eleckoi-plugin-component-row', 'data-plugin-row': row.rowId,
          'data-component-kind': 'component', 'data-state': !row.enabled ? 'off' : row.phase
        },
          React.createElement('span', { className: 'eleckoi-plugin-component-icon', 'aria-hidden': 'true' }, React.createElement(PluginArtworkDefault, { size: 28 })),
          React.createElement('div', { className: 'eleckoi-plugin-component-main' },
            React.createElement('strong', null, title),
            description ? React.createElement('span', null, description) : null,
            React.createElement('code', null, row.rowId),
            React.createElement('code', null, row.moduleName)
          ),
          React.createElement('span', { className: 'eleckoi-plugin-component-state' }, React.createElement(StateDot, { state }), label),
          React.createElement(Switch, {
            checked: row.enabled, label: tUi("启用{value0}", {value0: title}), disabled: !pkg.enabled || locked || busy,
            title: row.readOnlyReason === 'management-required' ? tUi("运行所需的核心组件") : undefined,
            onChange: enabled => face.setRowEnabled(row.entryId, enabled)
          })
        )
      })
      const interfaces = developerInterfaces.map(item => React.createElement('li', {
        key: item.id, className: 'eleckoi-plugin-component-row', 'data-plugin-row': item.id,
        'data-component-kind': 'interface', 'data-interface-kind': item.kind
      },
        React.createElement('span', { className: 'eleckoi-plugin-component-icon', 'aria-hidden': 'true' }, React.createElement(PluginArtworkDefault, { size: 28 })),
        React.createElement('div', { className: 'eleckoi-plugin-component-main' },
          React.createElement('div', { className: 'eleckoi-plugin-interface-heading' },
            React.createElement('strong', null, tUi(item.title)),
            React.createElement('span', { className: 'eleckoi-plugin-interface-type' }, tUi(interfaceKindLabels[item.kind] || item.kind) || item.kind)
          ),
          React.createElement('span', null, tUi(item.description)),
          React.createElement('code', null, item.id),
          React.createElement('span', { className: 'eleckoi-plugin-interface-meta' }, [
            tUi(interfaceModeLabels[item.mode] || item.mode) || item.mode,
            tUi(interfaceScopeLabels[item.scope] || item.scope) || item.scope
          ].join(' · ')),
          item.members?.length ? React.createElement('code', { className: 'eleckoi-plugin-interface-members' }, item.members.join(' · ')) : null,
          item.relation === 'contributes' && item.owner
            ? React.createElement('span', { className: 'eleckoi-plugin-interface-owner' }, tUi("接入 {value0}", {value0: item.owner}))
            : null
        )
      ))
      return React.createElement('div', { className: 'eleckoi-plugin-components', 'data-eleckoi-plugin-detail': packageName },
        React.createElement(SegmentedTabs, { items: tabs, value: section, onChange: setSection, label: tUi("插件详情内容"), className: 'eleckoi-plugin-detail-tabs' }),
        tabs.map(tab => React.createElement('div', {
          key: tab.value, id: tab.panelId, role: 'tabpanel', 'aria-labelledby': tab.id, tabIndex: 0,
          hidden: section !== tab.value, 'data-plugin-section': tab.value
        }, section !== tab.value ? null : React.createElement('ul', { className: 'eleckoi-plugin-component-list' }, tab.value === 'components' ? components : interfaces)))
      )
    }
    function createWorkspaceVisibility(ctx) {
      const sessions = ctx.get('sessions')
      const workspaces = ctx.get('workspaces')
      const conversations = ctx.get('eleckoiConversations')
      const emptyList = { ids: [], byId: {}, projectionsBySession: {}, phase: 'pending' }
      const emptyRegistry = { items: [], pinnedSessionIds: [], archivedSessionIds: [], phase: 'pending' }
      let previousList, previousRegistry, previousCatalog, previousStudioOnly, snapshot
      const getSnapshot = () => {
        const list = sessions?.list.getSnapshot() ?? emptyList
        const registry = workspaces?.list.getSnapshot() ?? emptyRegistry
        const catalog = conversations?.getSnapshot()
        const panel = ctx.get('layout').panelInfo?.getSnapshot()
        const studioOnly = panel?.activePanelId === 'creatorStudio'
        if (snapshot && list === previousList && registry === previousRegistry && catalog === previousCatalog && studioOnly === previousStudioOnly) return snapshot
        previousList = list; previousRegistry = registry; previousCatalog = catalog
        previousStudioOnly = studioOnly
        const protectedIds = new Set((catalog?.items ?? []).map(item => item.runtimeSessionId).filter(Boolean))
        const studioIds = new Set()
        const children = new Map()
        const known = new Set()
        for (const [id, row] of Object.entries(list.byId)) {
          const values = row.projectionValues ?? list.projectionsBySession[id]?.values
          if (values !== undefined) known.add(id)
          if (values?.agentPreset === 'eleckoi-active') protectedIds.add(id)
          if (values?.eleckoiCreatorStudio || values?.agentPreset === 'eleckoi-creator-active') studioIds.add(id)
          if (row.parentId) {
            if (!children.has(row.parentId)) children.set(row.parentId, [])
            children.get(row.parentId).push(id)
          }
        }
        const pending = [...protectedIds]
        for (let index = 0; index < pending.length; index++) for (const child of children.get(pending[index]) ?? []) {
          if (!protectedIds.has(child)) { protectedIds.add(child); pending.push(child) }
        }
        const studioPending = [...studioIds]
        for (let index = 0; index < studioPending.length; index++) for (const child of children.get(studioPending[index]) ?? []) {
          if (!studioIds.has(child)) { studioIds.add(child); studioPending.push(child) }
        }
        // Until ownership arrives, no unknown Session becomes an editable row.
        const ready = catalog?.status === 'ready' && list.phase === 'ready'
        const visible = id => ready && known.has(id) && !protectedIds.has(id) && (!studioOnly || studioIds.has(id))
        const byId = Object.fromEntries(Object.entries(list.byId).filter(([id]) => visible(id)))
        snapshot = {
          protectedIds,
          sessions: { ...list, phase: ready ? list.phase : 'pending', ids: list.ids.filter(visible), byId,
            projectionsBySession: Object.fromEntries(Object.entries(list.projectionsBySession).filter(([id]) => visible(id))) },
          workspaces: { ...registry, items: registry.items.map(item => ({ ...item, sessionIds: item.sessionIds.filter(visible) })),
            pinnedSessionIds: registry.pinnedSessionIds.filter(visible), archivedSessionIds: registry.archivedSessionIds.filter(visible) }
        }
        return snapshot
      }
      const subscribe = listener => {
        const stops = [sessions?.list.subscribe(listener), workspaces?.list.subscribe(listener), conversations?.subscribe(listener), ctx.get('layout').panelInfo?.subscribe(listener)]
        return () => { for (const stop of stops) stop?.() }
      }
      const assertVisible = id => {
        if (!Object.hasOwn(getSnapshot().sessions.byId, id)) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition,
          '该会话不能从插件工作区操作。', { what: '从所属的角色扮演或创作工作室管理会话' })
      }
      return {
        getSnapshot,
        sessions: { subscribe, getSnapshot: () => getSnapshot().sessions },
        workspaces: { subscribe, getSnapshot: () => getSnapshot().workspaces },
        assertVisible,
        open: id => {
          assertVisible(id)
          const row = sessions.list.getSnapshot().byId[id]
          const values = row.projectionValues ?? sessions.list.getSnapshot().projectionsBySession[id]?.values
          if (values?.eleckoiCreatorStudio || values?.agentPreset === 'eleckoi-creator-active') {
            void ctx.get('eleckoiCreatorStudio').sessions.open(id).then(() => ctx.get('layout').selectPanel('creatorStudio')).catch(failureAlreadyPublished)
          } else ctx.get('uiWorkspace').openSession(id)
        },
        startSession: (workspaceId, options) => {
          void ctx.get('eleckoiCreatorStudio').sessions.startWorkspace(workspaceId, options).then(() => ctx.get('layout').selectPanel('creatorStudio')).catch(failureAlreadyPublished)
        },
        searchSessions: async (query, signal) => {
          const result = unwrapOrFail(await sessions.search(query, signal), '工作区搜索失败。')
          const visible = getSnapshot().sessions.byId
          return { ...result, items: result.items.filter(item => Object.hasOwn(visible, item.sessionId)) }
        }
      }
    }
    function mountWorkspaceSidebar(ctx, officialSidebar) {
      const slots = ctx.slots
      const visibility = createWorkspaceVisibility(ctx)
      const workspacePanel = id => id === 'schedules'
      const noEntryActions = () => false
      // Adapt the public plugin registration, retaining its child-slot ownership,
      // injected hooks and lifecycle. Only the native workspace uses its shell.
      const scopedSlots = new Proxy(slots, {
        get(target, name) {
          if (name === 'register') return (options, Component) => target.register(options.name === 'sidebar' ? {
            ...options,
            children: { ...options.children, 'sidebar.update': { kind: 'single', scope: 'root' } },
            inject: (...args) => {
              const face = options.inject?.(...args) ?? {}
              return { ...face, hooks: { ...face.hooks, eleckoiWorkspaceSessions: visibility.sessions, eleckoiWorkspaceRegistry: visibility.workspaces } }
            }
          } : options, options.name === 'sidebar' ? props => {
              const scopedSessions = props.useEleckoiWorkspaceSessions?.(value => value)
              const panel = ctx.get('layout').panelInfo?.getSnapshot()
              const openingStudio = ['creatorStudio', 'schedules'].includes(panel?.activePanelId)
              const protectedCurrent = props.useSessions?.(value => {
                const current = Object.values(value.byId).filter(row => (row.retainedBy?.mainView ?? 0) > 0)
                const protectedIds = visibility.getSnapshot().protectedIds
                return panel?.activePanelId === null && !openingStudio && current.length > 0 && current.every(row => protectedIds.has(row.id))
              })
              React.useEffect(() => { if (protectedCurrent) ctx.get('layout').selectPanel('messages') }, [protectedCurrent, scopedSessions])
              const productSlot = (key, owner, renderOptions) => {
                if (key === 'sidebar.panellist') return props.renderFactorySlot('sidebar.panel.icon', {
                  ...owner, id: renderOptions.only
                })
                // Preserve the former product fallback priority for these seats.
                const entry = slots.entriesOfSlot(key)[0]
                if (owner && Object.hasOwn(owner, 'content') && (entry?.options.priority ?? 0) >= -100) return owner.content
                return props.renderSlot(key, owner, renderOptions)
              }
              const workspaceSidebar = React.createElement(Component, {
                ...props,
                usePanels: select => props.usePanels(rows => select(rows.filter(item => workspacePanel(item.id)))),
                useEntryActions: noEntryActions,
                startSession: visibility.startSession,
                renderSlot: (key, owner, renderOptions) => key === 'sidebar.settings'
                  ? null : key === 'sidebar.brand.mark' && globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind !== 'android'
                    ? React.createElement(React.Fragment) : key === 'sidebar.workspaces' ? (() => {
                    const face = slots.entriesOfSlot(key)[0]?.inject?.()
                    return props.renderSlot(key, { ...owner,
                      useSessions: props.useEleckoiWorkspaceSessions,
                      useWorkspaces: props.useEleckoiWorkspaceRegistry,
                      searchSessions: visibility.searchSessions, open: visibility.open, startSession: visibility.startSession,
                      requestSessionRename: (id, title) => { visibility.assertVisible(id); face.requestSessionRename(id, title) },
                      unarchiveSession: id => { visibility.assertVisible(id); return face.unarchiveSession(id) }
                    }, renderOptions)
                  })() : props.renderSlot(key, owner, renderOptions)
              })
               return React.createElement(React.Suspense, { fallback: null }, renderShellPart('OfficialFrameSidebar',
                 { ...props, renderSidebarSlot: productSlot, workspaceSidebar }))
            } : Component)
          const value = Reflect.get(target, name)
          return typeof value === 'function' ? value.bind(target) : value
        }
      })
      officialSidebar.apply(ctx.extend({ slots: scopedSlots }))
    }
    function createConversationPanelInfo(ctx) {
      // DSH 0.2.2-rc.5 session chrome identifies the Conversation by a null
      // main-panel key. Project mounted product Conversations through its
      // public panel-info shares without replacing the Frame's navigation.
      // RETIRE WHEN: native session chrome accepts a mounted Conversation
      // independently of its enclosing main-panel key.
      const mounted = new Map()
      const listeners = new Set()
      const conversation = { activePanelId: null }
      const notify = () => { for (const listener of listeners) listener() }
      return {
        retain(sessionId) {
          if (!sessionId) return () => {}
          mounted.set(sessionId, (mounted.get(sessionId) ?? 0) + 1)
          notify()
          return () => {
            const count = mounted.get(sessionId) - 1
            if (count) mounted.set(sessionId, count); else mounted.delete(sessionId)
            notify()
          }
        },
        bind(source) {
          const current = () => ctx.get('uiSession')?.adapter.current
          return {
            getSnapshot: () => {
              const info = source.getSnapshot()
              return ['messages', 'creatorStudio'].includes(info.activePanelId) && mounted.has(current()?.getSnapshot().key)
                ? conversation : info
            },
            subscribe: listener => {
              const stops = [source.subscribe(listener), current()?.subscribe(listener)]
              listeners.add(listener)
              return () => { listeners.delete(listener); for (const stop of stops) stop?.() }
            }
          }
        }
      }
    }
    function installNativeConversationContent(ctx, conversationPanels) {
      const slots = ctx.slots
      const Presentation = React.createContext(null)
      const NativeWidth = React.createContext(null)
      const noHeader = () => null
      function ProductViews() { return React.useContext(Presentation).views }
      function ProductComposer() { return React.useContext(Presentation).composer }
      function NoProductWidthControls() { return null }
      function ProductWidthControls(props) {
        const Component = React.useContext(NativeWidth)
        const { widthPreference } = React.useContext(Presentation)
        return React.createElement(Component, { ...props, widthPreference })
      }
      let root, releaseRoot
      const syncRoot = () => {
        const next = slots.entriesOfSlot('main.conversation')[0]
        if (next === root) return
        releaseRoot?.(); releaseRoot = undefined; root = next
        if (!next) return
        releaseRoot = slots.registerFactory({ name: 'eleckoi.conversation.frame', scope: 'session-maybe',
          ...(next.inject ? { inject: next.inject } : {}), ...(next.store ? { store: next.store } : {}),
          ...(next.locale ? { locale: next.locale } : {}) }, props => {
          const host = React.useRef(null)
          const { onScrollElement } = props.presentation
          React.useLayoutEffect(() => conversationPanels.retain(props.sessionId), [props.sessionId])
          React.useLayoutEffect(() => {
            onScrollElement?.(host.current?.querySelector('[data-conversation-scroll]') ?? null)
            return () => onScrollElement?.(null)
          }, [onScrollElement, props.sessionId])
          const { variant, phase, hero, widthControls } = props.presentation
          const renderFactorySlot = React.useCallback((name, owner, options) => name !== 'conversation.content' ? props.renderFactorySlot(name, owner, options)
            : React.createElement(NativeWidth.Provider, { value: options?.slots?.widthControls }, props.renderFactorySlot(name,
              { ...owner, variant: variant ?? owner.variant, phase: phase ?? owner.phase, hero: hero ?? owner.hero },
              { ...options, slots: { ...options?.slots, views: ProductViews, composer: ProductComposer,
                widthControls: widthControls === false || !options?.slots?.widthControls ? NoProductWidthControls : ProductWidthControls } })),
            [props.renderFactorySlot, variant, phase, hero, widthControls])
          return React.createElement(Presentation.Provider, { value: props.presentation },
            React.createElement('div', { ref: host, 'data-eleckoi-native-frame': '', style: { display: 'contents' } }, React.createElement(next.component, { ...props,
              renderSlot: noHeader, renderFactorySlot,
            })))
        })
      }
      const stopRoot = slots.subscribe('main.conversation', syncRoot)
      syncRoot()
      return () => { stopRoot(); releaseRoot?.() }
    }
    function readyProductApp() {
      const app = globalThis.__ELECKOI_DSH_APP__
      return typeof app === 'function' ? app : null
    }

    function renderShellPart(name, props) {
      const Component = readyProductApp()?.shell?.[name]
      return Component ? React.createElement(Component, props) : null
    }

    let productAppLoading
    function loadProductApp(tUi) {
      const existing = readyProductApp()
      if (existing) return Promise.resolve(existing)
      if (productAppLoading) return productAppLoading
      const assets = globalThis.__ELECKOI_CLIENT_ASSETS__
      if (!assets || typeof assets.script !== 'string') {
        return Promise.reject(new Error(tUi("ElecKoi 客户端资源未准备好。")))
      }
      globalThis.__ELECKOI_DSH_PLATFORM__ = {
        react: React,
        jsxRuntime: require('react/jsx-runtime'),
        reactDom: require('react-dom'),
        reactDomClient: require('react-dom/client'),
        primitives
      }
      if (typeof assets.style === 'string' && !document.querySelector('link[data-eleckoi-styles]')) {
        const style = document.createElement('link')
        style.dataset.eleckoiStyles = ''
        style.rel = 'stylesheet'
        style.href = assets.style
        document.head.append(style)
      }
      const app = new Promise((resolve, reject) => {
        const existingApp = globalThis.__ELECKOI_DSH_APP__
        if (typeof existingApp === 'function') { resolve(existingApp); return }
        const cleanUp = () => {
          window.removeEventListener('eleckoi:dsh-app-ready', ready)
          window.removeEventListener('eleckoi:dsh-app-failed', failed)
        }
        const ready = () => { cleanUp(); resolve(globalThis.__ELECKOI_DSH_APP__) }
        const failed = event => {
          cleanUp()
          script.remove()
          reject(new Error(event?.detail || tUi("ElecKoi 客户端脚本加载失败。")))
        }
        const script = document.createElement('script')
        script.dataset.eleckoiScript = ''
        script.type = 'module'
        script.src = assets.script
        script.onerror = failed
        window.addEventListener('eleckoi:dsh-app-ready', ready)
        window.addEventListener('eleckoi:dsh-app-failed', failed)
        document.head.append(script)
      })
      productAppLoading = app.catch(error => {
        productAppLoading = undefined
        throw error
      })
      return productAppLoading
    }

    function ElecKoiRoot({ nativeFrame, layout, slots, subscribeSlots, frontendConnection, locale, theme, subscribeTheme, conversations, characters, characterConfiguration, creatorStudio, models, persona, presets, webSearch, displayPreferences, sidebarRight, renderSlot, renderSlotChain }) {
      const tUi = locale.bind('eleckoi.ui')
      const [ProductApp, setProductApp] = React.useState(readyProductApp)
      const [loadError, setLoadError] = React.useState('')
      const settingsVersion = React.useSyncExternalStore(
        listener => slots.subscribe('settings.section', listener),
        () => slots.getVersion('settings.section')
      )
      const navigationVersion = React.useSyncExternalStore(
        listener => slots.subscribe('sidebar.panellist', listener),
        () => slots.getVersion('sidebar.panellist')
      )
      const footerVersion = React.useSyncExternalStore(
        listener => slots.subscribe('sidebar.footer.action', listener),
        () => slots.getVersion('sidebar.footer.action')
      )
      const mainVersion = React.useSyncExternalStore(
        listener => slots.subscribe('main', listener),
        () => slots.getVersion('main')
      )
      const panelInfo = React.useSyncExternalStore(
        listener => layout.panelInfo.subscribe(listener),
        () => layout.panelInfo.getSnapshot()
      )
      const localeRevision = React.useSyncExternalStore(
        listener => locale.subscribe(listener),
        () => locale.getSnapshot().revision
      )
      const catalogSlots = React.useMemo(() => ({
        render: (name, owner, fallback) => renderSlotChain(name, { ...owner, fallback }, { fallback }),
        actions: (name, owner) => renderSlot(name, owner),
      }), [renderSlot, renderSlotChain])
      const settingsSections = React.useMemo(() => {
        const sections = slots.entriesOfSlot('settings.section').filter(entry =>
          !nativeSettingsSections.has(entry.options.id)
        ).map(entry => ({
          id: entry.options.id,
          order: entry.options.order || 0,
          label: typeof entry.options.label === 'function' ? entry.options.label() : entry.options.label || ''
        }))
        return sections.sort((a, b) => a.order - b.order)
      }, [slots, settingsVersion, localeRevision])
      const navigationItems = React.useMemo(() => {
        const panels = new Set(slots.entriesOfSlot('main').map(entry => entry.options.key))
        return slots.entriesOfSlot('sidebar.panellist')
          .filter(entry => entry.options.id !== 'schedules' && (panels.has(entry.options.id) || shellActions.has(entry.options.id)))
          .map(entry => ({
            id: entry.options.id,
            order: entry.options.order || 0,
            action: shellActions.has(entry.options.id),
            productIcon: entry.registrant?.startsWith('@eleckoi/') || shellActions.has(entry.options.id),
            label: typeof entry.options.label === 'function' ? entry.options.label() : entry.options.label || entry.options.id
          }))
          .sort((a, b) => a.order - b.order)
      }, [slots, navigationVersion, mainVersion, localeRevision])
      const [unpinnedPanels, setUnpinnedPanels] = React.useState([])
      const hasSidebarEntryActions = React.useSyncExternalStore(
        listener => slots.subscribe('sidebar.panellist.actions', listener),
        () => slots.entriesOfSlot('sidebar.panellist.actions').length > 0
      )
      const productPanelIds = React.useMemo(() => slots.entriesOfSlot('main')
        .filter(entry => entry.registrant?.startsWith('@eleckoi/dsh-client-'))
        .map(entry => entry.options.key), [slots, mainVersion])
      const hasSidebarFooterActions = React.useMemo(() =>
        slots.entriesOfSlot('sidebar.footer.action').length > 0, [slots, footerVersion])
      React.useEffect(() => {
        const selected = panelInfo.activePanelId
        const panels = slots.entriesOfSlot('main').map(entry => entry.options.key)
        if (selected && !panels.includes(selected) && panels.length > 0) {
          layout.selectPanel(panels.includes('messages') ? 'messages' : panels[0])
        }
      }, [layout, mainVersion, panelInfo, slots])
      const appearance = React.useMemo(() => ({
        theme,
        subscribe: subscribeTheme
      }), [theme, subscribeTheme])
      const rightbar = React.useMemo(() => ({
        subscribe: layout.rightbarInfo.subscribe,
        getSnapshot: layout.rightbarInfo.getSnapshot,
        setViewportWidth: layout.setViewportWidth,
        setWidth: layout.setRightbar,
        close: () => { if (sidebarRight.isExpanded()) sidebarRight.toggleExpanded() },
        openWorkspaceResource: (sessionId, address) => sidebarRight.openResourceIn(sessionId, address),
        render: owner => renderSlot('rightbar', owner)
      }), [layout, renderSlot, sidebarRight])

      React.useEffect(() => {
        const profileBundles = new Set([
          '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless',
          '@deepseek-ai/dsh-sdk-app', '@deepseek-ai/dsh-acp-app', '@deepseek-ai/dsh-sdk-minimal',
        ])
        const eleckoiPackages = new Map([
          ['@deepseek-ai/dsh-agent-loop', () => tUi("DSH 已有输入生成适配")],
          ['@deepseek-ai/dsh-client-ui-chat', () => tUi("DSH 官方聊天视图适配")],
          ['@deepseek-ai/dsh-client-ui-settings-general', () => tUi("DSH 导航更新入口适配")],
          ['@deepseek-ai/dsh-web-frontend', () => tUi("DSH 网页错误传递适配")],
          ['@deepseek-ai/dsh-client-ui-trajectory', () => tUi("DSH 轨迹请求身份适配")],
          ['@deepseek-ai/dsh-client-ui-plugin-manager', () => tUi("DSH 插件页面适配")],
          ['@deepseek-ai/dsh-client-ui-conversation', () => tUi("DSH 会话输入框适配")],
          ['@deepseek-ai/dsh-client-ui-model-selection', () => tUi("DSH 模型菜单适配")],
          ['@deepseek-ai/dsh-client-ui-theme', () => tUi("DSH 字体设置适配")],
          ['@deepseek-ai/dsh-client-ui-workspace', () => tUi("DSH 启动导航适配")],
          ['@deepseek-ai/dsh-tools', () => tUi("DSH 工具注册来源适配")],
          ['@deepseek-ai/dsh-plugin-manager', () => tUi("DSH 插件管理适配")],
          ['@deepseek-ai/dsh-llm', () => tUi("DSH 模型运行适配")],
          ['@deepseek-ai/dsh-llm-pi-ai', () => tUi("DSH 通用模型适配")],
          ['@deepseek-ai/dsh-llm-deepseek', () => tUi("DSH DeepSeek 模型适配")],
          ['@deepseek-ai/dsh-api-session-controller', () => tUi("DSH 会话控制适配")],
          ['@deepseek-ai/dsh-session', () => tUi("DSH 会话记录适配")],
          ['@deepseek-ai/dsh-session-format-v3-to-v4', () => tUi("DSH 旧会话迁移适配")],
          ['@deepseek-ai/dsh-session-persistence-jsonl', () => tUi("DSH 会话存储适配")],
          ['@deepseek-ai/dsh-spill-policy', () => tUi("DSH 工具结果续读适配")],
          ['@deepseek-ai/dsh-web', () => tUi("DSH 联网提供器适配")],
          ['@deepseek-ai/dsh-tool-web', () => tUi("DSH 联网工具适配")],
          ['@deepseek-ai/dsh-sdk-jsonrpc-server', () => tUi("DSH 桌面通信适配")],
          ['@earendil-works/pi-ai', () => tUi("模型协议适配")]
        ])
        let entry = null
        let face = null
        let navigation = null
        let stopManager = () => {}
        let stopLedger = () => {}
        let stopNavigation = () => {}
        const entries = () => {
          if (!face) return []
          const packages = face.hooks.pluginManager.getSnapshot().packages
            .filter(pkg => !profileBundles.has(pkg.name) && (pkg.official === true || builtInBundles.includes(pkg.name) || eleckoiPackages.has(pkg.name) || pkg.installed))
          const toPackage = pkg => ({
            id: pkg.name,
            kind: 'package',
            name: eleckoiPackages.get(pkg.name)?.()
              || (pkg.meta?.title === undefined ? pkg.name : face.resolveText(pkg.meta.title) || pkg.name),
            icon: pkg.meta?.icon || '',
            group: builtInBundles.includes(pkg.name) || eleckoiPackages.has(pkg.name) ? 'eleckoi'
              : pkg.official === true ? 'official'
                : 'installed'
          })
          return [
            ...packages.map(toPackage),
            ...face.hooks.configLedger.getSnapshot().items.map(item => ({
              id: item.id, kind: 'item', name: item.label, icon: '',
              group: item.id.startsWith('eleckoi.') ? 'eleckoi' : 'official'
            }))
          ]
        }
        const publish = () => {
          const view = navigation?.getSnapshot?.().view
          window.dispatchEvent(new CustomEvent('eleckoi:dsh-plugins:state', {
            detail: {
              entries: entries(),
              status: face?.hooks.pluginManager.getSnapshot().status || 'loading',
              selected: view?.kind === 'item' ? `item:${view.id}`
                : view?.kind === 'package' ? `package:${view.name}` : ''
            }
          }))
        }
        const bind = () => {
          const next = slots.entriesOfSlot('main').find(item => item.options.key === 'plugins') || null
          if (next === entry) return
          stopManager()
          stopLedger()
          stopNavigation()
          entry = next
          face = next?.inject?.() || null
          navigation = next?.store?.create?.() || null
          if (face) {
            stopManager = face.hooks.pluginManager.subscribe(publish)
            stopLedger = face.hooks.configLedger.subscribe(publish)
          }
          if (navigation?.subscribe) stopNavigation = navigation.subscribe(publish)
          publish()
        }
        const request = () => {
          face?.ensure?.()
          publish()
        }
        const select = event => {
          const { id, kind } = event.detail || {}
          if (!entries().some(item => item.id === id && item.kind === kind)) return
          if (!navigation?.actions?.setView) return
          try {
            layout.selectPanel('plugins')
            navigation.actions.setTab('installed')
            navigation.actions.setView(kind === 'item' ? { kind: 'item', id } : { kind: 'package', name: id })
            event.detail.opened = true
          } catch (error) {
            event.detail.error = typeof error?.message === 'string' && error.message.trim() ? error.message : String(error)
          }
        }
        const add = event => {
          if (!face?.openInstall || !navigation?.actions?.setView) return
          try {
            layout.selectPanel('plugins')
            navigation.actions.setView({ kind: 'list' })
            face.openInstall()
            if (event.detail) event.detail.opened = true
          } catch (error) {
            if (event.detail) event.detail.error = typeof error?.message === 'string' && error.message.trim() ? error.message : String(error)
          }
        }
        window.addEventListener('eleckoi:dsh-plugins:request', request)
        window.addEventListener('eleckoi:dsh-plugins:select', select)
        window.addEventListener('eleckoi:dsh-plugins:add', add)
        const stopSlots = slots.subscribe('main', bind)
        const stopLocale = locale.subscribe(publish)
        bind()
        return () => {
          stopSlots()
          stopLocale()
          stopManager()
          stopLedger()
          stopNavigation()
          window.removeEventListener('eleckoi:dsh-plugins:request', request)
          window.removeEventListener('eleckoi:dsh-plugins:select', select)
          window.removeEventListener('eleckoi:dsh-plugins:add', add)
        }
      }, [layout, slots])

      React.useEffect(() => {
        if (ProductApp) return
        let disposed = false
        loadProductApp(tUi).then(app => {
          if (!disposed) setProductApp(() => app)
        }).catch(error => {
          if (!disposed) setLoadError(error instanceof Error ? error.message : String(error))
        })
        return () => { disposed = true }
      }, [])

      return React.createElement(React.Fragment, null,
        React.createElement('div', {
          id: 'eleckoi-root',
          style: { position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'auto' }
        }, ProductApp ? React.createElement(ProductApp, {
          markdownComponent: MarkdownText, locale, nativeFrame,
          slots, subscribeSlots, frontendConnection,
          conversations, characters, characterConfiguration, creatorStudio, models, persona, presets, webSearch, displayPreferences, appearance, settingsSections, rightbar,
          navigation: {
            items: navigationItems.filter(item => !unpinnedPanels.includes(item.id)),
            hasSidebarEntryActions,
            renderSidebarEntryActions: (renderSidebarSlot, onDismiss) => renderSidebarSlot('sidebar.panellist.actions', {
              entries: navigationItems.filter(item => !item.action && item.id !== 'plugins').map(item => ({
                id: item.id, label: item.label, pinned: !unpinnedPanels.includes(item.id), active: panelInfo.activePanelId === item.id
              })),
              onOpen: id => layout.selectPanel(id),
              onPinnedChange: (id, pinned) => {
                if (id === 'plugins') return
                setUnpinnedPanels(current => pinned ? current.filter(value => value !== id) : [...new Set([...current, id])])
              },
              onDismiss
            }),
            productPanelIds,
            hasSidebarFooterActions,
            selectedPanelId: panelInfo.activePanelId ?? 'conversation',
            selectPanel: id => layout.selectPanel(id),
            renderPanel: id => renderSlot('main', {}, { entryKey: id }),
            sidebar: layout.sidebarInfo,
            reportSidebar: layout.reportSidebar,
            toggleSidebar: () => layout.toggleSidebar(),
            closeSidebar: () => layout.closeSidebar(),
            setPanelGuard: guard => layout.setPanelGuard(guard)
          },
          renderWindow: (owner, fallback) => renderSlotChain('eleckoi.shell.window', { ...owner, fallback }, { fallback }),
          renderLanguageSettings: () => renderSlot('settings.section', { itemId: 'language' }, { only: 'general' }),
          renderTypographySettings: () => renderSlot('settings.section', { itemId: 'font-size' }, { only: 'general' }),
          renderSettingsSection: (section, close) => renderSlot('settings.section', { close }, { only: section.id }),
          renderUserProfileEditor: (owner, fallback) => renderSlotChain('eleckoi.persona.editor', { ...owner, fallback }, { fallback }),
          catalogSlots,
          renderCharacterPageSection: (section, owner, fallback) => renderSlotChain(`eleckoi.character.page.${section}`, { ...owner, fallback }, { fallback }),
          renderCharacterEditorSection: (section, owner, fallback) => renderSlotChain(`eleckoi.character.editor.${section}`, { ...owner, fallback }, { fallback }),
          renderCharacterManager: (owner, fallback) => renderSlotChain('eleckoi.character.manager', { ...owner, fallback }, { fallback }),
          renderConversationList: (owner, fallback) => renderSlotChain('eleckoi.conversation.list', { ...owner, fallback }, { fallback }),
          renderPresetEditorSection: (section, owner, fallback) => renderSlotChain(`eleckoi.preset.editor.${section}`, { ...owner, fallback }, { fallback }),
          renderPresetManager: (owner, fallback) => renderSlotChain('eleckoi.preset.manager', { ...owner, fallback }, { fallback }),
          renderCreatorStudioConversation: owner => renderSlot('eleckoi.creator-studio.conversation', owner),
          renderRoleplay: owner => renderSlotChain('eleckoi.roleplay', owner, {
            fallback: React.createElement('section', {
              className: 'chat-panel chat-panel-empty-state',
              'aria-label': tUi("角色聊天插件未启用")
            }, React.createElement('div', { className: 'chat-empty-guide' },
              React.createElement('strong', null, tUi("角色聊天插件未启用"))))
          })
        }) : React.createElement('div', {
          role: loadError ? 'alert' : 'status',
          style: { height: '100%', display: 'grid', placeItems: 'center', color: 'var(--dsw-alias-label-secondary)' },
        }, loadError || locale.bind('common')('loading')))
      )
    }

    function apply(ctx) {
      const subscribeSlots = listener => ctx.on('slots/changed', listener)
      const conversationPanels = createConversationPanelInfo(ctx)
      ctx.effect(() => installNativeConversationContent(ctx, conversationPanels), 'eleckoi: native Conversation factories')
      let currentScriptRuntime = null
      const scriptRuntimeListeners = new Set()
      const scriptRuntimeConnection = {
        getSnapshot: () => currentScriptRuntime,
        subscribe: listener => { scriptRuntimeListeners.add(listener); return () => scriptRuntimeListeners.delete(listener) }
      }
      ctx.inject(['eleckoiAuthorRuntime'], scope => scope.effect(() => {
        const runtime = scope.eleckoiAuthorRuntime
        currentScriptRuntime = runtime
        for (const listener of scriptRuntimeListeners) listener()
        return () => {
          if (currentScriptRuntime !== runtime) return
          currentScriptRuntime = null
          for (const listener of scriptRuntimeListeners) listener()
        }
      }, 'eleckoi: optional script execution status'))
      let currentFrontends = null
      const frontendListeners = new Set()
      const frontendConnection = {
        getSnapshot: () => currentFrontends,
        subscribe: listener => { frontendListeners.add(listener); return () => frontendListeners.delete(listener) }
      }
      ctx.inject(['eleckoiFrontendProjects'], scope => scope.effect(() => {
        const service = scope.eleckoiFrontendProjects
        currentFrontends = service
        for (const listener of frontendListeners) listener()
        return () => {
          if (currentFrontends !== service) return
          currentFrontends = null
          for (const listener of frontendListeners) listener()
        }
      }, 'eleckoi: optional native frontend projects'))
      const mountOfficialLayout = () => {
      const officialLayout = require('@deepseek-ai/dsh-client-ui-layout')
      ctx.plugin({
        inject: officialLayout.inject,
        apply(scope) {
          let nativeLayout
          let conversationPanelInfo
          const slots = scope.slots
          const scopedSlots = new Proxy(slots, {
            get(target, name) {
              // Product pages host the real Conversation in a keyed main seat.
              // Native session chrome must see that mounted foreground Session
              // as a Conversation; the Frame itself keeps the real navigation key.
              if (name === 'provideRoot') return face => {
                if (!face.hooks?.panelInfo) return target.provideRoot(face)
                conversationPanelInfo = conversationPanels.bind(face.hooks.panelInfo)
                return target.provideRoot({ ...face, hooks: { ...face.hooks, panelInfo: conversationPanelInfo } })
              }
              if (name === 'register') return (options, Frame) => {
                if (options.name !== 'root') return target.register(options, Frame)
                const store = options.store.create()
                // RETIRE WHEN: the locked layout exposes an application drawer option;
                // use that option and remove setSidebarDrawer from the managed patch.
                store.actions.setSidebarDrawer(globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === 'android')
                const native = nativeLayout
                const useNativePanelInfo = select => select(React.useSyncExternalStore(native.panelInfo.subscribe, native.panelInfo.getSnapshot))
                let panelGuard = null
                let sidebarSnapshot = { shown: false }
                const sidebarListeners = new Set()
                let rightbarSource, rightbarSnapshot
                const rightbarInfo = {
                  subscribe: listener => store.subscribe(listener),
                  getSnapshot: () => {
                    const info = store.getSnapshot().layoutInfo
                    if (rightbarSource !== info) {
                      rightbarSource = info
                      rightbarSnapshot = { shown: info.rightbarShown, track: info.rightbarTrack,
                        fullscreen: info.rightbarFullscreen, instant: info.rightbarInstant,
                        width: info.rightbar, viewportWidth: info.viewportWidth }
                    }
                    return rightbarSnapshot
                  }
                }
                const layout = {
                  panelInfo: native.panelInfo, rightbarInfo,
                  sidebarInfo: { getSnapshot: () => sidebarSnapshot,
                    subscribe: listener => { sidebarListeners.add(listener); return () => sidebarListeners.delete(listener) } },
                  reportSidebar: next => {
                    if (Object.keys(next).every(key => Object.is(next[key], sidebarSnapshot[key]))) return
                    sidebarSnapshot = next
                    for (const listener of sidebarListeners) listener()
                  },
                  setPanelGuard: guard => { panelGuard = guard; return () => { if (panelGuard === guard) panelGuard = null } },
                  selectPanel: id => {
                    if (globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind !== 'android' && shellActions.has(id)) {
                      window.dispatchEvent(new CustomEvent('eleckoi:shell-action', { detail: id })); return
                    }
                    const commit = () => native.selectPanel(id === 'conversation' ? null : id)
                    if (panelGuard) panelGuard(commit); else commit()
                  },
                  beginNavigation: () => native.beginNavigation(),
                  toggleSidebar: () => native.toggleSidebar(),
                  closeSidebar: () => { if (sidebarSnapshot.shown) native.toggleSidebar() },
                  setViewportWidth: width => store.actions.setViewportWidth(width),
                  setRightbar: width => store.actions.setRightbar(width),
                  openRightbar: (track, fullscreen) => native.openRightbar(track, fullscreen),
                  closeRightbar: () => native.closeRightbar(),
                }
                const routeProductSession = () => {
                  if (native.panelInfo.getSnapshot().activePanelId !== null) return
                  const id = scope.get('uiSession')?.adapter.current.getSnapshot().key
                  if (!id) return
                  if (scope.get('eleckoiConversations')?.getSnapshot().items.some(row => row.runtimeSessionId === id)) native.selectPanel('messages')
                  else {
                    const sessions = scope.get('sessions').list.getSnapshot()
                    const values = sessions.byId[id]?.projectionValues ?? sessions.projectionsBySession[id]?.values
                    if (values?.eleckoiCreatorStudio || values?.agentPreset === 'eleckoi-creator-active') native.selectPanel('creatorStudio')
                  }
                }
                scope.effect(() => store.subscribe(routeProductSession), 'eleckoi: product Session destination')
                const result = target.register({ ...options,
                  children: { ...options.children,
            'settings.section': { kind: 'list', scope: 'root' },
            'eleckoi.shell.window': { kind: 'chain', scope: 'root' },
            'eleckoi.persona.editor': { kind: 'chain', scope: 'root' },
            'eleckoi.character.page.list': { kind: 'chain', scope: 'root' },
            'eleckoi.character.page.profile': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.card': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.cast': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.openings': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.lore': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.variables': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.regex': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.scripts': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.frontend': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.dynamic': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.assets': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.navigation': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.toolbar': { kind: 'chain', scope: 'root' },
            'eleckoi.character.library.list': { kind: 'chain', scope: 'root' },
            'eleckoi.character.library.item': { kind: 'chain', scope: 'root' },
            'eleckoi.character.library.search': { kind: 'chain', scope: 'root' },
            'eleckoi.character.library.sort': { kind: 'chain', scope: 'root' },
            'eleckoi.character.library.groups': { kind: 'chain', scope: 'root' },
            'eleckoi.character.library.selection': { kind: 'chain', scope: 'root' },
            'eleckoi.character.library.menu.actions': { kind: 'list', scope: 'root' },
            'eleckoi.character.library.item.menu.actions': { kind: 'list', scope: 'root' },
            'eleckoi.character.library.group.menu.actions': { kind: 'list', scope: 'root' },
            'eleckoi.character.manager': { kind: 'chain', scope: 'root' },
            'eleckoi.conversation.list': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.profile': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.introduction': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.prompts': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.tools': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.regex': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.scripts': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.page.list': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.page.preview': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.library.item': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.library.search': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.library.groups': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.library.selection': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.library.menu.actions': { kind: 'list', scope: 'root' },
            'eleckoi.preset.library.item.menu.actions': { kind: 'list', scope: 'root' },
            'eleckoi.preset.library.group.menu.actions': { kind: 'list', scope: 'root' },
            'eleckoi.preset.manager': { kind: 'chain', scope: 'root' },
            'eleckoi.roleplay': { kind: 'chain', scope: 'root' },
            'eleckoi.creator-studio.conversation': { kind: 'single', scope: 'root' }
                  },
                  inject: (...args) => ({ ...options.inject?.(...args), layout, slots, subscribeSlots, frontendConnection, locale: scope.locale,
                    theme: scope.theme, subscribeTheme: listener => scope.on('theme/change', listener),
                    conversations: scope.get('eleckoiConversations'), characters: scope.eleckoiCharacters,
                    characterConfiguration: { openings: scope.eleckoiCharacterOpenings, settingLibraries: scope.eleckoiSettingLibraries, globalSettingLibraries: scope.eleckoiGlobalSettingLibraries,
                      variables: scope.eleckoiVariables, regexRules: scope.eleckoiRegexRules,
                      scripts: scope.eleckoiScriptLibraries, scriptRuntimeConnection },
                    creatorStudio: scope.eleckoiCreatorStudio, sidebarRight: scope.get('sidebarRight'), models: scope.eleckoiModels,
                    persona: scope.eleckoiPersona, presets: scope.eleckoiPresets, webSearch: scope.eleckoiWebSearch,
                    displayPreferences: scope.eleckoiDisplayPreferences })
                }, props => {
                  const renderSlot = React.useCallback((name, owner, options) => {
                    const content = props.renderSlot(name, owner, options)
                    if (name !== 'main') return content
                    const id = options.entryKey
                    const entry = slots.entriesOfSlot('main').find(row => row.options.key === id)
                    if (entry?.registrant?.startsWith('@eleckoi/dsh-client-')) return content
                    return React.createElement(React.Suspense, { fallback: null },
                       renderShellPart('OfficialFramePage', { panelId: id, mainPanel: content }) ?? content)
                  }, [props.renderSlot])
                  return React.createElement(ElecKoiRoot, { ...props,
                    nativeFrame: React.createElement(Frame, { ...props, usePanelInfo: useNativePanelInfo, renderSlot }) })
                })
                scope.effect(() => {
                  let initialized = false
                  const initialize = () => {
                    if (initialized || !slots.entriesOfSlot('main').some(entry => entry.options.key === 'messages')) return
                    initialized = true
                    if (native.panelInfo.getSnapshot().activePanelId === null) native.selectPanel('messages')
                  }
                  const stop = slots.subscribe('main', initialize)
                  initialize()
                  return stop
                }, 'eleckoi: initial product destination')
                return result
              }
              const value = Reflect.get(target, name)
              return typeof value === 'function' ? value.bind(target) : value
            }
          })
          const reflect = new Proxy(scope.reflect, {
            get(target, name) {
              if (name === 'provide') return (key, value, ...args) => {
                if (key === 'layout') {
                  nativeLayout = value
                  value = new Proxy(value, { get(target, member) {
                    if (member === 'panelInfo') return conversationPanelInfo
                    const field = Reflect.get(target, member)
                    return typeof field === 'function' ? field.bind(target) : field
                  } })
                }
                return target.provide(key, value, ...args)
              }
              const value = Reflect.get(target, name)
              return typeof value === 'function' ? value.bind(target) : value
            }
          })
          officialLayout.apply(scope.extend({ slots: scopedSlots, reflect }))
        }
      })

      }
      mountOfficialLayout()

      for (const region of ['sidebar.panellist.actions', 'conversation.session.header.views.actions', 'sidebar.right.tab.guide.actions']) {
        ctx.slots.inject(region, () => {
          let current, dispose, stopped = false
          const sync = () => {
            const source = ctx.slots.entries(region).find(entry => entry.options.id === 'entry-customization' && entry.registrant !== '@eleckoi/dsh-client-shell')
            if (stopped || source === current) return
            current = source
            dispose?.()
            if (!source) { dispose = undefined; return }
            dispose = ctx.slots.register({ ...source.options, name: region, locale: source.locale, priority: -100, registrant: '@eleckoi/dsh-client-shell',
              inject: (...args) => ({ ...source.inject?.(...args), createPlugin: () => {
                const area = region.startsWith('conversation') ? 'conversation' : region.startsWith('sidebar.right') ? 'rightbar' : 'sidebar'
                const prompt = ctx.locale.bind('entryCustomization')(`createPrompt.${area}`)
                const opening = ctx.get('eleckoiCreatorStudio').sessions.startWorkspace(undefined, { prompt, whenDraftExists: 'append' })
                // The shell's child plugin provides layout; the parent cannot
                // read ctx.layout without inject. Resolve that owned service
                // through Cordis instead of adding a circular shell dependency.
                ctx.get('layout').selectPanel('creatorStudio')
                void opening.catch(failureAlreadyPublished)
              } }) }, source.component)
          }
          const stop = ctx.slots.subscribe(region, sync)
          sync()
          return () => { stopped = true; stop(); dispose?.() }
        })
      }
      ctx.effect(() => {
          let mounted = false
          const mount = () => {
            if (mounted) return
            mounted = true
            const officialSidebar = require('@deepseek-ai/dsh-client-ui-sidebar')
            ctx.plugin({
              inject: officialSidebar.inject,
              apply: scope => mountWorkspaceSidebar(scope, officialSidebar)
            })
          }
          if (readyProductApp()) mount()
          window.addEventListener('eleckoi:dsh-app-ready', mount)
          return () => window.removeEventListener('eleckoi:dsh-app-ready', mount)
      }, 'eleckoi: native workspace sidebar library')
      ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark', priority: -100 },
           ({ size }) => renderShellPart('SidebarBrandMark', { size })))
        ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -100 },
           () => renderShellPart('SidebarBrandName')))

      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'settings', registrant: '@eleckoi/dsh-client-shell' },
         () => renderShellPart('SettingsPage', { getUrl: settingsPageUrl })))
      ctx.slots.inject('sidebar.panellist', () => [
        ctx.slots.register({
          name: 'sidebar.panellist', id: 'creatorStudio', order: 10,
          label: () => ctx.locale.bind('eleckoi.ui')("AI创作工作室"), registrant: '@eleckoi/dsh-client-shell'
         }, ({ size }) => renderShellPart('CreatorStudioNavigationIcon', { size })),
        ctx.slots.register({
          name: 'sidebar.panellist', id: 'community', order: 20,
          label: () => ctx.locale.bind('eleckoi.ui')("社区"), registrant: '@eleckoi/dsh-client-shell'
         }, ({ size }) => renderShellPart('CommunityNavigationIcon', { size }))
      ])
      ctx.slots.inject('plugins.bundle.config', () => builtInBundles.filter(name => name !== '@eleckoi/dsh-auto-illustration').map(packageName => ctx.slots.register({
        name: 'plugins.bundle.config', key: packageName, registrant: '@eleckoi/dsh-client-shell'
      }, () => {
        const entry = ctx.slots.entriesOfSlot('main').find(candidate => candidate.options.key === 'plugins')
        const face = entry?.inject?.()
        return face ? React.createElement(BuiltInPluginContents, { key: packageName, packageName, face, locale: ctx.locale })
          : React.createElement('p', { role: 'status' }, '插件管理器尚未就绪。')
      })))

    }

    return {
      inject: ['slots', 'locale', 'theme', 'eleckoiCharacters', 'eleckoiCharacterOpenings', 'eleckoiSettingLibraries', 'eleckoiGlobalSettingLibraries', 'eleckoiVariables', 'eleckoiRegexRules', 'eleckoiScriptLibraries', 'eleckoiCreatorStudio', 'eleckoiDisplayPreferences', 'eleckoiModels', 'eleckoiPersona', 'eleckoiPresets', 'eleckoiWebSearch'],
      apply
    }
  }
})

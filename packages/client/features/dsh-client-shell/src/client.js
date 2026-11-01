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
    const { productFailure, ELECKOI_FAILURE_CODES } = require('@eleckoi/dsh-product-api')
    const SettingsPage = React.lazy(() => import(new URL('eleckoi-page-settings.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
      .then(module => ({ default: module.SettingsPage })))
    const CreatorStudioNavigationIcon = React.lazy(() => import(new URL('eleckoi-page-settings.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
      .then(module => ({ default: module.CreatorStudioNavigationIcon })))
    const CommunityNavigationIcon = React.lazy(() => import(new URL('eleckoi-page-settings.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
      .then(module => ({ default: module.CommunityNavigationIcon })))
    const nativeSettingsSections = new Set(['account', 'general', 'models', 'agent-presets'])
    const shellActions = new Set(['creatorStudio', 'community'])
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
    function BuiltInPluginContents({ packageName, face }) {
      const snapshot = React.useSyncExternalStore(
        listener => face.hooks.pluginManager.subscribe(listener),
        () => face.hooks.pluginManager.getSnapshot()
      )
      const pkg = snapshot.packages.find(candidate => candidate.name === packageName)
      const [section, setSection] = React.useState('components')
      const prefix = React.useId()
      if (!pkg) return React.createElement('p', { role: 'status' }, '插件包信息尚未就绪。')
      const developerInterfaces = pkg.developerInterfaces || []
      const tabs = [
        { value: 'components', label: `运行组件 ${pkg.rows.length}` },
        { value: 'interfaces', label: `开发接口 ${developerInterfaces.length}` }
      ].map(tab => ({ ...tab, id: `${prefix}-${tab.value}-tab`, panelId: `${prefix}-${tab.value}-panel` }))
      const components = pkg.rows.map(row => {
        const title = row.meta?.title === undefined ? row.rowId : face.resolveText(row.meta.title)
        const description = row.meta?.description === undefined ? '' : face.resolveText(row.meta.description)
        const state = !row.enabled ? 'idle' : row.phase === null ? 'idle' : phaseDots[row.phase]
        const label = !row.enabled ? '已停用' : row.phase === null ? '未运行' : phaseLabels[row.phase]
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
            checked: row.enabled, label: `启用${title}`, disabled: !pkg.enabled || locked || busy,
            title: row.readOnlyReason === 'management-required' ? '运行所需的核心组件' : undefined,
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
            React.createElement('strong', null, item.title),
            React.createElement('span', { className: 'eleckoi-plugin-interface-type' }, interfaceKindLabels[item.kind] || item.kind)
          ),
          React.createElement('span', null, item.description),
          React.createElement('code', null, item.id),
          React.createElement('span', { className: 'eleckoi-plugin-interface-meta' }, [
            interfaceModeLabels[item.mode] || item.mode,
            interfaceScopeLabels[item.scope] || item.scope
          ].join(' · ')),
          item.members?.length ? React.createElement('code', { className: 'eleckoi-plugin-interface-members' }, item.members.join(' · ')) : null,
          item.relation === 'contributes' && item.owner
            ? React.createElement('span', { className: 'eleckoi-plugin-interface-owner' }, `接入 ${item.owner}`)
            : null
        )
      ))
      return React.createElement('div', { className: 'eleckoi-plugin-components', 'data-eleckoi-plugin-detail': packageName },
        React.createElement(SegmentedTabs, { items: tabs, value: section, onChange: setSection, label: '插件详情内容', className: 'eleckoi-plugin-detail-tabs' }),
        tabs.map(tab => React.createElement('div', {
          key: tab.value, id: tab.panelId, role: 'tabpanel', 'aria-labelledby': tab.id, tabIndex: 0,
          hidden: section !== tab.value, 'data-plugin-section': tab.value
        }, section !== tab.value ? null : React.createElement('ul', { className: 'eleckoi-plugin-component-list' }, tab.value === 'components' ? components : interfaces)))
      )
    }
    function ElecKoiSidebar({ renderContent, renderSlot }) {
      return renderContent(renderSlot)
    }
    function ElecKoiRoot({ layout, slots, subscribeSlots, frontendConnection, locale, theme, subscribeTheme, conversations, characters, characterConfiguration, creatorStudio, models, persona, presets, webSearch, displayPreferences, sidebarRight, renderSlot, renderSlotChain }) {
      const [ProductApp, setProductApp] = React.useState(null)
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
          .filter(entry => panels.has(entry.options.id) || shellActions.has(entry.options.id))
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
        const selected = panelInfo.activePanelId ?? 'messages'
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
        render: owner => renderSlot('rightbar', owner)
      }), [layout, renderSlot, sidebarRight])

      React.useEffect(() => {
        const profileBundles = new Set([
          '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless',
          '@deepseek-ai/dsh-sdk-app', '@deepseek-ai/dsh-acp-app', '@deepseek-ai/dsh-sdk-minimal',
        ])
        const eleckoiPackages = new Map([
          ['@deepseek-ai/dsh-agent-loop', 'DSH 已有输入生成适配'],
          ['@deepseek-ai/dsh-client-ui-chat', 'DSH 官方聊天视图适配'],
          ['@deepseek-ai/dsh-client-ui-trajectory', 'DSH 轨迹请求身份适配'],
          ['@deepseek-ai/dsh-client-ui-plugin-manager', 'DSH 插件页面适配'],
          ['@deepseek-ai/dsh-client-ui-conversation', 'DSH 会话输入框适配'],
          ['@deepseek-ai/dsh-client-ui-workspace', 'DSH 启动导航适配'],
          ['@deepseek-ai/dsh-tools', 'DSH 工具注册来源适配'],
          ['@deepseek-ai/dsh-plugin-manager', 'DSH 插件管理适配'],
          ['@deepseek-ai/dsh-llm', 'DSH 模型运行适配'],
          ['@deepseek-ai/dsh-llm-pi-ai', 'DSH 通用模型适配'],
          ['@deepseek-ai/dsh-llm-deepseek', 'DSH DeepSeek 模型适配'],
          ['@deepseek-ai/dsh-api-session-controller', 'DSH 会话控制适配'],
          ['@deepseek-ai/dsh-session', 'DSH 会话记录适配'],
          ['@deepseek-ai/dsh-session-format-v3-to-v4', 'DSH 旧会话迁移适配'],
          ['@deepseek-ai/dsh-session-persistence-jsonl', 'DSH 会话存储适配'],
          ['@deepseek-ai/dsh-spill-policy', 'DSH 工具结果续读适配'],
          ['@deepseek-ai/dsh-web', 'DSH 联网提供器适配'],
          ['@deepseek-ai/dsh-tool-web', 'DSH 联网工具适配'],
          ['@deepseek-ai/dsh-sdk-jsonrpc-server', 'DSH 桌面通信适配'],
          ['@earendil-works/pi-ai', '模型协议适配']
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
            name: eleckoiPackages.get(pkg.name)
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
        bind()
        return () => {
          stopSlots()
          stopManager()
          stopLedger()
          stopNavigation()
          window.removeEventListener('eleckoi:dsh-plugins:request', request)
          window.removeEventListener('eleckoi:dsh-plugins:select', select)
          window.removeEventListener('eleckoi:dsh-plugins:add', add)
        }
      }, [layout, slots])

      React.useEffect(() => {
        const assets = globalThis.__ELECKOI_CLIENT_ASSETS__
        if (!assets || typeof assets.script !== 'string') {
          setLoadError('ElecKoi 客户端资源未准备好。')
          return
        }
        globalThis.__ELECKOI_DSH_PLATFORM__ = {
          react: React,
          jsxRuntime: require('react/jsx-runtime'),
          reactDom: require('react-dom'),
          reactDomClient: require('react-dom/client'),
          primitives
        }
        const ready = () => {
          if (typeof globalThis.__ELECKOI_DSH_APP__ === 'function') {
            setProductApp(() => globalThis.__ELECKOI_DSH_APP__)
            setLoadError('')
          }
        }
        const failed = event => setLoadError(event.detail || 'ElecKoi 客户端启动失败。')
        window.addEventListener('eleckoi:dsh-app-ready', ready)
        window.addEventListener('eleckoi:dsh-app-failed', failed)
        const style = typeof assets.style === 'string' && !document.querySelector('link[data-eleckoi-styles]')
          ? document.createElement('link') : null
        if (style) {
          style.dataset.eleckoiStyles = ''
          style.rel = 'stylesheet'
          style.href = assets.style
          document.head.append(style)
        }
        ready()
        if (!globalThis.__ELECKOI_DSH_APP__ && !document.querySelector('script[data-eleckoi-script]')) {
          const script = document.createElement('script')
          script.dataset.eleckoiScript = ''
          script.type = 'module'
          script.src = assets.script
          script.onerror = () => setLoadError('ElecKoi 客户端脚本加载失败。')
          document.head.append(script)
        }
        return () => {
          window.removeEventListener('eleckoi:dsh-app-ready', ready)
          window.removeEventListener('eleckoi:dsh-app-failed', failed)
        }
      }, [])

      return React.createElement(React.Fragment, null,
        React.createElement('div', {
          id: 'eleckoi-root',
          style: { position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'auto' }
        }, ProductApp ? React.createElement(ProductApp, {
          markdownComponent: MarkdownText,
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
            selectedPanelId: panelInfo.windowPanelId ?? panelInfo.activePanelId ?? 'messages',
            selectPanel: id => layout.selectPanel(id),
            renderPanel: id => renderSlot('main', {}, { entryKey: id }),
            renderSidebar: (renderContent, owner = {}) => renderSlot('sidebar', { ...owner, renderContent }),
            sidebar: layout.sidebarInfo,
            toggleSidebar: () => layout.toggleSidebar(),
            closeSidebar: () => layout.closeSidebar(),
            setPanelGuard: guard => layout.setPanelGuard(guard)
          },
          renderWindow: (owner, fallback) => renderSlotChain('eleckoi.shell.window', { ...owner, fallback }, { fallback }),
          renderSettingsSection: (section, close) => renderSlot('settings.section', { close }, { only: section.id }),
          renderUserProfileEditor: (owner, fallback) => renderSlotChain('eleckoi.persona.editor', { ...owner, fallback }, { fallback }),
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
              'aria-label': '角色聊天插件未启用'
            }, React.createElement('div', { className: 'chat-empty-guide' },
              React.createElement('strong', null, '角色聊天插件未启用')))
          })
        }) : loadError),
        React.createElement('div', {
          className: 'eleckoi-plugin-overlay-seat',
          'data-shell-overlay': true,
          style: { position: 'fixed', inset: 0, zIndex: 20, pointerEvents: 'none' }
        }, renderSlot('shell.overlay', {}))
      )
    }

    function apply(ctx) {
      const subscribeSlots = listener => ctx.on('slots/changed', listener)
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
      {
        let panelSnapshot = { activePanelId: null }
        let rightbarSnapshot = {
          shown: false,
          track: false,
          fullscreen: false,
          instant: false,
          width: null,
          viewportWidth: typeof window.innerWidth === 'number' ? window.innerWidth : 960
        }
        let navigation = new AbortController()
        const listeners = new Set()
        const rightbarListeners = new Set()
        const sidebarListeners = new Set()
        let sidebarSnapshot = { shown: false }
        let panelGuard = null
        const sidebarInfo = {
          getSnapshot: () => sidebarSnapshot,
          subscribe: listener => {
            sidebarListeners.add(listener)
            return () => sidebarListeners.delete(listener)
          }
        }
        const showSidebar = shown => {
          if (sidebarSnapshot.shown === shown) return
          sidebarSnapshot = { shown }
          for (const listener of sidebarListeners) listener()
        }
        const panelInfo = {
          getSnapshot: () => panelSnapshot,
          subscribe: listener => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          }
        }
        const rightbarInfo = {
          getSnapshot: () => rightbarSnapshot,
          subscribe: listener => {
            rightbarListeners.add(listener)
            return () => rightbarListeners.delete(listener)
          }
        }
        const publishRightbar = patch => {
          const next = { ...rightbarSnapshot, ...patch }
          if (Object.keys(next).every(key => Object.is(next[key], rightbarSnapshot[key]))) return
          rightbarSnapshot = next
          for (const listener of rightbarListeners) listener()
        }
        const layout = {
          panelInfo,
          rightbarInfo,
          sidebarInfo,
          closeSidebar: () => showSidebar(false),
          setPanelGuard: guard => {
            panelGuard = guard
            return () => { if (panelGuard === guard) panelGuard = null }
          },
          selectPanel: id => {
            if (id !== null && !ctx.slots.entriesOfSlot('main').some(entry => entry.options.key === id)) {
              throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `layout.selectPanel: main panel "${id}" is not registered`, { what: '主面板' })
            }
            const mobile = globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === 'android'
            const panelId = mobile && (id === null || id === 'conversation' || id === 'creatorStudio') ? null
              : id === null ? 'conversation' : id === 'messages' ? null : id
            const windowPanelId = mobile ? id ?? 'conversation' : undefined
            if (panelSnapshot.activePanelId === panelId && panelSnapshot.windowPanelId === windowPanelId) { showSidebar(false); return }
            const commit = () => {
              navigation.abort()
              navigation = new AbortController()
              panelSnapshot = { activePanelId: panelId, ...(mobile ? { windowPanelId } : {}) }
              showSidebar(false)
              for (const listener of listeners) listener()
            }
            if (panelGuard) panelGuard(commit)
            else commit()
          },
          beginNavigation: () => {
            navigation.abort()
            navigation = new AbortController()
            return navigation.signal
          },
          toggleSidebar: () => showSidebar(!sidebarSnapshot.shown),
          setViewportWidth: width => {
            if (!Number.isFinite(width) || width <= 0 || rightbarSnapshot.viewportWidth === width) return
            publishRightbar({ viewportWidth: width, instant: false })
          },
          setRightbar: width => {
            if (!Number.isFinite(width)) return
            const maximum = Math.max(300, rightbarSnapshot.viewportWidth * 0.7)
            publishRightbar({ width: Math.min(maximum, Math.max(300, Math.round(width))), instant: false })
          },
          openRightbar: (track, fullscreen) => {
            publishRightbar({
              shown: true,
              track: Boolean(track),
              fullscreen: Boolean(fullscreen),
              instant: rightbarSnapshot.fullscreen && !fullscreen,
              width: rightbarSnapshot.width ?? Math.max(300, Math.round(rightbarSnapshot.viewportWidth * 0.45))
            })
          },
          closeRightbar: () => {
            publishRightbar({
              shown: false,
              track: false,
              fullscreen: false,
              instant: rightbarSnapshot.shown && rightbarSnapshot.fullscreen
            })
          }
        }
        const stopPanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo } })
        const stopLayout = ctx.reflect.provide('layout', layout)
        const stopRoot = ctx.slots.register({
          name: 'root',
          priority: -1,
          children: {
            sidebar: { kind: 'single', scope: 'root' },
            main: { kind: 'keyed', scope: 'root' },
            rightbar: { kind: 'single', scope: 'root' },
            'shell.overlay': { kind: 'list', scope: 'root' },
            'shell.leading': { kind: 'single', scope: 'root' },
            'settings.section': { kind: 'list', scope: 'root' },
            'settings.general.item': { kind: 'list', scope: 'root' },
            'eleckoi.shell.window': { kind: 'chain', scope: 'root' },
            'eleckoi.persona.editor': { kind: 'chain', scope: 'root' },
            'eleckoi.character.page.list': { kind: 'chain', scope: 'root' },
            'eleckoi.character.page.profile': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.card': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.openings': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.lore': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.variables': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.regex': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.scripts': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.frontend': { kind: 'chain', scope: 'root' },
            'eleckoi.character.editor.dynamic': { kind: 'chain', scope: 'root' },
            'eleckoi.character.manager': { kind: 'chain', scope: 'root' },
            'eleckoi.conversation.list': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.profile': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.introduction': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.prompts': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.tools': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.regex': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.editor.scripts': { kind: 'chain', scope: 'root' },
            'eleckoi.preset.manager': { kind: 'chain', scope: 'root' },
            'eleckoi.roleplay': { kind: 'chain', scope: 'root' },
            'eleckoi.creator-studio.conversation': { kind: 'single', scope: 'root' }
          },
          inject: () => ({ layout, slots: ctx.slots, subscribeSlots, frontendConnection, locale: ctx.locale,
            theme: ctx.theme, subscribeTheme: listener => ctx.on('theme/change', listener),
            conversations: ctx.get('eleckoiConversations'), characters: ctx.eleckoiCharacters,
            characterConfiguration: { openings: ctx.eleckoiCharacterOpenings, settingLibraries: ctx.eleckoiSettingLibraries, globalSettingLibraries: ctx.eleckoiGlobalSettingLibraries,
              variables: ctx.eleckoiVariables, regexRules: ctx.eleckoiRegexRules,
              scripts: ctx.eleckoiScriptLibraries, scriptRuntimeConnection },
            creatorStudio: ctx.eleckoiCreatorStudio,
            sidebarRight: ctx.get('sidebarRight'),
            models: ctx.eleckoiModels,
            persona: ctx.eleckoiPersona, presets: ctx.eleckoiPresets,
            webSearch: ctx.eleckoiWebSearch,
            displayPreferences: ctx.eleckoiDisplayPreferences })
        }, ElecKoiRoot)
        const disposeRoot = () => {
          navigation.abort()
          stopRoot()
          stopPanelInfo()
          void stopLayout()
        }
        ctx.effect(() => disposeRoot, 'eleckoi client root and layout')
      }

      ctx.slots.inject('sidebar', () => ctx.slots.register({
        name: 'sidebar',
        priority: 100,
        registrant: '@eleckoi/dsh-client-shell',
        children: {
          'sidebar.brand.mark': { kind: 'single', scope: 'root' },
          'sidebar.brand.name': { kind: 'single', scope: 'root' },
          'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
          'sidebar.panellist': { kind: 'list', scope: 'root' },
          'sidebar.panellist.actions': { kind: 'list', scope: 'root' },
          'sidebar.workspaces': { kind: 'single', scope: 'root' },
          'sidebar.settings': { kind: 'single', scope: 'root' },
          'sidebar.footer.action': { kind: 'list', scope: 'root' }
        }
      }, ElecKoiSidebar))
      for (const name of ['sidebar.brand.mark', 'sidebar.brand.name', 'sidebar.workspaces', 'sidebar.settings']) {
        ctx.slots.inject(name, () => ctx.slots.register({ name, priority: -100, registrant: '@eleckoi/dsh-client-shell' },
          ({ content }) => content))
      }

      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'settings', registrant: '@eleckoi/dsh-client-shell' },
        () => React.createElement(SettingsPage)))
      ctx.slots.inject('plugins.bundle.config', () => builtInBundles.filter(name => name !== '@eleckoi/dsh-auto-illustration').map(packageName => ctx.slots.register({
        name: 'plugins.bundle.config', key: packageName, registrant: '@eleckoi/dsh-client-shell'
      }, () => {
        const entry = ctx.slots.entriesOfSlot('main').find(candidate => candidate.options.key === 'plugins')
        const face = entry?.inject?.()
        return face ? React.createElement(BuiltInPluginContents, { key: packageName, packageName, face })
          : React.createElement('p', { role: 'status' }, '插件管理器尚未就绪。')
      })))
      ctx.slots.inject('sidebar.panellist', () => [
        ctx.slots.register({
          name: 'sidebar.panellist', id: 'creatorStudio', order: 10,
          label: 'AI创作工作室', registrant: '@eleckoi/dsh-client-shell'
        }, () => React.createElement(CreatorStudioNavigationIcon)),
        ctx.slots.register({
          name: 'sidebar.panellist', id: 'community', order: 20,
          label: '社区', registrant: '@eleckoi/dsh-client-shell'
        }, () => React.createElement(CommunityNavigationIcon))
      ])

      ctx.effect(() => {
        const fontSizeVariables = {
          text: '--dsh-content-font-size',
          code: '--dsh-code-font-size',
          terminal: '--dsh-terminal-font-size'
        }
        const fontFamilyVariables = {
          text: '--dsh-font-family-text',
          code: '--dsh-font-family-code',
          terminal: '--dsh-font-family-terminal'
        }
        let appliedTokens = []
        const themeColorMeta = document.createElement('meta')
        themeColorMeta.name = 'theme-color'
        const present = snapshot => {
          const scheme = snapshot.active.colorScheme
          document.documentElement.style.colorScheme = scheme
          document.documentElement.dataset.dsThemeSource = snapshot.preference === 'system' ? 'system' : scheme
          document.body.toggleAttribute('data-ds-dark-theme', scheme === 'dark')
          for (const [role, name] of Object.entries(fontSizeVariables)) {
            document.body.style.setProperty(name, `${snapshot.fontSizes[role]}px`)
          }
          for (const [role, name] of Object.entries(fontFamilyVariables)) {
            const list = snapshot.fontFamilies[role]
            if (list === '') document.body.style.removeProperty(name)
            else document.body.style.setProperty(name, list)
          }
          for (const name of appliedTokens) document.body.style.removeProperty(name)
          appliedTokens = Object.keys(snapshot.active.tokens)
          for (const name of appliedTokens) document.body.style.setProperty(name, snapshot.active.tokens[name])
          themeColorMeta.content = getComputedStyle(document.body).backgroundColor
          if (!themeColorMeta.isConnected) document.head.append(themeColorMeta)
        }
        present(ctx.theme.getTheme())
        const stop = ctx.on('theme/change', present)
        return () => {
          stop()
          document.documentElement.style.removeProperty('color-scheme')
          delete document.documentElement.dataset.dsThemeSource
          document.body.removeAttribute('data-ds-dark-theme')
          for (const name of Object.values(fontSizeVariables)) document.body.style.removeProperty(name)
          for (const name of Object.values(fontFamilyVariables)) document.body.style.removeProperty(name)
          for (const name of appliedTokens) document.body.style.removeProperty(name)
          themeColorMeta.remove()
        }
      }, 'eleckoi client theme presentation')
    }

    return {
      inject: ['slots', 'locale', 'theme', 'eleckoiCharacters', 'eleckoiCharacterOpenings', 'eleckoiSettingLibraries', 'eleckoiGlobalSettingLibraries', 'eleckoiVariables', 'eleckoiRegexRules', 'eleckoiScriptLibraries', 'eleckoiCreatorStudio', 'eleckoiDisplayPreferences', 'eleckoiModels', 'eleckoiPersona', 'eleckoiPresets', 'eleckoiWebSearch'],
      apply
    }
  }
})

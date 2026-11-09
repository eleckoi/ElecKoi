window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-creator-studio',
  factory(require) {
    const React = require('react')
    // 边界⑥ 的信封拆解只有一份实现（@eleckoi/dsh-product-api 的 client 面）。
    const { unwrapOrFail, failureAlreadyPublished, productFailure, ELECKOI_FAILURE_CODES } = require('@eleckoi/dsh-product-api')
    const retainedStatsKeys = ['sessionStats', 'tokenUsage', 'contextPressure', 'contextBreakdown']
    /** Own one independent official Client Session reference for the Studio surface. */
    class CreatorStudioSessions {
      constructor(remote, sessions, workspaces, getConversation) {
        this.remote = remote
        this.sessions = sessions
        this.workspaces = workspaces
        this.getConversation = getConversation
        this.snapshot = { status: 'idle', active: null, reference: null, items: [], error: '', editingSessionId: '', retainedStats: null }
        this.listeners = new Set()
        this.generation = 0
        this.reference = null
        this.disposed = false
        this.draftReferences = new Map()
        this.messageMutation = false
        this.stopStatsRetention = null
      }
      getSnapshot = () => this.snapshot
      subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
      publish(patch) { if (!this.disposed) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener() } }
      retainRegenerationStats(sessionId) {
        this.stopStatsRetention?.()
        const session = this.reference.binding.session
        const faces = retainedStatsKeys.map(key => [key, session.projections.faceOf(key)])
        const retained = { sessionId, values: Object.fromEntries(faces.map(([key, face]) => [key, face.getSnapshot()])) }
        let armed = false, baselineSteps = 0, stopped = false, settling = false
        const stops = []
        const release = () => {
          if (stopped) return
          stopped = true
          for (const stop of stops) stop()
          if (this.stopStatsRetention === release) this.stopStatsRetention = null
          if (this.snapshot.retainedStats === retained) this.publish({ retainedStats: null })
        }
        const settle = async () => {
          settling = true
          try {
            // Running status and projections use independent official streams.
            // A stopped status alone cannot prove the new totals have arrived.
            const result = await this.remote.session.projections({ sessionId })
            if (stopped) return
            const value = unwrapOrFail(result, '创作工作室操作失败。')
            if (value?.kind !== 'sequenced') throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '工作室会话缺少当前统计投影。', { what: '当前工作室会话统计投影' })
            if ((value.values.sessionStats?.steps ?? 0) <= baselineSteps) release()
            else check()
          } catch (error) {
            if (stopped) return
            release()
            this.publish({ error })
          }
        }
        const check = () => {
          if (!armed || stopped) return
          if ((faces[0][1].getSnapshot()?.steps ?? 0) > baselineSteps) release()
          else if (!session.getSnapshot().running && !settling) void settle()
        }
        stops.push(session.subscribe(check), faces[0][1].subscribe(check))
        this.stopStatsRetention = release
        this.publish({ retainedStats: retained })
        return { release, arm: () => {
          baselineSteps = faces[0][1].getSnapshot()?.steps ?? 0
          armed = true
          check()
        } }
      }
      async call(method, ...args) {
        const result = await this.remote.eleckoiCreatorStudioSessions[method](...args)
        return unwrapOrFail(result, 'AI 创作工作室操作失败。')
      }
      async refresh() {
        const generation = this.generation, sessionId = this.snapshot.active?.sessionId
        const items = await this.call('list')
        if (generation !== this.generation) return items
        const current = this.snapshot.active?.sessionId === sessionId
          ? items.find(item => item.sessionId === sessionId) : undefined
        this.publish({ items, ...(current ? { active: { sessionId: current.sessionId, presetId: current.presetId, characterId: current.characterId } } : {}) })
        const known = new Set(items.map(item => item.sessionId))
        for (const [id, reference] of this.draftReferences) if (!known.has(id)) { this.draftReferences.delete(id); reference.release() }
        return items
      }
      async acquire(create, value, workspaceId) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'AI 创作工作室服务已关闭。', { what: 'AI 创作工作室服务' })
        const generation = ++this.generation
        this.publish({ status: 'loading', error: '' })
        let reference
        try {
          const active = create ? await this.call('create', value, workspaceId) : await this.call('open', value)
          await this.sessions.refresh()
          // The catalog retains data; StudioConversation owns the visible mainView.
          reference = this.sessions.retain(active.sessionId, { source: 'eleckoiCreatorStudio' })
          await reference.ready
          if (this.disposed || generation !== this.generation) { reference.release(); return }
          this.stopStatsRetention?.()
          const previous = this.reference
          const previousId = this.snapshot.active?.sessionId
          this.reference = reference
          this.publish({ status: 'ready', active, reference, error: '' })
          const cached = this.draftReferences.get(active.sessionId)
          this.draftReferences.delete(active.sessionId)
          cached?.release()
          if (previous !== cached && this.draftReferences.get(previousId) !== previous) previous?.release()
          await this.refresh()
          return active
        } catch (error) {
          if (reference !== this.reference) reference?.release()
          if (generation === this.generation) this.publish({ status: 'error', error: String(error?.message || error) })
          throw error
        }
      }
      async create(characterId = '', workspaceId) {
        if (this.workspaces && this.workspaces.list.getSnapshot().items.length === 0 && this.sessions.list.getSnapshot().ids.length === 0) {
          const workspace = await this.workspaces.initializeDefault(new AbortController().signal)
          workspaceId ??= workspace?.workspaceId
        }
        const registry = this.workspaces?.list.getSnapshot()
        const inherited = registry?.items.find(item => item.sessionIds.includes(this.snapshot.active?.sessionId))?.workspaceId
        let recent, latest = -Infinity
        for (const item of registry?.items ?? []) {
          let time = -Infinity
          for (const id of item.sessionIds) { const row = this.sessions.list.getSnapshot().byId[id]; if (row) time = Math.max(time, row.updatedAt) }
          if (time === -Infinity) time = Date.parse(item.createdAt)
          if (recent === undefined || time > latest) { recent = item.workspaceId; latest = time }
        }
        const target = workspaceId ?? inherited ?? recent
        const catalog = this.sessions.list.getSnapshot()
        const canReuse = item => item.characterId === characterId && catalog.byId[item.sessionId]?.blank
          && !registry?.archivedSessionIds?.includes(item.sessionId)
          && registry?.items.find(workspace => workspace.sessionIds.includes(item.sessionId))?.workspaceId === target
        const reusable = this.snapshot.items.find(item => item.sessionId === this.snapshot.active?.sessionId && canReuse(item))
          ?? this.snapshot.items.find(canReuse)
        if (reusable) return reusable.sessionId === this.snapshot.active?.sessionId ? this.snapshot.active : this.open(reusable.sessionId)
        return this.acquire(true, characterId, target)
      }
      async startWorkspace(workspaceId, options = {}) {
        const current = this.snapshot.active
        const blank = this.sessions.list.getSnapshot().byId[current?.sessionId]?.blank
        const currentWorkspace = this.workspaces?.list.getSnapshot().items.find(item => item.sessionIds.includes(current?.sessionId))?.workspaceId
        if (!current || !blank || workspaceId !== undefined && workspaceId !== currentWorkspace) {
          if (current && blank && this.reference) {
            const scope = this.sessions.scope(current.sessionId)
            const draft = this.getConversation().input.for(scope).state.getSnapshot()
            // Retain the original input owner; semantic references and files stay in their existing store.
            if (draft.draft !== '' || draft.attachmentIds.length) this.draftReferences.set(current.sessionId, this.reference)
          }
          await this.create('', workspaceId)
        }
        if (options.prompt !== undefined) {
          const binding = this.sessions.binding(this.snapshot.active.sessionId)
          if (!binding || this.getConversation().input.requestDraftInitialization(binding, options) === 'blocked') {
            throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '无法准备插件创作草稿。', { what: '准备插件创作草稿' })
          }
        }
      }
      open(sessionId) { return this.acquire(false, sessionId) }
      async restoreRecent() {
        const generation = this.generation
        const items = await this.refresh()
        if (this.disposed || generation !== this.generation) return
        if (this.snapshot.active) return this.snapshot.active
        // The Host list is ordered by activity, independently of sidebar pins.
        return items.length ? this.open(items[0].sessionId) : this.create()
      }
      async rename(sessionId, title) { await this.call('rename', sessionId, title); await this.refresh() }
      async pin(sessionId, pinned) { await this.call('pin', sessionId, pinned); await this.refresh() }
      async delete(sessionId) {
        await this.call('delete', sessionId)
        const deleted = new Set([sessionId])
        const rows = Object.values(this.sessions.list.getSnapshot().byId)
        for (let changed = true; changed;) {
          changed = false
          for (const row of rows) if (deleted.has(row.parentId) && !deleted.has(row.id)) { deleted.add(row.id); changed = true }
        }
        for (const id of deleted) { this.draftReferences.get(id)?.release(); this.draftReferences.delete(id) }
        if (deleted.has(this.snapshot.active?.sessionId)) this.release()
        await this.sessions.refresh()
        await this.refresh()
      }
      async search(query, signal) {
        const result = await this.sessions.search(query, signal)
        unwrapOrFail(result, '创作工作室操作失败。')
        return result.value
      }
      async readDefaultModel() {
        const result = await this.remote.eleckoiConversationModels.current('')
        unwrapOrFail(result, '创作工作室操作失败。')
        return result.value
      }
      async selectModel(selection) {
        if (!this.snapshot.active) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '工作室对话尚未打开。', { what: '打开工作室对话' })
        const result = await this.remote.session.selectModel({ sessionId: this.snapshot.active.sessionId, ...selection })
        unwrapOrFail(result, '创作工作室操作失败。')
        return result.value.selected
      }
      messages() { if (!this.snapshot.active) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '工作室对话尚未打开。', { what: '打开工作室对话' }); return this.call('messages', this.snapshot.active.sessionId) }
      async mutateMessages(method, ...args) {
        const active = this.snapshot.active
        if (!active) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '工作室对话尚未打开。', { what: '打开工作室对话' })
        if (this.messageMutation) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请等待当前消息操作完成。', { what: '等待当前消息操作完成' })
        const stats = method === 'regenerate' ? this.retainRegenerationStats(active.sessionId) : null
        let retaining = false
        this.messageMutation = true
        this.publish({ editingSessionId: active.sessionId, error: '' })
        const generation = this.generation
        try {
          let failure
          try { await this.call(method, active.sessionId, ...args) } catch (error) { failure = error }
          if (this.disposed || generation !== this.generation) { if (failure) throw failure; return }
          // Other official views also retain this generation. Releasing our
          // reference cannot reset their journal cursor or removed flag, and
          // would unmount the resident input. Reload the shared history in place.
          try { await this.sessions.reloadHistory(active.sessionId); await this.refresh() }
          catch (error) { if (failure) throw new AggregateError([failure, error], `${failure.message}；恢复对话失败：${error.message}`); throw error }
          if (failure) throw failure
          stats?.arm()
          retaining = true
        } finally {
          if (!retaining) stats?.release()
          this.messageMutation = false
          if (this.snapshot.editingSessionId === active.sessionId) this.publish({ editingSessionId: '' })
        }
      }
      regenerate() { return this.mutateMessages('regenerate') }
      deleteMessagesFrom(eventSeq, role) { return this.mutateMessages('deleteMessagesFrom', eventSeq, role) }
      async selectCharacter(characterId) {
        const active = this.snapshot.active
        if (!active) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '工作室会话尚未打开。', { what: '打开工作室对话' })
        const selected = await this.call('selectCharacter', active.sessionId, characterId)
        if (this.snapshot.active?.sessionId === selected.sessionId) this.publish({ active: selected })
        return selected
      }
      release() {
        this.stopStatsRetention?.()
        ++this.generation
        const previous = this.reference
        if (this.draftReferences.get(this.snapshot.active?.sessionId) === previous) this.draftReferences.delete(this.snapshot.active.sessionId)
        this.reference = null
        this.publish({ reference: null, active: null, status: 'idle', error: '', editingSessionId: '' })
        previous?.release()
      }
      dispose() { this.release(); for (const reference of this.draftReferences.values()) reference.release(); this.draftReferences.clear(); this.disposed = true; this.listeners.clear() }
    }

    class CreatorStudioProjects {
      constructor(remote) {
        this.remote = remote
        this.snapshot = { status: 'loading', collection: { items: [] }, error: '' }
        this.listeners = new Set()
        this.generation = 0
        this.disposed = false
        this.directoryRequests = new Set()
        this.changeAbort = null
      }

      getSnapshot = () => this.snapshot

      subscribe = listener => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      }

      publish(next) {
        this.snapshot = next
        for (const listener of this.listeners) listener()
      }

      assertCollection(value) {
        if (!value || !Array.isArray(value.items) || value.items.some(item => !item
          || typeof item.id !== 'string' || typeof item.name !== 'string'
          || typeof item.rootPath !== 'string' || typeof item.mode !== 'string')) {
          throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '创作项目返回的数据格式不正确。', { what: '创作项目列表' })
        }
        return value
      }

      adopt(collection) {
        if (this.disposed) return
        this.generation += 1
        this.publish({ status: 'ready', collection: this.assertCollection(collection), error: '' })
      }

      start() {
        void this.refresh().catch(failureAlreadyPublished)
        this.changeAbort = new AbortController()
        void this.consumeChanges(this.changeAbort.signal)
      }

      async consumeChanges(signal) {
        try {
          const stream = this.remote.eleckoiCreatorStudio.changes.$stream
            ? await this.remote.eleckoiCreatorStudio.changes.$stream(signal)
            : this.remote.eleckoiCreatorStudio.changes(signal)
          for await (const change of stream) {
            if (signal.aborted || this.disposed) break
            if (change?.kind === 'snapshot' || change?.domain === 'creatorProjects') {
              await this.refresh().catch(failureAlreadyPublished)
            }
          }
        } catch (error) {
          if (!signal.aborted && !this.disposed) console.error('创作项目变更流已中断。', error)
        }
      }

      async refresh() {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '创作项目服务已关闭。', { what: '创作项目服务' })
        const generation = ++this.generation
        try {
          const result = await this.remote.eleckoiCreatorStudio.list()
          unwrapOrFail(result, '读取创作项目失败。')
          const collection = this.assertCollection(result.value)
          if (!this.disposed && generation === this.generation) {
            this.publish({ status: 'ready', collection, error: '' })
          }
          return collection
        } catch (error) {
          if (!this.disposed && generation === this.generation) {
            this.publish({
              status: 'error', collection: this.snapshot.collection,
              error: typeof error?.message === 'string' && error.message.trim() ? error.message : String(error)
            })
          }
          throw error
        }
      }

      async create(input) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '创作项目服务已关闭。', { what: '创作项目服务' })
        const result = await this.remote.eleckoiCreatorStudio.create(input)
        unwrapOrFail(result, '项目创建失败。')
        const collection = this.assertCollection(result.value)
        this.adopt(collection)
        return collection
      }

      async delete(projectId) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '创作项目服务已关闭。', { what: '创作项目服务' })
        const result = await this.remote.eleckoiCreatorStudio.delete(projectId)
        unwrapOrFail(result, '无法删除项目。')
        const collection = this.assertCollection(result.value)
        this.adopt(collection)
        return collection
      }

      async selectDirectory(signal) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '创作项目服务已关闭。', { what: '创作项目服务' })
        const request = new AbortController()
        this.directoryRequests.add(request)
        try {
          const lifetime = signal ? AbortSignal.any([signal, request.signal]) : request.signal
          lifetime.throwIfAborted()
          const result = await this.remote.directoryPicker.pick(lifetime)
          lifetime.throwIfAborted()
          unwrapOrFail(result, '无法选择保存位置。')
          return result.value
        } finally {
          this.directoryRequests.delete(request)
        }
      }

      dispose() {
        if (this.disposed) return
        this.disposed = true
        this.generation += 1
        this.changeAbort?.abort()
        this.changeAbort = null
        for (const request of this.directoryRequests) request.abort()
        this.directoryRequests.clear()
        this.listeners.clear()
      }
    }

    function apply(ctx) {
      const projects = new CreatorStudioProjects(ctx.remote)
      const conversations = new CreatorStudioSessions(ctx.remote, ctx.sessions, ctx.workspaces, () => ctx.get('conversation'))
      projects.sessions = conversations
      ctx.provide('eleckoiCreatorStudio', projects)
      const { MenuItemButton, IconTrashOutlineRegular, Modal, Button } = require('@deepseek-ai/dsh-client-ui-primitives')
      let deleteRequest = null
      const deleteListeners = new Set()
      const requestDelete = request => { deleteRequest = request; for (const listener of deleteListeners) listener() }
      ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
        name: 'sidebar.workspaces.session.menu.item', id: 'eleckoi-creator-studio.delete', order: 425,
      }, ({ sessionId, displayTitle, useMenuOpenState }) => {
        const [, setMenuOpen] = useMenuOpenState()
        return React.createElement(MenuItemButton, { icon: React.createElement(IconTrashOutlineRegular, { size: 14 }), danger: true,
          onSelect: () => { setMenuOpen(false); requestDelete({ sessionId, displayTitle }) } }, '删除会话')
      }))
      function DeleteSessionForm({ request }) {
        const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('')
        const close = () => { if (!busy) requestDelete(null) }
        const confirm = async () => {
          if (busy) return
          setBusy(true); setError('')
          try {
            const wasActive = conversations.getSnapshot().active?.sessionId === request.sessionId
            await conversations.delete(request.sessionId)
            requestDelete(null)
            if (wasActive && !conversations.getSnapshot().active) void conversations.restoreRecent().catch(failureAlreadyPublished)
          } catch (reason) { setError(reason?.message || String(reason)); setBusy(false) }
        }
        return React.createElement(Modal, { open: true, title: () => ctx.locale.bind('eleckoi.ui')("删除会话"), closeLabel: '关闭', onClose: close,
          description: `确定删除“${request.displayTitle || '新会话'}”及其关联子会话吗？聊天记录和会话附件将被永久删除，工作区中的项目文件保留。`,
          footer: React.createElement(React.Fragment, null,
            React.createElement(Button, { variant: 'outline', disabled: busy, onClick: close }, '取消'),
            React.createElement(Button, { variant: 'outline', style: { color: 'var(--dsw-alias-text-error, var(--danger, #d14c4c))' }, disabled: busy, onClick: confirm }, busy ? '正在删除…' : '删除会话')) },
          error ? React.createElement('div', { role: 'alert', className: 'creator-simple-error' }, error) : null)
      }
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'eleckoi-creator-studio.delete' }, () => {
        const request = React.useSyncExternalStore(listener => { deleteListeners.add(listener); return () => deleteListeners.delete(listener) }, () => deleteRequest)
        return request ? React.createElement(DeleteSessionForm, { key: request.sessionId, request }) : null
      }))
      const loadPage = () => import(new URL('eleckoi-page-creator-studio.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
      const Page = React.lazy(() => loadPage().then(module => ({ default: module.CreatorStudioPage })))
      const CreatorToolCall = React.lazy(() => loadPage().then(module => ({ default: module.CreatorToolCall })))
      const creatorToolNames = new Set(['eleckoi_list_toolsets', 'eleckoi_describe_toolset', 'eleckoi_call_capability'])
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'creatorStudio', priority: 0,
        registrant: '@eleckoi/dsh-client-creator-studio' }, () => React.createElement(Page)))
      const studioSeat = name => name === 'conversation.input.model.label' ? 'eleckoi.creator-studio.model.label'
        : name.startsWith('eleckoi.creator-studio.') ? name : `eleckoi.creator-studio.${name.replace(/^conversation\./, '')}`
      function useDisplayStats(owner) {
        const { retainedStats } = React.useSyncExternalStore(conversations.subscribe, conversations.getSnapshot)
        const stats = retainedStats?.sessionId === owner.sessionId ? retainedStats.values : null
        return (key, selector, equal) => {
          const value = owner.useProjection(key, selector, equal)
          const selected = React.useRef({ value, key })
          const next = stats && retainedStatsKeys.includes(key)
            ? typeof selector === 'function' ? selector(stats[key]) : stats[key] : value
          if (selected.current.key !== key || !(equal || Object.is)(selected.current.value, next)) selected.current = { value: next, key }
          return selected.current.value
        }
      }
      const projected = new Set()
      function projectSeat(source, target, entryId, override) {
        if (projected.has(target)) return
        projected.add(target)
        ctx.slots.inject(target, () => {
          const entries = new Map()
          const sync = () => {
            const current = ctx.slots.entriesOfSlot(source).filter(entry => !entryId || entry.options.id === entryId)
            for (const [entry, dispose] of entries) if (!current.includes(entry)) { dispose(); entries.delete(entry) }
            for (const entry of current) {
              if (entries.has(entry)) continue
              const { name: sourceName, id, key, ...attributes } = entry.options
              const kind = ctx.slots.spec(target).kind
              const options = { ...attributes, name: target,
                ...(kind === 'list' ? { id } : kind === 'keyed' ? { key } : {}),
                ...(entry.inject ? { inject: entry.inject } : {}), ...(entry.store ? { store: entry.store } : {}),
                ...(entry.locale ? { locale: entry.locale } : {}), ...(entry.select ? { select: entry.select } : {}) }
              if (entry.children) {
                options.children = Object.fromEntries(Object.entries(entry.children).map(([name, spec]) => [studioSeat(name), spec]))
                for (const name of Object.keys(entry.children)) projectSeat(name, studioSeat(name))
              }
              if (override?.children) options.children = { ...options.children, ...override.children }
              entries.set(entry, ctx.slots.register(options, ({ renderBridgeSlot, ...props }) => {
                const useProjection = source === 'conversation.composer.bar' || source === 'conversation.composer.dock'
                  ? useDisplayStats(props) : props.useProjection
                return React.createElement(override?.component || entry.component, {
                  ...props, useProjection, renderSlot: (name, owner, renderOptions) => {
                    const renderNative = () => (renderBridgeSlot || props.renderSlot)(studioSeat(name), owner, renderOptions)
                    if (name === 'tool.call.toolview' && creatorToolNames.has(owner.toolName)) {
                      return React.createElement(React.Suspense, { fallback: renderNative() }, React.createElement(CreatorToolCall, { ...owner, renderNative }))
                    }
                    return renderNative()
                  },
                  ...(props.renderSlotChain ? { renderSlotChain: (name, owner, renderOptions) => props.renderSlotChain(studioSeat(name), owner, renderOptions) } : {}),
                })
              }))
            }
          }
          const unsubscribe = ctx.slots.subscribe(source, sync)
          sync()
          return () => { unsubscribe(); for (const dispose of entries.values()) dispose() }
        })
      }
      const composerSeats = {
        'conversation.composer': { kind: 'chain', scope: 'session' },
        'conversation.composer.bar': { kind: 'single', scope: 'session-maybe' },
        'conversation.input.dock': { kind: 'list', scope: 'session' },
        'conversation.hero.workspace': { kind: 'single', scope: 'root' },
      }
      function StudioConversation({ reference, component, props, SessionProvider, renderSlot }) {
        React.useLayoutEffect(() => {
          ctx.get('uiWorkspace').openSession(reference.sessionId)
        }, [reference])
        return React.createElement(SessionProvider, { session: reference, empty: () => null }, renderSlot('eleckoi.creator-studio.session', { component, props }))
      }
      ctx.slots.inject('eleckoi.creator-studio.conversation', () => ctx.slots.register({
        name: 'eleckoi.creator-studio.conversation', registrant: '@eleckoi/dsh-client-creator-studio',
        children: { 'eleckoi.creator-studio.session': { kind: 'single', scope: 'session' } }
      }, StudioConversation))
      projectSeat('conversation.session', 'eleckoi.creator-studio.session', undefined, { children: {
        ...Object.fromEntries(Object.entries(composerSeats).map(([name, spec]) => [studioSeat(name), spec])),
        'eleckoi.creator-studio.session.header': { kind: 'single', scope: 'session' },
      }, component: ({ component, props, ...native }) => native.renderSlot('eleckoi.creator-studio.session.header', { component, props, native }) })
      projectSeat('conversation.session.header', 'eleckoi.creator-studio.session.header', undefined, {
          component: ({ component, props, native, selectView, renderSlot, useEntryPins, useEntryActions, setPinned }) => React.createElement(component, {
            ...props, ...native, selectView, useEntryPins, useEntryActions, setPinned, renderHeaderSlot: renderSlot,
        }),
      })
      for (const name of Object.keys(composerSeats)) projectSeat(name, studioSeat(name))
      ctx.effect(() => {
        projects.start()
        const stopReset = ctx.on('connection/reset', () => { void projects.refresh().catch(failureAlreadyPublished) })
        return () => {
          stopReset()
          projects.dispose()
          conversations.dispose()
        }
      }, 'eleckoi: creator studio projects')
    }

    return { inject: ['locale', 'remote', 'remote.eleckoiCreatorStudio', 'remote.eleckoiCreatorStudioSessions', 'remote.eleckoiConversationModels', 'remote.session', 'remote.directoryPicker', 'sessions', 'workspaces', 'slots', 'uiSession'], apply }
  }
})

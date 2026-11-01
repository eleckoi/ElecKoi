window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-creator-studio',
  factory(require) {
    const React = require('react')
    // 边界⑥ 的信封拆解只有一份实现（@eleckoi/dsh-product-api 的 client 面）。
    const { unwrapOrFail, failureAlreadyPublished, productFailure, ELECKOI_FAILURE_CODES } = require('@eleckoi/dsh-product-api')
    /** Own one independent official Client Session reference for the Studio surface. */
    class CreatorStudioSessions {
      constructor(remote, sessions) {
        this.remote = remote
        this.sessions = sessions
        this.snapshot = { status: 'idle', active: null, reference: null, items: [], error: '', editingSessionId: '' }
        this.listeners = new Set()
        this.generation = 0
        this.reference = null
        this.disposed = false
        this.messageMutation = false
      }
      getSnapshot = () => this.snapshot
      subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
      publish(patch) { if (!this.disposed) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener() } }
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
        return items
      }
      async acquire(create, value) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'AI 创作工作室服务已关闭。', { what: 'AI 创作工作室服务' })
        const generation = ++this.generation
        this.publish({ status: 'loading', error: '' })
        let reference
        try {
          const active = await this.call(create ? 'create' : 'open', value)
          await this.sessions.refresh()
          // The catalog retains data; StudioConversation owns the visible mainView.
          reference = this.sessions.retain(active.sessionId, { source: 'eleckoiCreatorStudio' })
          await reference.ready
          if (this.disposed || generation !== this.generation) { reference.release(); return }
          const previous = this.reference
          this.reference = reference
          this.publish({ status: 'ready', active, reference, error: '' })
          previous?.release()
          await this.refresh()
          return active
        } catch (error) {
          if (reference !== this.reference) reference?.release()
          if (generation === this.generation) this.publish({ status: 'error', error: String(error?.message || error) })
          throw error
        }
      }
      create(characterId = '') { return this.acquire(true, characterId) }
      open(sessionId) { return this.acquire(false, sessionId) }
      async restoreRecent() {
        const items = await this.refresh()
        if (this.snapshot.active) return this.snapshot.active
        // The Host list is ordered by activity, independently of sidebar pins.
        return items.length ? this.open(items[0].sessionId) : this.create()
      }
      async rename(sessionId, title) { await this.call('rename', sessionId, title); await this.refresh() }
      async pin(sessionId, pinned) { await this.call('pin', sessionId, pinned); await this.refresh() }
      async delete(sessionId) {
        await this.call('delete', sessionId)
        if (this.snapshot.active?.sessionId === sessionId) this.release()
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
        this.messageMutation = true
        this.publish({ editingSessionId: active.sessionId })
        const generation = this.generation
        try {
          let failure
          try { await this.call(method, active.sessionId, ...args) } catch (error) { failure = error }
          if (this.disposed || generation !== this.generation) { if (failure) throw failure; return }
          this.release()
          try { await this.open(active.sessionId) }
          catch (error) { if (failure) throw new AggregateError([failure, error], `${failure.message}；恢复对话失败：${error.message}`); throw error }
          if (failure) throw failure
        } finally {
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
        ++this.generation
        const previous = this.reference
        this.reference = null
        this.publish({ reference: null, active: null, status: 'idle', error: '', editingSessionId: '' })
        previous?.release()
      }
      dispose() { this.release(); this.disposed = true; this.listeners.clear() }
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
      const conversations = new CreatorStudioSessions(ctx.remote, ctx.sessions)
      projects.sessions = conversations
      ctx.provide('eleckoiCreatorStudio', projects)
      const studioSeat = name => name.startsWith('eleckoi.creator-studio.') ? name : `eleckoi.creator-studio.${name.replace(/^conversation\./, '')}`
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
              entries.set(entry, ctx.slots.register(options, ({ renderBridgeSlot, ...props }) => React.createElement(override?.component || entry.component, {
                ...props, renderSlot: (name, owner, renderOptions) => (renderBridgeSlot || props.renderSlot)(studioSeat(name), owner, renderOptions),
                ...(props.renderSlotChain ? { renderSlotChain: (name, owner, renderOptions) => props.renderSlotChain(studioSeat(name), owner, renderOptions) } : {}),
              })))
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
      }
      function StudioConversation({ reference, component, props, SessionProvider, renderSlot }) {
        React.useLayoutEffect(() => {
          const visible = ctx.sessions.retain(reference.sessionId, { source: 'mainView' })
          return () => visible.release()
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
        'eleckoi.creator-studio.model.label': { kind: 'single', scope: 'session', inline: true },
      }, component: ({ component, props, ...native }) => native.renderSlot('eleckoi.creator-studio.session.header', { component, props, native }) })
      projectSeat('conversation.session.header', 'eleckoi.creator-studio.session.header', undefined, {
          component: ({ component, props, native, selectView, renderSlot, useEntryPins, useEntryActions, setPinned }) => React.createElement(component, {
            ...props, ...native, selectView, useEntryPins, useEntryActions, setPinned, renderHeaderSlot: renderSlot,
        }),
      })
      for (const name of Object.keys(composerSeats)) projectSeat(name, studioSeat(name))
      projectSeat('conversation.input.model.label', 'eleckoi.creator-studio.model.label')
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

    return { inject: ['remote', 'remote.eleckoiCreatorStudio', 'remote.eleckoiCreatorStudioSessions', 'remote.eleckoiConversationModels', 'remote.session', 'remote.directoryPicker', 'sessions', 'slots', 'uiSession'], apply }
  }
})

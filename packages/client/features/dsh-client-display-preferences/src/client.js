window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-display-preferences',
  factory(require) {
    // 边界⑥ 的信封拆解只有一份实现（@eleckoi/dsh-product-api 的 client 面）。
    const { unwrapOrFail, failureAlreadyPublished, rejectionIsAwaitedElsewhere, productFailure, ELECKOI_FAILURE_CODES } = require('@eleckoi/dsh-product-api')
    const SETTINGS_NAMESPACE = 'eleckoi-display-preferences'

    class DisplayPreferences {
      constructor(remote) {
        this.remote = remote
        this.snapshot = Object.freeze({
          status: 'loading', ui: Object.freeze({}), chatDisplay: Object.freeze({}),
          writable: false, revision: undefined, error: ''
        })
        this.listeners = new Set()
        this.generation = 0
        this.connectionState = { revision: undefined }
        this.disposed = false
        this.writeQueue = Promise.resolve()
      }

      getSnapshot = () => this.snapshot

      subscribe = listener => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      }

      publish(next) {
        this.snapshot = Object.freeze(next)
        for (const listener of this.listeners) listener()
      }

      unwrap(result, fallback) {
        return unwrapOrFail(result, fallback)
      }

      normalizedObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value)
          ? Object.freeze({ ...value })
          : Object.freeze({})
      }

      adopt(value, connectionState) {
        if (this.disposed || connectionState !== this.connectionState || value?.revision < connectionState.revision) {
          return this.snapshot
        }
        const next = {
          status: 'ready',
          ui: this.normalizedObject(value?.ui),
          chatDisplay: this.normalizedObject(value?.chatDisplay),
          writable: value?.writable === true,
          revision: value?.revision,
          error: ''
        }
        connectionState.revision = next.revision
        this.publish(next)
        return next
      }

      async refresh() {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '显示偏好服务已关闭。', { what: '显示偏好服务' })
        const generation = ++this.generation
        const connectionState = this.connectionState
        try {
          const snapshot = this.unwrap(
            await this.remote.eleckoiDisplayPreferences.read(),
            '读取显示偏好失败。'
          )
          if (this.disposed || generation !== this.generation) return this.snapshot
          return this.adopt(snapshot, connectionState)
        } catch (error) {
          if (!this.disposed && generation === this.generation) {
            this.publish({ ...this.snapshot, status: 'error', error: typeof error?.message === 'string' && error.message.trim() ? error.message : String(error) })
          }
          throw error
        }
      }

      reconnect() {
        // A restarted Host can answer with a lower revision in its new connection.
        this.connectionState = { revision: undefined }
        return this.refresh()
      }

      enqueue(method, resolveValue) {
        const operation = this.writeQueue.then(async () => {
          if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '显示偏好服务已关闭。', { what: '显示偏好服务' })
          const connectionState = this.connectionState
          const value = resolveValue()
          const snapshot = this.unwrap(
            await this.remote.eleckoiDisplayPreferences[method](value, this.snapshot.revision),
            '保存显示偏好失败。'
          )
          return this.adopt(snapshot, connectionState)
        })
        // `operation` 由调用方 await（`return operation`）；这里只为队列只留一条拒绝。
        this.writeQueue = operation.catch(rejectionIsAwaitedElsewhere)
        return operation
      }

      updateUi(update) {
        return this.enqueue('updateUi', () => {
          const current = this.snapshot.ui
          const next = typeof update === 'function' ? update(current) : { ...current, ...(update || {}) }
          return this.normalizedObject(next)
        })
      }

      setChatDisplay(value) {
        return this.enqueue('setChatDisplay', () => this.normalizedObject(value))
      }

      start() {
        void this.refresh().catch(failureAlreadyPublished)
      }

      dispose() {
        if (this.disposed) return
        this.disposed = true
        this.generation += 1
        this.listeners.clear()
      }
    }

    function apply(ctx) {
      const model = new DisplayPreferences(ctx.remote)
      ctx.provide('eleckoiDisplayPreferences', model)
      ctx.effect(() => {
        model.start()
        const refresh = () => { void model.refresh().catch(failureAlreadyPublished) }
        const stopReset = ctx.on('connection/reset', () => { void model.reconnect().catch(failureAlreadyPublished) })
        const stopSettings = ctx.remote.$on('settings/document-updated', ns => {
          if (ns === SETTINGS_NAMESPACE) refresh()
        })
        return () => {
          stopReset()
          stopSettings()
          model.dispose()
        }
      }, 'eleckoi: display preferences')
    }

    return { inject: ['remote', 'remote.settings', 'remote.eleckoiDisplayPreferences'], apply }
  }
})

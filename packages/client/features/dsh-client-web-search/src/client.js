window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-web-search',
  factory(require) {
    // 边界⑥ 的信封拆解只有一份实现（@eleckoi/dsh-product-api 的 client 面）。
    const { unwrapOrFail, failureAlreadyPublished, productFailure, ELECKOI_FAILURE_CODES } = require('@eleckoi/dsh-product-api')
    const SETTINGS_NAMESPACE = 'web-search-tavily'
    const TAVILY_API_KEY_REF = 'TAVILY_API_KEY'

    class WebSearchSettings {
      constructor(ctx) {
        this.ctx = ctx
        this.remote = ctx.remote
        this.snapshot = {
          status: 'loading',
          mode: 'provider_native',
          fetchMode: 'http',
          officialDeepSeekAvailable: false,
          maxResults: 5,
          apiKeyConfigured: false,
          apiKeyRef: TAVILY_API_KEY_REF,
          apiKeyWritable: true,
          writable: false,
          tavilyAvailable: false,
          revision: undefined,
          error: ''
        }
        this.listeners = new Set()
        this.generation = 0
        this.disposed = false
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

      unwrap(result, fallback) {
        return unwrapOrFail(result, fallback)
      }

      normalizeSettings(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return { maxResults: 5, apiKeyEnv: TAVILY_API_KEY_REF }
        const maxResults = Number.isInteger(value.maxResults) && value.maxResults >= 0 && value.maxResults <= 20
          ? value.maxResults : 5
        const apiKeyEnv = typeof value.apiKeyEnv === 'string' && value.apiKeyEnv.trim()
          ? value.apiKeyEnv.trim() : TAVILY_API_KEY_REF
        return { maxResults, apiKeyEnv }
      }

      async refresh() {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '联网搜索设置已关闭。', { what: '联网搜索设置' })
        const generation = ++this.generation
        try {
          const [selectionResult, fetchSelectionResult, settingsResult] = await Promise.all([
            this.remote.eleckoiWebSearch.selection(),
            this.remote.eleckoiWebSearch.fetchSelection(),
            this.remote.settings.describe()
          ])
          const mode = this.unwrap(selectionResult, '读取搜索方式失败。')
          const fetchMode = this.unwrap(fetchSelectionResult, '读取抓取方式失败。')
          const settingsDocument = this.unwrap(settingsResult, '读取联网搜索设置失败。')
          const namespace = settingsDocument?.namespaces?.find(item => item.ns === SETTINGS_NAMESPACE)
          const values = this.normalizeSettings(namespace?.value)
          const credentialsResult = await this.remote.credentials.describe([values.apiKeyEnv])
          const credentials = this.unwrap(credentialsResult, '读取 Tavily 凭据状态失败。')
          const credential = credentials?.[values.apiKeyEnv]
          const next = {
            status: 'ready',
            mode,
            fetchMode,
            maxResults: values.maxResults,
            apiKeyConfigured: credential?.configured === true,
            apiKeyRef: values.apiKeyEnv,
            apiKeyWritable: credential?.writable !== false,
            writable: settingsDocument.writable === true,
            tavilyAvailable: Boolean(namespace),
            officialDeepSeekAvailable: settingsDocument?.namespaces?.some(item => item.ns === 'web-deepseek-api'),
            revision: namespace?.revision,
            error: ''
          }
          if (!this.disposed && generation === this.generation) this.publish(next)
          return next
        } catch (error) {
          if (!this.disposed && generation === this.generation) {
            this.publish({
              ...this.snapshot,
              status: 'error',
              error: typeof error?.message === 'string' && error.message.trim() ? error.message : String(error)
            })
          }
          throw error
        }
      }

      async update(patch) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '联网搜索设置已关闭。', { what: '联网搜索设置' })
        const nextMode = patch?.mode
        const nextMaxResults = patch?.maxResults
        if (patch.fetchMode !== undefined && patch.fetchMode !== this.snapshot.fetchMode) this.unwrap(await this.remote.eleckoiWebSearch.selectFetch(patch.fetchMode), '保存抓取方式失败。')
        if (nextMode !== undefined && nextMode !== this.snapshot.mode) {
          this.unwrap(await this.remote.eleckoiWebSearch.select(nextMode), '保存搜索方式失败。')
        }
        if (nextMaxResults !== undefined && nextMaxResults !== this.snapshot.maxResults) {
          if (!Number.isInteger(nextMaxResults) || nextMaxResults < 0 || nextMaxResults > 20) {
            throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'Tavily API 返回结果数量必须在 0 到 20 之间。', { field: 'maxResults' })
          }
          this.unwrap(await this.remote.settings.mutate(SETTINGS_NAMESPACE, [{
            op: 'set', path: ['maxResults'], value: nextMaxResults
          }], this.snapshot.revision), '保存 Tavily 设置失败。')
        }
        return this.refresh()
      }

      async saveAndTest(apiKey) {
        const value = String(apiKey || '').trim()
        if (!value) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先填写 API Key。', { what: '填写 API Key' })
        const ref = this.snapshot.apiKeyRef
        const connection = this.unwrap(await this.remote.eleckoiWebSearch.testTavily(value), '联网连接测试失败。')
        this.unwrap(await this.remote.credentials.set(ref, value), '保存 API Key 失败。')
        return { settings: await this.refresh(), connection }
      }

      async test(apiKey = '') {
        const candidate = String(apiKey || '').trim()
        const connection = this.unwrap(
          await this.remote.eleckoiWebSearch.testTavily(candidate || undefined),
          '联网连接测试失败。'
        )
        return { connection }
      }

      async removeKey() {
        this.unwrap(await this.remote.credentials.unset(this.snapshot.apiKeyRef), '移除 API Key 失败。')
        return this.refresh()
      }

      openPluginSettings() {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, '联网搜索设置已关闭。', { what: '联网搜索设置' })
        // RETIRE WHEN: official Desktop replaces the complete ADR 0043 main-window adapter.
        if (new URLSearchParams(window.location?.search || '').has('view') && window.dshDesktop?.plugins) {
          return window.dshDesktop.plugins.openSettings('web-search')
        }
        const slots = this.ctx.get('slots')
        const layout = this.ctx.get('layout')
        const entry = slots?.entriesOfSlot('main').find(item => item.options.key === 'plugins')
        const face = entry?.inject?.()
        if (!layout || !face?.hooks.configLedger.getSnapshot().items.some(item => item.id === 'web-search')) {
          throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '网页搜索插件设置当前不可用。', { what: '网页搜索插件设置' })
        }
        const navigation = entry.store.create()
        layout.selectPanel('plugins')
        navigation.actions.setTab('installed')
        navigation.actions.setView({ kind: 'item', id: 'web-search' })
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
      const settings = new WebSearchSettings(ctx)
      ctx.provide('eleckoiWebSearch', settings)
      ctx.effect(() => {
        settings.start()
        const refresh = () => { void settings.refresh().catch(failureAlreadyPublished) }
        const stopReset = ctx.on('connection/reset', refresh)
        const stopCredentials = ctx.remote.$on('credentials/reference-updated', ref => {
          if (ref === settings.getSnapshot().apiKeyRef) refresh()
        })
        const stopSettings = ctx.remote.$on('settings/document-updated', ns => {
          if (ns === SETTINGS_NAMESPACE || ns === 'web') refresh()
        })
        const stopPlugins = ctx.remote.$on('plugin-manager/changed', refresh)
        return () => {
          stopReset()
          stopCredentials()
          stopSettings()
          stopPlugins()
          settings.dispose()
        }
      }, 'eleckoi: web search settings')
    }

    return { inject: ['remote', 'remote.eleckoiWebSearch', 'remote.settings', 'remote.credentials'], apply }
  }
})

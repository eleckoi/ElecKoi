window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-character-configuration',
  factory() {
    const idle = { status: 'idle', value: null, error: '' }
    const globalSettingLibraryOwner = 'eleckoi:global-settings'

    class CharacterConfigurationBridge {
      constructor(remote) {
        this.remote = remote
        this.listeners = new Set()
        this.disposed = false
        this.abort = null
        this.stream = null
      }

      async request(method, args) {
        const api = this.remote.eleckoiCharacterConfiguration
        if (typeof api[method] !== 'function') throw new Error(`不支持的角色配置操作：${method}`)
        const result = await api[method](...args)
        if (!result?.ok) throw new Error(result?.error?.message || '角色配置操作失败。')
        return result.value
      }

      subscribe(listener) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      }

      start() {
        const controller = new AbortController()
        this.abort = controller
        const stream = typeof this.remote?.$stream === 'function'
          ? this.remote.$stream({
            name: 'ElecKoi character configuration changes',
            open: signal => this.remote.eleckoiCharacterConfiguration.changes(signal),
            ended: () => new Error('ElecKoi 角色配置变更流意外结束。')
          })
          : this.remote.eleckoiCharacterConfiguration.changes(controller.signal)
        this.stream = stream
        void this.consume(stream)
      }

      async consume(stream) {
        try {
          for await (const item of stream) {
            if (this.disposed) return
            const change = item?.value ?? item
            item?.accept?.()
            for (const listener of this.listeners) listener(change)
          }
        } catch (error) {
          if (!this.disposed && !this.abort?.signal.aborted) {
            console.error('ElecKoi 角色配置变更流失败：', error)
          }
        }
      }

      dispose() {
        if (this.disposed) return
        this.disposed = true
        this.abort?.abort()
        if (typeof this.stream?.dispose === 'function') void this.stream.dispose()
        this.listeners.clear()
        this.abort = null
        this.stream = null
      }

      async listCharacters() {
        const result = await this.remote.eleckoiCharacters.list()
        if (!result?.ok) throw new Error(result?.error?.message || '读取角色列表失败。')
        return result.value
      }

      async listConversations() {
        const result = await this.remote.eleckoiConversations.list()
        if (!result?.ok) throw new Error(result?.error?.message || '读取聊天消息预览失败。')
        if (!Array.isArray(result.value) || result.value.some(item => !item || typeof item.id !== 'string')) {
          throw new Error('会话目录返回的数据格式不正确。')
        }
        return result.value
      }
    }

    class CharacterConfigurationModel {
      constructor(bridge, moduleName, readMethod, saveMethod, viewStateMethod, validate) {
        this.bridge = bridge
        this.moduleName = moduleName
        this.readMethod = readMethod
        this.saveMethod = saveMethod
        this.viewStateMethod = viewStateMethod
        this.validate = validate
        this.snapshots = new Map()
        this.generations = new Map()
        this.listeners = new Set()
        this.disposed = false
        this.stopEvents = () => {}
      }

      getSnapshot = characterId => this.snapshots.get(characterId) || idle

      subscribe = listener => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      }

      publish(kind, characterId, snapshot) {
        this.snapshots.set(characterId, snapshot)
        for (const listener of this.listeners) listener(kind, characterId, snapshot)
      }

      nextGeneration(characterId) {
        const generation = (this.generations.get(characterId) || 0) + 1
        this.generations.set(characterId, generation)
        return generation
      }

      async request(method, ...args) {
        if (this.disposed) throw new Error('角色配置客户端模型已关闭。')
        return this.bridge.request(method, args)
      }

      async read(characterId) {
        const generation = this.nextGeneration(characterId)
        const previous = this.getSnapshot(characterId)
        this.publish('configuration', characterId, { ...previous, status: 'loading', error: '' })
        try {
          const value = this.validate(await this.request(this.readMethod, characterId), characterId)
          if (!this.disposed && this.generations.get(characterId) === generation) {
            this.publish('configuration', characterId, { status: 'ready', value, error: '' })
          }
          return value
        } catch (error) {
          if (!this.disposed && this.generations.get(characterId) === generation) {
            this.publish('configuration', characterId, {
              status: 'error', value: previous.value,
              error: error instanceof Error ? error.message : String(error)
            })
          }
          throw error
        }
      }

      async readUntracked(characterId) {
        return this.validate(await this.request(this.readMethod, characterId), characterId)
      }

      async save(characterId, value) {
        const generation = this.nextGeneration(characterId)
        const saved = this.validate(await this.request(this.saveMethod, characterId, value), characterId)
        if (!this.disposed && this.generations.get(characterId) === generation) {
          this.publish('configuration', characterId, { status: 'ready', value: saved, error: '' })
        }
        return saved
      }

      async saveViewState(characterId, expandedIds) {
        const field = this.moduleName === 'settingLibraries' ? 'expandedGroupIds' : 'expandedObjectIds'
        const saved = await this.request(this.viewStateMethod, characterId, expandedIds)
        const snapshot = this.getSnapshot(characterId)
        if (snapshot.value) {
          this.publish('configuration', characterId, {
            ...snapshot, value: { ...snapshot.value, [field]: saved }
          })
        }
        return saved
      }

      refreshLoaded(characterId) {
        if (characterId) {
          if (this.snapshots.has(characterId)) void this.read(characterId).catch(() => {})
          return
        }
        for (const loadedId of this.snapshots.keys()) void this.read(loadedId).catch(() => {})
      }

      start() {
        this.stopEvents = this.bridge.subscribe(change => {
          if (change?.kind === 'snapshot') this.refreshLoaded()
          else if (change?.kind === 'configuration' && change.domain === this.moduleName) {
            this.refreshLoaded(change.characterId)
          }
        })
      }

      dispose() {
        if (this.disposed) return
        this.disposed = true
        this.stopEvents()
        this.listeners.clear()
        this.snapshots.clear()
        this.generations.clear()
      }
    }

    class SettingLibrariesModel extends CharacterConfigurationModel {
      constructor(bridge) {
        super(bridge, 'settingLibraries', 'readSettingLibrary', 'saveSettingLibrary',
          'saveSettingLibraryViewState', (value, characterId) => {
            if (!value || value.characterId !== characterId || !Array.isArray(value.entries)
              || !Array.isArray(value.groups) || !Array.isArray(value.versions)) {
              throw new Error('设定库返回的数据格式不正确。')
            }
            return value
          })
        this.conversationSnapshots = new Map()
        this.conversationGenerations = new Map()
      }

      request(method, ...args) {
        if (args[0] === globalSettingLibraryOwner) {
          const globalMethods = {
            readSettingLibrary: 'readGlobalSettingLibrary',
            saveSettingLibrary: 'saveGlobalSettingLibrary',
            saveSettingLibraryViewState: 'saveGlobalSettingLibraryViewState',
          }
          if (globalMethods[method]) return super.request(globalMethods[method], ...args.slice(1))
        }
        return super.request(method, ...args)
      }

      getGlobalSnapshot = () => this.getSnapshot(globalSettingLibraryOwner)
      readGlobal = () => this.read(globalSettingLibraryOwner)
      saveGlobal = library => this.save(globalSettingLibraryOwner, library)
      saveGlobalViewState = expandedIds => this.saveViewState(globalSettingLibraryOwner, expandedIds)
      subscribeGlobal = listener => this.subscribe((kind, ownerId, snapshot) => {
        if (kind === 'configuration' && ownerId === globalSettingLibraryOwner) listener(snapshot)
      })

      getConversationSnapshot = characterId => this.conversationSnapshots.get(characterId) || idle

      listCharacters() {
        return this.bridge.listCharacters()
      }

      async readConversations(characterId) {
        const generation = (this.conversationGenerations.get(characterId) || 0) + 1
        this.conversationGenerations.set(characterId, generation)
        const previous = this.getConversationSnapshot(characterId)
        this.publishConversations(characterId, { ...previous, status: 'loading', error: '' })
        try {
          const branches = await this.request('readConversationSettingLibraries', characterId)
          if (!Array.isArray(branches) || branches.some(item => !item || typeof item.sessionId !== 'string'
            || item.library?.characterId !== characterId)) {
            throw new Error('分支设定返回的数据格式不正确。')
          }
          const conversations = branches.length ? await this.bridge.listConversations() : []
          const previews = new Map(conversations.map(item => [item.id, item.preview]))
          const value = branches.map(item => ({ ...item, summary: previews.get(item.sessionId) ?? item.summary }))
          if (!this.disposed && this.conversationGenerations.get(characterId) === generation) {
            this.publishConversations(characterId, { status: 'ready', value, error: '' })
          }
          return value
        } catch (error) {
          if (!this.disposed && this.conversationGenerations.get(characterId) === generation) {
            this.publishConversations(characterId, {
              status: 'error', value: previous.value,
              error: error instanceof Error ? error.message : String(error)
            })
          }
          throw error
        }
      }

      publishConversations(characterId, snapshot) {
        this.conversationSnapshots.set(characterId, snapshot)
        for (const listener of this.listeners) listener('conversations', characterId, snapshot)
      }

      async saveConversation(characterId, sessionId, library) {
        return this.request('saveConversationSettingLibrary', characterId, sessionId, library)
      }

      async resetConversation(characterId, sessionId) {
        return this.request('resetConversationSettingLibrary', characterId, sessionId)
      }

      async saveConversationVersion(characterId, sessionId, name) {
        return this.request('saveConversationSettingLibraryVersion', characterId, sessionId, name)
      }

      refreshLoaded(characterId) {
        super.refreshLoaded(characterId)
        if (characterId) {
          if (this.conversationSnapshots.has(characterId)) void this.readConversations(characterId).catch(() => {})
          return
        }
        for (const loadedId of this.conversationSnapshots.keys()) {
          void this.readConversations(loadedId).catch(() => {})
        }
      }

      dispose() {
        super.dispose()
        this.conversationSnapshots.clear()
        this.conversationGenerations.clear()
      }
    }

    class RegexRulesModel extends CharacterConfigurationModel {
      constructor(bridge) {
        super(bridge, 'regexRules', 'readRegexRules', 'saveRegexRules', null,
          (value, characterId) => {
            if (!value || value.characterId !== characterId || !Array.isArray(value.globalRules)
              || !Array.isArray(value.agentPresetRules) || !Array.isArray(value.characterRules)
              || !Array.isArray(value.versions) || !Number.isInteger(value.revision)) {
              throw new Error('正则配置返回的数据格式不正确。')
            }
            return value
          })
      }

      async save(characterId, collection) {
        const generation = this.nextGeneration(characterId)
        const saved = this.validate(await this.request(
          this.saveMethod, characterId, collection, collection.revision
        ), characterId)
        if (!this.disposed && this.generations.get(characterId) === generation) {
          this.publish('configuration', characterId, { status: 'ready', value: saved, error: '' })
        }
        return saved
      }

      async import(characterId, collection, fallbackScope, documents) {
        const generation = this.nextGeneration(characterId)
        const result = await this.request(
          'importRegexRules', characterId, fallbackScope, documents, collection.revision
        )
        const saved = this.validate(result?.collection, characterId)
        if (!this.disposed && this.generations.get(characterId) === generation) {
          this.publish('configuration', characterId, { status: 'ready', value: saved, error: '' })
        }
        return result
      }

      export(characterId, ruleIds) {
        return this.request('exportRegexRules', characterId, ruleIds)
      }

      test(text, rule, target) {
        return this.request('testRegexRule', text, rule, target)
      }

      start() {
        this.stopEvents = this.bridge.subscribe(change => {
          if (change?.kind === 'snapshot') this.refreshLoaded()
          else if (change?.kind === 'configuration'
            && (change.domain === 'regexRules' || change.domain === 'agentPresets')) {
            this.refreshLoaded(change.characterId)
          }
        })
      }
    }

    class ScriptLibrariesModel extends CharacterConfigurationModel {
      constructor(bridge) {
        super(bridge, 'scripts', 'readScriptLibrary', 'saveScriptLibrary', null, (value, key) => {
          const [scope, ownerId] = JSON.parse(key)
          if (!value || value.scope !== scope || value.ownerId !== ownerId || !Array.isArray(value.trees)
            || typeof value.enabled !== 'boolean' || !Number.isSafeInteger(value.revision)
            || !value.variables || typeof value.variables !== 'object' || Array.isArray(value.variables)) {
            throw new Error('脚本库返回的数据格式不正确。')
          }
          return value
        })
      }
      request(method, ...args) {
        return super.request(method, ...(method === 'readScriptLibrary' ? JSON.parse(args[0]) : [args[1]]))
      }
      refreshLoaded() { super.refreshLoaded() }
    }

    function scriptLibraryService(model, bridge) {
      const key = (scope, ownerId) => JSON.stringify([scope, ownerId])
      return {
        getSnapshot: (scope, ownerId) => model.getSnapshot(key(scope, ownerId)),
        read: (scope, ownerId) => model.read(key(scope, ownerId)),
        save: library => model.save(key(library.scope, library.ownerId), library),
        async openDirectory(scope, ownerId) {
          const workspace = await bridge.request('readScriptWorkspace', [scope, ownerId])
          const result = await bridge.remote.session.openWorkspacePath({ path: workspace.path })
          if (!result.ok) throw new Error(result.error.message)
        },
        async saveAll(libraries) {
          const requests = libraries.map(library => {
            const address = key(library.scope, library.ownerId)
            return { address, generation: model.nextGeneration(address) }
          })
          const saved = await bridge.request('saveScriptLibraries', [libraries])
          if (!Array.isArray(saved) || saved.length !== requests.length) throw new Error('批量保存脚本库返回的数据格式不正确。')
          const values = saved.map((library, index) => model.validate(library, requests[index].address))
          if (!model.disposed) values.forEach((value, index) => {
            const { address, generation } = requests[index]
            if (model.generations.get(address) === generation) model.publish('configuration', address, { status: 'ready', value, error: '' })
          })
          return values
        },
        subscribe: listener => model.subscribe((kind, address, snapshot) => {
          const [scope, ownerId] = JSON.parse(address)
          listener(scope, ownerId, snapshot)
        }),
        subscribeChanges: listener => bridge.subscribe(change => {
          if (change?.kind === 'snapshot' || change?.kind === 'configuration'
            && ['scripts', 'agentPresets'].includes(change.domain)) listener()
        }),
        async activePreset() {
          const catalog = await bridge.remote.eleckoiAgentPresets.catalog()
          if (!catalog?.ok) throw new Error(catalog?.error?.message || '读取当前预设失败。')
          const preset = catalog.value.presets.find(item => item.id === catalog.value.activePresetIds.roleplay)
          if (!preset) throw new Error('当前预设不在预设目录中。')
          return { id: preset.id, name: preset.name }
        },
      }
    }

    function apply(ctx) {
      const bridge = new CharacterConfigurationBridge(ctx.remote)
      const settingLibraries = new SettingLibrariesModel(bridge)
      const variables = new CharacterConfigurationModel(
        bridge, 'variables', 'readVariableConfig', 'saveVariableConfig',
        'saveVariableConfigViewState', (value, characterId) => {
          if (!value || value.characterId !== characterId || !Array.isArray(value.objects)
            || !Array.isArray(value.variables) || !Array.isArray(value.versions)) {
            throw new Error('变量配置返回的数据格式不正确。')
          }
          return value
        }
      )
      const regexRules = new RegexRulesModel(bridge)
      const scripts = new ScriptLibrariesModel(bridge)
      ctx.provide('eleckoiSettingLibraries', settingLibraries)
      ctx.provide('eleckoiVariables', variables)
      ctx.provide('eleckoiRegexRules', regexRules)
      ctx.provide('eleckoiScriptLibraries', scriptLibraryService(scripts, bridge))
      ctx.effect(() => {
        settingLibraries.start()
        variables.start()
        regexRules.start()
        scripts.start()
        bridge.start()
        const stopReset = ctx.on('connection/reset', () => {
          settingLibraries.refreshLoaded()
          variables.refreshLoaded()
          regexRules.refreshLoaded()
          scripts.refreshLoaded()
        })
        return () => {
          stopReset()
          bridge.dispose()
          settingLibraries.dispose()
          variables.dispose()
          regexRules.dispose()
          scripts.dispose()
        }
      }, 'eleckoi: character configuration models')
    }

    return { inject: ['remote', 'remote.session', 'remote.eleckoiCharacters', 'remote.eleckoiConversations', 'remote.eleckoiCharacterConfiguration', 'remote.eleckoiAgentPresets'], apply }
  }
})

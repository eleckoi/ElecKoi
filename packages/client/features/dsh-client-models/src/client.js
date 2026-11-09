window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-models',
  factory(require) {
    const React = require('react')
    // 边界⑥ 的信封拆解只有一份实现（@eleckoi/dsh-product-api 的 client 面）。
    const { unwrapOrFail, failureAlreadyPublished, rejectionIsAwaitedElsewhere, productFailure, ELECKOI_FAILURE_CODES } = require('@eleckoi/dsh-product-api')
    const SETTINGS_NAMESPACE = 'eleckoi-client-models'
    const protocols = { responses: 'openai-responses', chat_completions: 'openai-completions',
      anthropic_messages: 'anthropic-messages', google_gemini: 'google-generative-ai' }
    const formats = Object.fromEntries(Object.entries(protocols).map(([format, api]) => [api, format]))
    const valueOf = (result, fallback) => {
      return unwrapOrFail(result, fallback)
    }
    const keyRef = id => `${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
    const imageProvider = provider => ['openai_image', 'novelai_image'].includes(provider)
    const ModelPage = React.lazy(() => import(new URL('eleckoi-page-model.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
      .then(module => ({ default: module.ModelPage })))
    class ModelCatalog {
      constructor(remote) {
        this.remote = remote
        this.providers = []
        this.builtinModels = new Map()
        this.snapshot = { status: 'loading', configs: [], providers: [], error: '' }
        this.listeners = new Set()
        this.generation = 0
        this.disposed = false
        this.stopEvents = () => {}
        this.namespaces = new Map()
        this.writeQueue = Promise.resolve()
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

      configsFromCatalog(catalog) {
        if (!catalog || !Array.isArray(catalog.groups)) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'DSH 模型目录返回的数据格式不正确。', { what: 'DSH 模型目录' })
        return catalog.groups.map(group => {
          if (!group || typeof group.id !== 'string' || typeof group.name !== 'string' || !Array.isArray(group.models)) {
            throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'DSH 模型目录返回的数据格式不正确。', { what: 'DSH 模型目录' })
          }
          const modelOptions = group.models.map(model => {
            if (!model || typeof model.id !== 'string' || typeof model.name !== 'string') {
              throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'DSH 模型目录返回的数据格式不正确。', { what: 'DSH 模型目录' })
            }
            const reasoningEfforts = model.reasoning?.efforts?.length
              ? Object.fromEntries(model.reasoning.efforts.map(effort => [effort.id, effort.id === 'off' ? null : effort.id]))
              : false
            return {
              id: model.id,
              name: model.name,
              ...(model.description ? { description: model.description } : {}),
              ...(Array.isArray(model.inputModalities)
                ? { inputModalities: [...model.inputModalities], supportsImageInput: model.inputModalities.includes('image') }
                : {}),
              ...(Number.isFinite(model.contextWindow) ? { contextWindowTokens: model.contextWindow } : {}),
              ...(Number.isFinite(model.defaultMaxTokens) ? { maxOutputTokens: model.defaultMaxTokens } : {}),
              reasoningEfforts,
              ...(model.reasoning?.defaultEffort ? { reasoningEffort: model.reasoning.defaultEffort } : {})
            }
          })
          const defaultModel = catalog.default?.provider === group.id
            ? catalog.default.model
            : modelOptions[0]?.id || ''
          return {
            id: group.id,
            name: group.name,
            provider: group.id,
            model: defaultModel,
            model_options: modelOptions,
            enabled: true
          }
        })
      }

      adopt(configs) {
        if (this.disposed) return
        this.generation += 1
        this.publish({ status: 'ready', configs, providers: this.providers, error: '' })
      }

      enqueue(run) {
        const task = this.writeQueue.then(run)
        // `task` 由调用方 await（`return task`）；这里只为队列只留一条拒绝。
        this.writeQueue = task.catch(rejectionIsAwaitedElsewhere)
        return task
      }

      async settings() {
        const document = valueOf(await this.remote.settings.describe(), '读取模型设置失败。')
        this.namespaces = new Map(document.namespaces.map(row => [row.ns, row]))
        return this.namespaces
      }

      async mutate(ns, ops) {
        const row = this.namespaces.get(ns)
        if (!row) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, `DSH 设置命名空间 ${ns} 未加载。`, { what: 'DSH 设置命名空间' })
        const next = valueOf(await this.remote.settings.mutate(ns, ops, row.revision), '保存模型设置失败。')
        this.namespaces.set(ns, next)
      }

      async configuredCatalog(catalog) {
        const namespaces = await this.settings()
        const entries = namespaces.get(SETTINGS_NAMESPACE)?.value?.entries || {}
        const routes = valueOf(await this.remote.llm.listConfigurableProviders(), '读取模型提供商失败。')
          .filter(route => route.settingsNs === 'llm-pi-ai' || route.provider === 'deepseek-official')
        this.providers = routes.filter(route => !route.declared || route.provider === 'deepseek-official')
        const directory = new Map(routes.map(route => [route.provider, route]))
        // The model picker includes account-authenticated routes that are not
        // editable provider profiles. Only the configurable directory owns
        // model configuration pages.
        const base = this.configsFromCatalog(catalog).filter(config => directory.has(config.id))
        const byId = new Map(base.map(config => [config.id, config]))
        for (const route of routes) {
          const section = namespaces.get(route.settingsNs)?.value
          const profile = route.settingsPath.reduce((value, part) => value?.[part], section)
          // The configurable directory also contains unconfigured catalog providers.
          if (!byId.has(route.provider) && (profile || entries[route.provider])) {
            byId.set(route.provider, { id: route.provider, name: route.displayName, model_options: [] })
          }
        }
        const piAiProfiles = namespaces.get('llm-pi-ai')?.value?.providers || {}
        // pi-ai is the source of truth for generic provider profiles. Older
        // ElecKoi releases could persist a complete profile there while the
        // product metadata still labelled it as a dedicated provider (or was
        // missing altogether). Expose every persisted profile as a custom
        // configuration version even when the configurable-provider directory
        // has not listed the route yet.
        for (const [id, profile] of Object.entries(piAiProfiles)) {
          if (!byId.has(id)) {
            byId.set(id, {
              id,
              name: profile.displayName || id,
              provider: 'custom',
              model: profile.models?.[0]?.id || '',
              model_options: [],
            })
          }
        }
        for (const [id, entry] of Object.entries(entries)) {
          if (imageProvider(entry.provider) || piAiProfiles[id] || entry.draftProfile) {
            if (!byId.has(id)) byId.set(id, { id, model_options: [] })
          }
        }
        const configs = await Promise.all([...byId.values()].map(async config => {
          const route = directory.get(config.id)
          const ns = route?.settingsNs || 'llm-pi-ai'
          const path = route?.settingsPath || ['providers', config.id]
          const storedProfile = path.reduce((value, part) => value?.[part], namespaces.get(ns)?.value)
          const { draftProfile, ...extra } = entries[config.id] || {}
          const profile = storedProfile || draftProfile || {}
          const pending = !storedProfile && Boolean(draftProfile)
          const builtin = extra.builtin === true || this.providers.some(item => item.provider === config.id)
          const useBuiltinModels = builtin && !(profile.models || []).length
          let catalogDefaults = new Map()
          if (builtin && ns === 'llm-pi-ai') {
            if (!this.builtinModels.has(config.id)) {
              this.builtinModels.set(config.id, this.remote.eleckoiModels.discoverModels({ configId: config.id, builtinProvider: config.id, api: 'catalog', baseURL: '' })
                .then(result => valueOf(result, '读取内置模型能力失败。')).catch(error => { this.builtinModels.delete(config.id); throw error }))
            }
            catalogDefaults = new Map((await this.builtinModels.get(config.id)).map(model => [model.id, { id: model.id, name: model.name || model.id, contextWindowTokens: model.contextWindow, maxOutputTokens: model.maxTokens, inputModalities: model.inputModalities, supportsImageInput: model.inputModalities?.includes('image') === true, reasoningEfforts: model.reasoningEfforts || false }]))
          }
          const models = new Map((useBuiltinModels ? Object.entries(profile.modelOverrides || {}).map(([id, value]) => ({ ...value, id })) : profile.models || []).map(model => [model.id, model]))
          const options = new Map((config.model_options || []).map(model => [model.id, model]))
          for (const model of models.values()) if (!options.has(model.id)) options.set(model.id, { id: model.id, name: model.name || model.id })
          const provider = ns === 'llm-deepseek'
            ? 'deepseek'
            : extra.provider === 'deepseek' ? 'custom' : extra.provider || 'custom'
          const credentialRef = extra.credentialRef || profile.apiKeyEnv || (ns === 'llm-deepseek' ? 'DEEPSEEK_API_KEY' : keyRef(config.id))
          return { ...config, ...extra, provider, builtin, useBuiltinModels, credentialRef, api_key: '',
            name: extra.name || profile.displayName || config.name || '',
            model: extra.model || config.model || options.keys().next().value || '',
            base_url: imageProvider(provider) ? extra.base_url || '' : profile.baseURL || (ns === 'llm-deepseek' ? 'https://api.deepseek.com/anthropic' : ''),
            api_format: ns === 'llm-deepseek' ? 'deepseek_messages' : formats[profile.api] || (builtin ? 'catalog' : extra.api_format || 'responses'),
            custom_headers: profile.headers || extra.custom_headers || {},
            settingsNs: ns, settingsPath: path,
            model_options: [...options.values()].map(model => {
              const declared = models.get(model.id) || {}
              const parameters = extra.parameters?.[model.id] || {}
              return { ...(catalogDefaults.get(model.id) || {}), ...model, ...parameters,
                ...(catalogDefaults.has(model.id) ? { catalogDefaults: catalogDefaults.get(model.id) } : {}),
                ...(declared.contextWindow ? { contextWindowTokens: declared.contextWindow } : {}),
                ...(declared.maxTokens ? { maxOutputTokens: declared.maxTokens } : {}),
                ...(declared.reasoningEfforts !== undefined ? { reasoningEfforts: declared.reasoningEfforts } : {}),
                ...(declared.input?.length || declared.inputModalities?.length ? { inputModalities: [...(declared.input || declared.inputModalities)], supportsImageInput: (declared.input || declared.inputModalities).includes('image') } : {}),
                ...(useBuiltinModels ? { overrideFields: Object.keys(declared).filter(key => key !== 'id'), capabilitiesOverride: Boolean(declared.input?.length) || declared.reasoningEfforts !== undefined } : {}) }
            }), enabled: !imageProvider(provider) && !pending }
        }))
        const credentials = valueOf(await this.remote.credentials.describe(configs.map(config => config.credentialRef)), '读取密钥状态失败。')
        return configs.map(config => ({ ...config, credentialConfigured: credentials[config.credentialRef]?.configured === true }))
      }

      async revealApiKey(configId) {
        return valueOf(await this.remote.eleckoiModels.revealApiKey(configId), '读取密钥失败。')
      }

      save(config) {
        return this.saveResolved(() => config)
      }

      saveModelParameters(configId, modelId, patch) {
        return this.saveResolved(configs => {
          const fields = ['contextWindowTokens', 'maxOutputTokens', 'temperature', 'topP', 'autoCompactTokenLimit', 'capabilitiesOverride', 'inputModalities', 'supportsImageInput', 'overrideFields', 'reasoningEfforts', 'reasoningEffort']
          if (Object.keys(patch).some(key => !fields.includes(key))) throw productFailure(ELECKOI_FAILURE_CODES.modelConfigInvalid, '模型参数超出有效范围。', { field: '模型参数', what: '模型参数' })
          const config = configs.find(item => item.id === configId)
          const option = config?.model_options?.find(item => item.id === modelId)
          if (!option) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '模型配置不存在。', { what: '模型配置' })
          const next = { ...option, ...patch }
          const efforts = next.reasoningEfforts
          const invalidEfforts = efforts !== undefined && efforts !== false && (
            efforts === null || typeof efforts !== 'object' || Array.isArray(efforts)
            || !Object.keys(efforts).some(level => level !== 'off')
            || Object.entries(efforts).some(([level, wire]) => !['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(level)
              || (level === 'off' && wire === null ? false : typeof wire !== 'string' || !wire.trim()))
          )
          const context = next.contextWindowTokens || next.catalogDefaults?.contextWindowTokens || 1_000_000
          const invalid = ['contextWindowTokens', 'autoCompactTokenLimit', 'maxOutputTokens'].some(key => next[key] != null && (!Number.isSafeInteger(next[key]) || next[key] < 1))
            || next.autoCompactTokenLimit > context
            || next.temperature != null && (!Number.isFinite(next.temperature) || next.temperature < 0)
            || next.topP != null && (!Number.isFinite(next.topP) || next.topP < 0 || next.topP > 1)
            || invalidEfforts
            || next.reasoningEffort != null && (!efforts || !Object.hasOwn(efforts, next.reasoningEffort))
            || Array.isArray(next.inputModalities) && !next.inputModalities.length
          if (invalid) throw productFailure(ELECKOI_FAILURE_CODES.modelConfigInvalid, '模型参数超出有效范围。', { field: '模型参数', what: '模型参数' })
          const overrides = new Set(option.overrideFields || [])
          for (const [field, key] of [['contextWindowTokens', 'contextWindow'], ['maxOutputTokens', 'maxTokens']]) {
            if (!Object.hasOwn(patch, field)) continue
            if (patch[field] == null) { overrides.delete(key); next[field] = option.catalogDefaults?.[field] }
            else overrides.add(key)
          }
          next.overrideFields = [...overrides]
          return { ...config, model_options: config.model_options.map(item => item.id === modelId ? next : item) }
        })
      }

      saveResolved(resolveConfig) {
        return this.enqueue(async () => {
          if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'ElecKoi 模型目录已关闭。', { what: 'ElecKoi 模型目录' })
          const config = resolveConfig(this.snapshot.configs)
          if (config.builtin && !this.providers.some(route => route.provider === config.id)) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请选择当前 DSH 内置目录中的提供商。', { what: '选择当前 DSH 内置目录中的提供商' })
          if (!config.id || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(config.id)) throw productFailure(ELECKOI_FAILURE_CODES.modelConfigInvalid, '模型配置编号不正确。', { field: 'id', what: '模型配置编号' })
          for (const model of config.model_options || []) {
            if (model.inputModalities && (!model.inputModalities.length || model.inputModalities.some(input => !['text', 'image'].includes(input)))) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请选择有效的模型输入能力。', { what: '选择有效的模型输入能力' })
          }
          if (config.proxy_url?.trim()) throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, '当前 DSH 适配器不支持每个模型单独设置代理，请使用系统代理。', { what: '每个模型单独的代理', expected: '使用系统代理' })
          if (config.provider === 'deepseek'
            && (config.id !== 'deepseek-official' || config.api_format !== 'deepseek_messages')) {
            throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, 'DeepSeek 官方 API 固定使用 DSH 的 Messages 专用适配器；其他协议请使用自定义模型提供商。', { what: 'DeepSeek 官方 API 的非 Messages 协议', expected: 'DSH 的 Messages 专用适配器' })
          }
          await this.settings()
          const previous = this.snapshot.configs.find(item => item.id === config.id)
          const ref = previous?.credentialRef || (config.id === 'deepseek-official' ? this.namespaces.get('llm-deepseek')?.value?.apiKeyEnv || 'DEEPSEEK_API_KEY' : keyRef(config.id))
          if (config.clearConfiguration) {
            if (config.id === 'deepseek-official') {
              await this.mutate('llm-deepseek', [
                { op: 'unset', path: ['baseURL'] }, { op: 'unset', path: ['models'] },
              ])
            } else if (!imageProvider(config.provider)) {
              await this.mutate('llm-pi-ai', [{ op: 'unset', path: ['providers', config.id] }])
            }
            await this.mutate(SETTINGS_NAMESPACE, [{ op: 'unset', path: ['entries', config.id] }])
            if (!this.snapshot.configs.some(item => item.id !== config.id && item.credentialRef === ref)) {
              valueOf(await this.remote.credentials.unset(ref), '清除密钥失败。')
            }
            await this.refresh()
            return this.snapshot.configs.find(item => item.id === config.id)
              || { ...config, api_key: '', credentialConfigured: false, clearConfiguration: undefined }
          }
          const ns = config.api_format === 'deepseek_messages' ? 'llm-deepseek' : 'llm-pi-ai'
          if (ns === 'llm-deepseek' && config.id !== 'deepseek-official') throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, 'DeepSeek Messages 使用内置 DeepSeek 专用配置；其他配置请选择对应的通用协议。', { what: 'DeepSeek Messages 的非官方提供商配置', expected: 'deepseek-official 专用配置' })
          if (ns === 'llm-deepseek' && Object.keys(config.custom_headers || {}).length) throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, 'DeepSeek Messages 专用适配器不支持自定义请求头。', { what: 'DeepSeek Messages 的自定义请求头' })
          const parameters = Object.fromEntries((config.model_options || []).map(model => [model.id, {
            ...(model.temperature == null ? {} : { temperature: model.temperature }),
            ...(model.topP == null ? {} : { topP: model.topP }),
            ...(model.autoCompactTokenLimit == null ? {} : { autoCompactTokenLimit: model.autoCompactTokenLimit }),
            ...(model.reasoningEffort == null ? {} : { reasoningEffort: model.reasoningEffort }),
            ...(model.isUserAdded ? { isUserAdded: true } : {})
          }]))
          const extra = { name: config.name || '', provider: config.provider, builtin: config.builtin === true, model: config.model || '', credentialRef: ref, parameters }
          let removeProvider = false
          if (imageProvider(config.provider)) {
            Object.assign(extra, { base_url: config.base_url, api_format: config.api_format, image_settings: config.image_settings || {}, model_options: config.model_options || [], custom_headers: config.custom_headers || {} })
          } else {
            const models = (config.model_options || []).map(model => ({ id: model.id, name: model.name || model.id,
              ...(model.contextWindowTokens == null ? {} : { contextWindow: model.contextWindowTokens }),
              ...(model.maxOutputTokens == null ? {} : { maxTokens: model.maxOutputTokens }),
              [ns === 'llm-deepseek' ? 'inputModalities' : 'input']: model.inputModalities || (model.supportsImageInput ? ['text', 'image'] : ['text']),
              ...(ns === 'llm-pi-ai' && model.reasoningEfforts !== undefined ? { reasoningEfforts: model.reasoningEfforts } : {}) }))
            const path = ns === 'llm-deepseek' ? [] : ['providers', config.id]
            if (ns === 'llm-deepseek') {
              const ops = [{ op: 'set', path: ['baseURL'], value: config.base_url }, { op: 'set', path: ['models'], value: models }]
              await this.mutate(ns, ops)
            } else {
              if (!config.builtin && !protocols[config.api_format]) throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, '不支持的模型接口格式。', { what: '模型接口格式', expected: Object.keys(formats).join(' / ') })
              const storedProfile = this.namespaces.get(ns)?.value?.providers?.[config.id]
              const previousProfile = storedProfile
                || this.namespaces.get(SETTINGS_NAMESPACE)?.value?.entries?.[config.id]?.draftProfile || {}
              const profile = { ...previousProfile, displayName: config.name || config.id, baseURL: config.base_url, headers: config.custom_headers || {} }
              if (!config.builtin || previousProfile.apiKeyEnv || config.api_key?.trim() || config.credentialConfigured) profile.apiKeyEnv = ref
              if (config.builtin) {
                if (!config.base_url?.trim()) delete profile.baseURL
                delete profile.api
                if (config.useBuiltinModels !== false) {
                  delete profile.models
                  profile.modelOverrides = Object.fromEntries((config.model_options || []).map(model => {
                    const override = { ...(previousProfile.modelOverrides?.[model.id] || {}) };
                    delete override.contextWindow; delete override.maxTokens; delete override.input; delete override.reasoningEfforts
                    for (const [key, field] of [['contextWindow', 'contextWindowTokens'], ['maxTokens', 'maxOutputTokens']]) {
                      if (model.overrideFields?.includes(key) && model[field] != null) override[key] = model[field]
                    }
                    if (model.capabilitiesOverride) {
                      override.input = model.inputModalities || ['text']
                      override.reasoningEfforts = model.reasoningEfforts || false
                    }
                    return [model.id, override]
                  }).filter(([, override]) => Object.keys(override).length))
                } else {
                  delete profile.modelOverrides
                  profile.models = models
                }
              } else {
                profile.api = protocols[config.api_format]
                profile.models = models
                delete profile.modelOverrides
              }
              if (config.builtin || models.length) {
                await this.mutate(ns, [{ op: 'set', path, value: profile }])
              } else {
                // Keep incomplete provider setup editable without registering an unusable route.
                extra.draftProfile = profile
                removeProvider = storedProfile !== undefined
              }
            }
          }
          await this.mutate(SETTINGS_NAMESPACE, [{ op: 'set', path: ['entries', config.id], value: extra }])
          if (removeProvider) {
            await this.mutate('llm-pi-ai', [{ op: 'unset', path: ['providers', config.id] }])
          }
          if (config.api_key?.trim()) valueOf(await this.remote.credentials.set(ref, config.api_key.trim()), '保存密钥失败。')
          else if (config.clearCredential) valueOf(await this.remote.credentials.unset(ref), '清除密钥失败。')
          await this.refresh()
          return this.snapshot.configs.find(item => item.id === config.id)
        })
      }

      deleteConfig(id) {
        return this.enqueue(async () => {
          await this.settings()
          const config = this.snapshot.configs.find(item => item.id === id)
          if (!config) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '模型配置不存在。', { what: '模型配置' })
          if (!imageProvider(config.provider)) {
            if (config.settingsNs === 'llm-deepseek') {
              await this.mutate('llm-deepseek', [
                { op: 'unset', path: ['baseURL'] }, { op: 'unset', path: ['models'] },
              ])
            } else {
              await this.mutate(config.settingsNs, [{ op: 'unset', path: config.settingsPath }])
            }
          }
          await this.mutate(SETTINGS_NAMESPACE, [{ op: 'unset', path: ['entries', id] }])
          if (!this.snapshot.configs.some(item => item.id !== id && item.credentialRef === config.credentialRef)) {
            valueOf(await this.remote.credentials.unset(config.credentialRef), '删除密钥失败。')
          }
          await this.refresh()
          return this.snapshot.configs[0]
        })
      }

      async discover(config) {
        const saved = this.snapshot.configs.find(item => item.id === config.id)
        const unchangedEndpoint = saved && saved.base_url === config.base_url && saved.api_format === config.api_format
        if (!config.builtin && config.api_format !== 'deepseek_messages' && !protocols[config.api_format]) throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, '该协议没有可读取的模型目录。', { what: '该协议的模型目录', expected: Object.keys(formats).join(' / ') })
        const models = valueOf(await this.remote.eleckoiModels.discoverModels({
          configId: config.id, baseURL: config.base_url || '',
          ...(config.builtin ? { builtinProvider: config.id } : {}),
          api: config.api_format === 'deepseek_messages' ? 'deepseek_messages' : protocols[config.api_format] || 'catalog',
          ...(config.api_key?.trim() ? { apiKey: config.api_key.trim() } : {}),
          headers: config.custom_headers || {}
        }), '读取模型列表失败。')
        return models.map(model => {
          const defaults = { id: model.id, name: model.name || model.id, contextWindowTokens: model.contextWindow, maxOutputTokens: model.maxTokens, inputModalities: model.inputModalities || ['text'], supportsImageInput: model.inputModalities?.includes('image') === true, reasoningEfforts: model.reasoningEfforts || false };
          return ({ ...(unchangedEndpoint ? saved.model_options?.find(item => item.id === model.id) : {}),
          id: model.id,
          ...(model.contextWindow ? { contextWindowTokens: model.contextWindow } : {}),
          ...(model.maxTokens ? { maxOutputTokens: model.maxTokens } : {}),
          ...(model.inputModalities ? { inputModalities: [...model.inputModalities], supportsImageInput: model.inputModalities.includes('image') } : {}),
          ...(model.reasoningEfforts === undefined ? {} : { reasoningEfforts: model.reasoningEfforts }),
          ...(model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort }),
          ...(config.model_options?.find(item => item.id === model.id) || {}),
          name: model.name || model.id,
          ...(config.builtin ? { catalogDefaults: defaults } : {}) }) })
      }

      async refresh() {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'ElecKoi 模型目录已关闭。', { what: 'ElecKoi 模型目录' })
        const generation = ++this.generation
        try {
          const result = await this.remote.session.modelCatalog()
          unwrapOrFail(result, '读取 DSH 模型目录失败。')
          const configs = this.remote.settings ? await this.configuredCatalog(result.value) : this.configsFromCatalog(result.value)
          if (!this.disposed && generation === this.generation) {
            this.publish({ status: 'ready', configs, providers: this.providers, error: '' })
          }
          return configs
        } catch (error) {
          if (!this.disposed && generation === this.generation) {
            this.publish({ status: 'error', configs: this.snapshot.configs, providers: this.providers,
              error: typeof error?.message === 'string' && error.message.trim() ? error.message : String(error) })
          }
          throw error
        }
      }

      start() {
        void this.refresh().catch(failureAlreadyPublished)
      }

      dispose() {
        if (this.disposed) return
        this.disposed = true
        this.generation += 1
        this.stopEvents()
        this.listeners.clear()
      }
    }

    function apply(ctx) {
      const catalog = new ModelCatalog(ctx.remote)
      ctx.provide('eleckoiModels', catalog)
      const loadModelPage = () => import(new URL('eleckoi-page-model.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
      const ModelLabel = React.lazy(() => loadModelPage().then(module => ({ default: module.ModelLabel })))
      const ModelProviderLabel = React.lazy(() => loadModelPage().then(module => ({ default: module.ModelProviderLabel })))
      const ModelMenuParameters = React.lazy(() => loadModelPage().then(module => ({ default: module.ModelMenuParameters })))
      ctx.slots.inject('conversation.input.model.label', () => ctx.slots.register({
        name: 'conversation.input.model.label', priority: -10, registrant: '@eleckoi/dsh-client-models'
      }, owner => React.createElement(React.Suspense, { fallback: owner.model.name }, React.createElement(ModelLabel, {
        ...owner, catalog, resolveText: text => ctx.locale.resolveText(text)
      }))))
      ctx.slots.inject('conversation.input.model.provider.label', () => ctx.slots.register({
        name: 'conversation.input.model.provider.label', priority: -10, registrant: '@eleckoi/dsh-client-models'
      }, owner => React.createElement(React.Suspense, { fallback: owner.provider.name }, React.createElement(ModelProviderLabel, { ...owner, catalog }))))
      ctx.slots.inject('conversation.input.model.parameters', () => ctx.slots.register({
        name: 'conversation.input.model.parameters', registrant: '@eleckoi/dsh-client-models'
      }, owner => React.createElement(React.Suspense, { fallback: null }, React.createElement(ModelMenuParameters, { ...owner, catalog }))))
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'model', registrant: '@eleckoi/dsh-client-models' },
        () => React.createElement(ModelPage)))
      const NavigationIcon = React.lazy(() => import(new URL('eleckoi-page-model.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
        .then(module => ({ default: module.NavigationIcon })))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: 'model', order: 30, label: () => ctx.locale.bind('eleckoi.ui')("模型配置"), registrant: '@eleckoi/dsh-client-models'
      }, ({ size }) => React.createElement(React.Suspense, { fallback: null }, React.createElement(NavigationIcon, { size }))))
      ctx.effect(() => {
        catalog.start()
        const stopReset = ctx.on('connection/reset', () => { catalog.builtinModels.clear(); void catalog.refresh().catch(failureAlreadyPublished) })
        return () => {
          stopReset()
          catalog.dispose()
        }
      }, 'eleckoi: model catalog')
    }

    return { inject: ['locale', 'slots', 'remote', 'remote.session', 'remote.settings', 'remote.llm', 'remote.credentials', 'remote.eleckoiModels'], apply }
  }
})

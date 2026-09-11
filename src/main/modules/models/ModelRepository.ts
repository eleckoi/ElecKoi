import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import type { ModelApiFormat, ModelConfig, ModelOption, ModelProviderId, RuntimeModelSettings } from '@shared/contracts/entities/model'
import { modelConfigSchema, modelOptionSchema } from '@shared/contracts/entities/schemas'
import type { ActiveModelSelection } from '@shared/contracts/settings/schemas'
import { parseJsonArray, parseJsonObject } from '@shared/foundation/json'
import type { CredentialCipher } from '@main/platform/electron/CredentialCipher'
import { type ElecKoiDatabase, SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import { modelConfigs, modelConfigMeta } from '@main/platform/sqlite/schema/common'

export class ModelRepository {
  constructor(private readonly store: SqliteDatabase, private readonly cipher: CredentialCipher) {}

  list(db: ElecKoiDatabase = this.store.db): ModelConfig[] {
    const active = db.select().from(modelConfigMeta).where(eq(modelConfigMeta.id, 'default')).get()?.activeConfigId
    return db.select().from(modelConfigs).orderBy(asc(modelConfigs.id)).all()
      .sort((a, b) => Number(b.id === active) - Number(a.id === active))
      .map((row) => ({ id: row.id, name: row.name, provider: normalizeProvider(row.provider), api_key: this.cipher.decrypt(row.apiKey),
        base_url: row.baseUrl, proxy_url: row.proxyUrl, model: row.model, model_options: readModelOptions(row.id, row.modelOptionsJson),
        custom_headers: parseJsonObject(row.customHeadersJson) as Record<string, string>, supports_tools: row.supportsTools === null ? null : !!row.supportsTools,
        enabled: !!row.enabled, image_settings: parseJsonObject(row.imageSettingsJson), api_format: storageApiFormat(row.apiFormat) }))
  }

  save(input: { [K in keyof ModelConfig]?: ModelConfig[K] | undefined }, db?: ElecKoiDatabase): ModelConfig[] {
    const persist = (database: ElecKoiDatabase) => {
      const id = input.id?.trim() || randomUUID()
      const previous = database.select().from(modelConfigs).where(eq(modelConfigs.id, id)).get()
      const provider = normalizeProvider(input.provider?.trim() ?? previous?.provider ?? 'custom')
      const secret = input.api_key?.trim()
      const apiKey = secret === undefined ? previous?.apiKey ?? '' : previous && this.cipher.decrypt(previous.apiKey) === secret ? previous.apiKey : this.cipher.encrypt(secret)
      const row = {
        id,
        name: input.name?.trim() ?? previous?.name ?? defaultProviderName(provider),
        provider,
        apiKey,
        baseUrl: input.base_url?.trim() ?? previous?.baseUrl ?? defaultBaseUrl(provider),
        proxyUrl: input.proxy_url?.trim() ?? previous?.proxyUrl ?? '',
        model: input.model?.trim() ?? previous?.model ?? defaultModel(provider),
        modelOptionsJson: input.model_options
          ? JSON.stringify(normalizeModelOptions(input.model_options))
          : previous?.modelOptionsJson ?? JSON.stringify(defaultModelOptions(provider)),
        customHeadersJson: input.custom_headers ? JSON.stringify(input.custom_headers) : previous?.customHeadersJson ?? '{}',
        supportsTools: input.supports_tools === undefined ? previous?.supportsTools ?? null : input.supports_tools === null ? null : Number(input.supports_tools),
        enabled: input.enabled === undefined ? previous?.enabled ?? Number(!isImageProvider(provider)) : Number(input.enabled),
        imageSettingsJson: input.image_settings ? JSON.stringify(input.image_settings) : previous?.imageSettingsJson ?? JSON.stringify(defaultImageSettings(provider)),
        apiFormat: input.api_format ?? (previous ? storageApiFormat(previous.apiFormat) : defaultApiFormat(provider))
      }
      if (JSON.stringify(previous) !== JSON.stringify(row)) database.insert(modelConfigs).values(row).onConflictDoUpdate({ target: modelConfigs.id, set: row }).run()
      const active = database.select().from(modelConfigMeta).where(eq(modelConfigMeta.id, 'default')).get()
      if (!active) database.insert(modelConfigMeta).values({ id: 'default', activeConfigId: id }).run()
    }
    if (db) {
      persist(db)
      return modelConfigSchema.array().parse(this.list(db))
    }
    return this.store.withWriteTx((database) => {
      persist(database)
      return modelConfigSchema.array().parse(this.list(database))
    })
  }

  delete(id: string): ModelConfig[] {
    return this.store.withWriteTx((database) => {
      database.delete(modelConfigs).where(eq(modelConfigs.id, id)).run()
      const active = database.select().from(modelConfigMeta).where(eq(modelConfigMeta.id, 'default')).get()
      if (active?.activeConfigId === id) database.update(modelConfigMeta).set({ activeConfigId: database.select({ id: modelConfigs.id }).from(modelConfigs).orderBy(asc(modelConfigs.id)).get()?.id ?? '' }).where(eq(modelConfigMeta.id, 'default')).run()
      return modelConfigSchema.array().parse(this.list(database))
    })
  }

  deleteProvider(provider: ModelProviderId): ModelConfig[] {
    const normalized = normalizeProvider(provider)
    if (normalized === 'custom' || normalized === 'deepseek') {
      throw new Error('固定模型入口不能删除。')
    }
    return this.store.withWriteTx((database) => {
      database.delete(modelConfigs).where(eq(modelConfigs.provider, normalized)).run()
      const active = database.select().from(modelConfigMeta).where(eq(modelConfigMeta.id, 'default')).get()
      const activeStillExists = active?.activeConfigId
        ? database.select({ id: modelConfigs.id }).from(modelConfigs).where(eq(modelConfigs.id, active.activeConfigId)).get()
        : undefined
      if (active && !activeStillExists) {
        database.update(modelConfigMeta)
          .set({ activeConfigId: database.select({ id: modelConfigs.id }).from(modelConfigs).orderBy(asc(modelConfigs.id)).get()?.id ?? '' })
          .where(eq(modelConfigMeta.id, 'default'))
          .run()
      }
      return modelConfigSchema.array().parse(this.list(database))
    })
  }

  ensureDefault(): void {
    if (!this.store.db.select({ id: modelConfigs.id }).from(modelConfigs).get()) {
      this.save({
        id: 'deepseek-default',
        name: 'DeepSeek',
        provider: 'deepseek',
        base_url: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        model_options: [
          { id: 'deepseek-chat', name: 'deepseek-chat' },
          { id: 'deepseek-reasoner', name: 'deepseek-reasoner' }
        ],
        api_format: 'responses'
      })
    }
  }

  resolve(selection: ActiveModelSelection, systemPrompt: string): RuntimeModelSettings {
    const all = this.list().filter((item) => item.enabled !== false && !isImageProvider(item.provider))
    const id = selection.config_id
    const config = all.find((item) => item.id === id) ?? all[0]
    if (!config) throw new Error('请先在设置里添加可用的聊天模型。')
    const model = config.id === id && selection.model.trim() ? selection.model.trim() : config.model.trim()
    return this.resolveConfig(config, model, systemPrompt)
  }

  resolveExact(configId: string, modelId: string, systemPrompt: string): RuntimeModelSettings | undefined {
    const normalizedId = configId.trim()
    if (!normalizedId) return undefined
    const config = this.list().find((item) => (
      item.id === normalizedId && item.enabled !== false && !isImageProvider(item.provider)
    ))
    if (!config) return undefined
    return this.resolveConfig(config, modelId.trim() || config.model.trim(), systemPrompt)
  }

  private resolveConfig(config: ModelConfig, model: string, systemPrompt: string): RuntimeModelSettings {
    if (!config?.api_key) throw new Error('请先在设置里填写模型 API Key。')
    if (!model) throw new Error('请先在设置里选择模型。')
    const option = config.model_options.find((item) => item.id === model)
    const baseUrl = config.base_url.trim() || defaultBaseUrl(config.provider)
    if (!baseUrl) throw new Error('请先在设置里填写 API Base URL。')
    const contextWindow = option?.contextWindowTokens ?? (isOfficialDeepSeek(config.provider, baseUrl) ? 1_000_000 : 272_000)
    if (option?.autoCompactTokenLimit !== null && option?.autoCompactTokenLimit !== undefined && option.autoCompactTokenLimit > contextWindow) {
      throw new Error('自动压缩阈值不能超过当前模型的上下文窗口。')
    }
    if (option?.maxOutputTokens !== null && option?.maxOutputTokens !== undefined && option.maxOutputTokens > contextWindow) {
      throw new Error('单次最大输出不能超过当前模型的上下文窗口。')
    }
    return {
      apiKey: config.api_key,
      baseUrl,
      model,
      systemPrompt,
      apiFormat: runtimeApiFormat(config.api_format),
      customHeaders: config.custom_headers ?? {},
      contextWindow,
      ...(option?.autoCompactTokenLimit ? { autoCompactTokenLimit: option.autoCompactTokenLimit } : {}),
      ...(option?.maxOutputTokens ? { maxTokens: option.maxOutputTokens } : {}),
      ...(option?.temperature !== null && option?.temperature !== undefined ? { temperature: option.temperature } : {}),
      ...(option?.topP !== null && option?.topP !== undefined ? { topP: option.topP } : {}),
      ...(option?.reasoningEffort?.trim() ? { reasoningEffort: option.reasoningEffort.trim().toLowerCase() } : {}),
      supportsImageInput: option?.supportsImageInput === true,
      ...(config.proxy_url.trim() ? { proxyUrl: config.proxy_url.trim() } : {})
    }
  }
}

function normalizeProvider(provider: string): ModelProviderId {
  const normalized = provider.trim().toLowerCase()
  if (['custom', 'deepseek', 'zhipu', 'zai', 'moonshot', 'openai_image', 'novelai_image'].includes(normalized)) return normalized as ModelProviderId
  throw new Error(`未知模型提供商：${provider || '(空)'}`)
}

function normalizeModelOptions(items: unknown[]): ModelOption[] {
  const unique = new Map<string, ModelOption>()
  for (const value of items) {
    const item = modelOptionSchema.parse(value)
    unique.set(item.id, item)
  }
  return [...unique.values()]
}

function readModelOptions(configId: string, value: string): ModelOption[] {
  try {
    return normalizeModelOptions(parseJsonArray<unknown>(value))
  } catch (error) {
    throw new Error(`模型配置“${configId}”的模型列表不是当前对象格式，请清理这条开发期旧数据。`, { cause: error })
  }
}

function storageApiFormat(value: string): ModelApiFormat {
  switch (value.trim().toLowerCase()) {
    case 'chat_completions':
    case 'responses':
    case 'anthropic_messages':
    case 'google_gemini':
      return value.trim().toLowerCase() as ModelApiFormat
    default:
      throw new Error(`未知模型接口格式：${value || '(空)'}`)
  }
}

function runtimeApiFormat(value: string | null | undefined): RuntimeModelSettings['apiFormat'] {
  switch ((value || '').trim().toLowerCase()) {
    case 'chat_completions':
      return 'openai-completions'
    case 'anthropic_messages':
      return 'anthropic-messages'
    case 'google_gemini':
      return 'google-generative-ai'
    case 'responses':
      return 'openai-responses'
    default:
      throw new Error(`未知模型接口格式：${value || '(空)'}`)
  }
}

function defaultBaseUrl(provider: string): string {
  switch (normalizeProvider(provider)) {
    case 'deepseek': return 'https://api.deepseek.com'
    case 'zhipu': return 'https://open.bigmodel.cn/api/paas/v4'
    case 'zai': return 'https://api.z.ai/api/paas/v4'
    case 'moonshot': return 'https://api.moonshot.cn/v1'
    case 'openai_image': return 'https://api.openai.com/v1'
    case 'novelai_image': return 'https://image.novelai.net'
    default: return ''
  }
}

function defaultApiFormat(provider: ModelProviderId): ModelApiFormat {
  return provider === 'custom' || provider === 'deepseek' ? 'responses' : 'chat_completions'
}

function defaultProviderName(provider: ModelProviderId): string {
  switch (provider) {
    case 'deepseek': return 'DeepSeek'
    case 'openai_image': return 'OpenAI Images'
    case 'novelai_image': return 'NovelAI'
    default: return ''
  }
}

function defaultModel(provider: ModelProviderId): string {
  switch (provider) {
    case 'deepseek': return 'deepseek-chat'
    case 'openai_image': return 'gpt-image-2'
    case 'novelai_image': return 'nai-diffusion-4-5-full'
    default: return ''
  }
}

function defaultModelOptions(provider: ModelProviderId): ModelOption[] {
  if (provider === 'deepseek') return [
    { id: 'deepseek-chat', name: 'deepseek-chat' },
    { id: 'deepseek-reasoner', name: 'deepseek-reasoner' }
  ]
  const model = defaultModel(provider)
  return model ? [{ id: model, name: model }] : []
}

function defaultImageSettings(provider: ModelProviderId): Record<string, unknown> {
  if (provider === 'openai_image') return { width: 1024, height: 1536, quality: 'auto', background: 'auto' }
  if (provider === 'novelai_image') return { width: 832, height: 1216, steps: 28, scale: 5, sampler: 'k_euler_ancestral' }
  return {}
}

function isImageProvider(provider: string): boolean {
  const normalized = normalizeProvider(provider)
  return normalized === 'openai_image' || normalized === 'novelai_image'
}

function isOfficialDeepSeek(provider: string, baseUrl: string): boolean {
  if (normalizeProvider(provider) !== 'deepseek' && normalizeProvider(provider) !== 'custom') return false
  try { return new URL(baseUrl).hostname.toLowerCase() === 'api.deepseek.com' } catch { return false }
}

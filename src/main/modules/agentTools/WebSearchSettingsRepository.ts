import { eq } from 'drizzle-orm'
import type { CredentialCipher } from '@main/platform/electron/CredentialCipher'
import { type ElecKoiDatabase, SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import { globalToolConfig } from '@main/platform/sqlite/schema/common'
import {
  webSearchSettingsSchema,
  webSearchSettingsUpdateSchema,
  type WebSearchSettings,
  type WebSearchSettingsUpdate
} from '@shared/contracts/agent/webSearch'

const SINGLETON_ID = 1

interface StoredGlobalToolConfig {
  version: 1
  webSearch: {
    mode: WebSearchSettings['mode']
    maxResults: WebSearchSettings['maxResults']
    tavilyApiKey: string
  }
  [key: string]: unknown
}

export interface WebSearchRuntimeSettings {
  mode: WebSearchSettings['mode']
  maxResults: WebSearchSettings['maxResults']
  tavilyApiKey: string
}

export class WebSearchSettingsRepository {
  constructor(private readonly store: SqliteDatabase, private readonly cipher: CredentialCipher) {}

  read(db: ElecKoiDatabase = this.store.db): WebSearchSettings {
    const stored = this.readStored(db)
    return webSearchSettingsSchema.parse({
      mode: stored.webSearch.mode,
      maxResults: stored.webSearch.maxResults,
      apiKeyConfigured: stored.webSearch.tavilyApiKey.length > 0
    })
  }

  update(input: WebSearchSettingsUpdate): WebSearchSettings {
    const parsed = webSearchSettingsUpdateSchema.parse(input)
    return this.store.withWriteTx((database) => {
      const stored = this.readStored(database)
      stored.webSearch.mode = parsed.mode
      stored.webSearch.maxResults = parsed.maxResults
      this.writeStored(stored, database)
      return this.read(database)
    })
  }

  saveTavilyApiKey(apiKey: string): WebSearchSettings {
    const normalized = validateApiKey(apiKey)
    return this.store.withWriteTx((database) => {
      const stored = this.readStored(database)
      stored.webSearch.tavilyApiKey = this.cipher.encrypt(normalized)
      this.writeStored(stored, database)
      return this.read(database)
    })
  }

  removeTavilyApiKey(): WebSearchSettings {
    return this.store.withWriteTx((database) => {
      const stored = this.readStored(database)
      stored.webSearch.tavilyApiKey = ''
      this.writeStored(stored, database)
      return this.read(database)
    })
  }

  runtimeSettings(db: ElecKoiDatabase = this.store.db): WebSearchRuntimeSettings {
    const stored = this.readStored(db)
    return {
      mode: stored.webSearch.mode,
      maxResults: stored.webSearch.maxResults,
      tavilyApiKey: stored.webSearch.tavilyApiKey ? this.cipher.decrypt(stored.webSearch.tavilyApiKey) : ''
    }
  }

  tavilyApiKey(db: ElecKoiDatabase = this.store.db): string {
    return this.runtimeSettings(db).tavilyApiKey
  }

  private readStored(db: ElecKoiDatabase): StoredGlobalToolConfig {
    const row = db.select().from(globalToolConfig).where(eq(globalToolConfig.singletonId, SINGLETON_ID)).get()
    if (!row) return defaultStoredConfig()
    let value: unknown
    try {
      value = JSON.parse(row.payloadJson)
    } catch (error) {
      throw new Error('全局工具配置损坏，请清理开发数据库后重试。', { cause: error })
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('全局工具配置不是当前对象格式，请清理开发数据库后重试。')
    }
    const root = value as Record<string, unknown>
    const webSearch = root.webSearch
    if (webSearch === undefined) return { ...root, ...defaultStoredConfig() }
    if (!webSearch || typeof webSearch !== 'object' || Array.isArray(webSearch)) {
      throw new Error('联网搜索配置不是当前对象格式，请清理开发数据库后重试。')
    }
    const source = webSearch as Record<string, unknown>
    const settings = webSearchSettingsSchema.parse({
      mode: source.mode,
      maxResults: source.maxResults,
      apiKeyConfigured: Boolean(source.tavilyApiKey)
    })
    if (typeof source.tavilyApiKey !== 'string') throw new Error('Tavily 凭据格式无效，请重新填写。')
    return {
      ...root,
      version: 1,
      webSearch: {
        mode: settings.mode,
        maxResults: settings.maxResults,
        tavilyApiKey: source.tavilyApiKey
      }
    }
  }

  private writeStored(value: StoredGlobalToolConfig, db: ElecKoiDatabase): void {
    const row = {
      singletonId: SINGLETON_ID,
      payloadJson: JSON.stringify(value),
      updatedAt: new Date().toISOString()
    }
    db.insert(globalToolConfig).values(row).onConflictDoUpdate({
      target: globalToolConfig.singletonId,
      set: { payloadJson: row.payloadJson, updatedAt: row.updatedAt }
    }).run()
  }
}

function defaultStoredConfig(): StoredGlobalToolConfig {
  return {
    version: 1,
    webSearch: { mode: 'provider_native', maxResults: 5, tavilyApiKey: '' }
  }
}

function validateApiKey(value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error('请先填写 Tavily API Key。')
  if (normalized.length > 2_048) throw new Error('Tavily API Key 长度无效。')
  return normalized
}

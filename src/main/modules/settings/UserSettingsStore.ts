import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { SqliteDatabase, type ElecKoiDatabase } from '@main/platform/sqlite/SqliteDatabase'
import { desktopPreferences as settings } from '@main/platform/sqlite/schema/desktop'
import {
  DEFAULT_CHAT_DISPLAY_PREFERENCES,
  settingSchemas,
  type SettingKey
} from '@shared/contracts/settings/schemas'
import { type LocalMediaStore, type PreparedLocalMedia } from '@main/platform/filesystem/LocalMediaStore'

type SettingValue<TKey extends SettingKey> = z.output<(typeof settingSchemas)[TKey]>

const defaults: { [TKey in SettingKey]: SettingValue<TKey> } = {
  'appearance.mode': 'light',
  'appearance.ui': {},
  'chat.display': DEFAULT_CHAT_DISPLAY_PREFERENCES,
  'locale.current': 'zh-CN',
  'models.active': {
    capability: 'chat',
    config_id: '',
    model: '',
    parameters: { stream: true, temperature: 1, top_p: 1 }
  }
}

export class UserSettingsStore {
  constructor(private readonly store: SqliteDatabase, private readonly mediaAssets: LocalMediaStore) {}

  read<TKey extends SettingKey>(key: TKey): SettingValue<TKey> {
    const schema = settingSchemas[key]
    const row = this.store.db.select().from(settings).where(eq(settings.key, key)).get()
    if (row === undefined) return defaults[key]
    try {
      return schema.parse(JSON.parse(row.valueJson)) as SettingValue<TKey>
    } catch {
      return defaults[key]
    }
  }

  write<TKey extends SettingKey>(
    key: TKey,
    value: SettingValue<TKey>,
    database: ElecKoiDatabase = this.store.db
  ): SettingValue<TKey> {
    let parsed = settingSchemas[key].parse(value) as SettingValue<TKey>
    const pending: PreparedLocalMedia[] = []
    if (key === 'appearance.ui') {
      parsed = this.prepareAppearanceMedia(parsed as SettingValue<'appearance.ui'>, pending) as SettingValue<TKey>
    }
    const current = database.select().from(settings).where(eq(settings.key, key)).get()
    try {
      if (current?.valueJson !== JSON.stringify(parsed)) {
        database.insert(settings).values({
          key,
          valueJson: JSON.stringify(parsed),
          updatedAt: new Date().toISOString()
        }).onConflictDoUpdate({
          target: settings.key,
          set: { valueJson: JSON.stringify(parsed), updatedAt: new Date().toISOString() }
        }).run()
      }
      for (const media of pending) media.commit()
      return parsed
    } catch (error) {
      for (const media of pending) media.rollback()
      throw error
    }
  }

  private prepareAppearanceMedia(
    value: SettingValue<'appearance.ui'>,
    pending: PreparedLocalMedia[]
  ): SettingValue<'appearance.ui'> {
    const wallpaper = isRecord(value.global_chat_wallpaper) ? value.global_chat_wallpaper : undefined
    if (!wallpaper) return value
    const media = this.mediaAssets!.prepareImage('appearance/global', 'chat-background', typeof wallpaper.image === 'string' ? wallpaper.image : '')
    pending.push(media)
    return {
      ...value,
      global_chat_wallpaper: { ...wallpaper, image: media.reference }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

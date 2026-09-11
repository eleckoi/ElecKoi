import { text, sqliteTable } from 'drizzle-orm/sqlite-core'

/** Device preferences are outside the common business schema. */
export const desktopPreferences = sqliteTable('desktop_preferences', {
  key: text('key').primaryKey(),
  valueJson: text('valueJson').notNull(),
  updatedAt: text('updatedAt').notNull()
})

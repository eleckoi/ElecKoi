import { commonTables } from './common'
import { desktopPreferences } from './desktop'

export const schema = { ...commonTables, desktopPreferences }
export type DatabaseSchema = typeof schema

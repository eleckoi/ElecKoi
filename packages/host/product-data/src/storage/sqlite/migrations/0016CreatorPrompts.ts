import type Database from 'better-sqlite3'
import { settingLibraryStoredEntrySchema } from '@shared/contracts/settingLibrary/schemas'
import { upgradeLegacyCreatorPrompt } from '@shared/foundation/legacyCreatorPrompts'

// RETIRE WHEN: 正式停止支持 schema v15 及更早数据库直接升级后，删除本步骤、
// installSchema 中的 import/登记和 v15 升级/回滚回归，保留剩余连续原子迁移链。
// 共用 upgradeLegacyCreatorPrompt 还须等预设 v1/v2 文件导入退役后才能删除。
// 只在 v15→v16 事务执行；保留正文、编号、目录、顺序和版本，仅整理 creator 条目。
export const migration0016 = {
  fromVersion: 15, toVersion: 16, name: 'creator-prompts', acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    for (const table of ['agent_preset_entries', 'agent_preset_version_entries']) {
      const rows = database.prepare(`SELECT rowid, payloadJson FROM ${table}
        WHERE presetId IN (SELECT id FROM agent_presets WHERE purpose='creator')`).all() as { rowid: number; payloadJson: string }[]
      const update = database.prepare(`UPDATE ${table} SET payloadJson=? WHERE rowid=?`)
      for (const row of rows) {
        const entry = settingLibraryStoredEntrySchema.parse(JSON.parse(row.payloadJson))
        const next = JSON.stringify(upgradeLegacyCreatorPrompt(entry))
        if (next !== row.payloadJson) update.run(next, row.rowid)
      }
    }
  },
} as const

import type Database from 'better-sqlite3'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

export const regexLibrariesSql = "CREATE TABLE IF NOT EXISTS `regex_libraries` (`scope` TEXT NOT NULL, `ownerId` TEXT NOT NULL, `characterId` TEXT, `presetId` TEXT, `enabled` INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(`scope`, `ownerId`), FOREIGN KEY(`characterId`) REFERENCES `characters`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , FOREIGN KEY(`presetId`) REFERENCES `agent_presets`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , CHECK (`enabled` IN (0, 1)), CHECK ((`scope` = 'global' AND `ownerId` = '' AND `characterId` IS NULL AND `presetId` IS NULL) OR (`scope` = 'character' AND `characterId` IS NOT NULL AND `ownerId` = `characterId` AND `ownerId` <> '' AND `presetId` IS NULL) OR (`scope` = 'preset' AND `presetId` IS NOT NULL AND `ownerId` = `presetId` AND `ownerId` <> '' AND `characterId` IS NULL)))"

/** 未设置整体开关的旧库保持启用，条目自身启停不变。 */
// RETIRE WHEN: both 0012 and the development-v12 repair no longer need this
// conversion. Remove this helper and their imports together; keep current regex enablement.
export function addRegexLibraryEnablement(database: Database.Database): void {
  database.exec(regexLibrariesSql)
  const rows = database.prepare("SELECT rowid,stateJson FROM editor_library_versions WHERE kind='regex'").all() as Array<{ rowid: number; stateJson: string }>
  const update = database.prepare('UPDATE editor_library_versions SET stateJson=? WHERE rowid=?')
  for (const row of rows) {
    const state = JSON.parse(row.stateJson)
    if (!state || !Array.isArray(state.versions)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '正则配置版本格式无效，未修改数据。', { what: '正则配置版本' })
    let changed = false
    for (const version of state.versions) {
      const content = JSON.parse(version.content)
      if (!content || !Array.isArray(content.rules)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '正则版本内容无效，未修改数据。', { what: '正则版本内容' })
      if (Object.hasOwn(content, 'enabled') && typeof content.enabled !== 'boolean') throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '正则版本整体启停无效，未修改数据。', { what: '正则版本整体启停' })
      if (!Object.hasOwn(content, 'enabled')) { version.content = JSON.stringify({ enabled: true, ...content }); changed = true }
    }
    if (changed) update.run(JSON.stringify(state), row.rowid)
  }
}

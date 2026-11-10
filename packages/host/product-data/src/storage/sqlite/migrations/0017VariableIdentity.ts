import type Database from 'better-sqlite3'
import { variableItemConfigSchema, variableObjectConfigSchema } from '@shared/contracts/variables/schemas'
import { createVariableIdentities, type VariableIdentityConfig } from '@shared/foundation/variables/identity'
import { commonSchemaSql } from './commonSchemaSql'

/** Establish an old save baseline from its associated version; retain other fields as runtime state. */
export function legacyVariableIdentityConfig(database: Database.Database, conversationId: string, binding?: { characterId: string; variableVersionId: string }): VariableIdentityConfig {
  const row = binding ?? database.prepare(`SELECT s.characterId,c.variableVersionId FROM chat_sessions s
    JOIN agent_conversations c ON c.id=s.id WHERE s.id=?`).get(conversationId) as { characterId: string; variableVersionId: string } | undefined
  if (!row) return { versionId: '', objects: [], variables: [] }
  const read = (table: string) => database.prepare(`SELECT payloadJson FROM ${table} WHERE characterId=? AND versionId=? ORDER BY sortIndex`)
    .all(row.characterId, row.variableVersionId) as { payloadJson: string }[]
  return { versionId: row.variableVersionId,
    // Disabled definitions still own their saved values; they must not become
    // runtime additions merely because the live directory currently hides them.
    objects: read('variable_config_objects').map(item => ({ ...variableObjectConfigSchema.parse(JSON.parse(item.payloadJson)), enabled: true })),
    variables: read('variable_config_variables').map(item => ({ ...variableItemConfigSchema.parse(JSON.parse(item.payloadJson)), enabled: true })) }
}

// RETIRE WHEN: schema <=16 upgrades and archive v1/v2 imports both retire.
export function upgradeLegacyOpeningIdentities(database: Database.Database, characterId: string, payloadJson: string): string {
  const payload = JSON.parse(payloadJson) as { options?: Array<{ variableVersionId?: string; initialVariableStateJson?: string; initialVariableIdentityJson?: string }> }
  for (const option of payload.options ?? []) {
    const config = legacyVariableIdentityConfig(database, '', { characterId, variableVersionId: option.variableVersionId || '' })
    option.initialVariableIdentityJson = JSON.stringify(createVariableIdentities(JSON.parse(option.initialVariableStateJson || '{}'), config, 'runtime'))
  }
  return JSON.stringify(payload)
}

// RETIRE WHEN: Stop supporting direct upgrades from schema v16 and older; remove
// this step, its registration and upgrade/rollback tests together. The legacy
// archive conversion remains until conversation archive v1/v2 import retires.
export const migration0017 = {
  fromVersion: 16, toVersion: 17, name: 'variable-identity', acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    const configs = new Map<string, VariableIdentityConfig>()
    const config = (id: string) => {
      if (!configs.has(id)) configs.set(id, legacyVariableIdentityConfig(database, id))
      return configs.get(id)!
    }
    for (const [table, owner, rawColumn, identityColumn] of [
      ['chat_session_variable_states', 'sessionId', 'stateJson', 'identityJson'],
      ['conversation_state_snapshots', 'conversationId', 'variableStateJson', 'variableIdentityJson']
    ] as const) {
      database.exec(`CREATE TEMP TABLE variable_identity_upgrade_rows AS SELECT rowid AS upgradeRowId,* FROM ${table}`)
      database.exec('CREATE UNIQUE INDEX temp.variable_identity_upgrade_cursor ON variable_identity_upgrade_rows(upgradeRowId)')
      const sql = commonSchemaSql.split('\n').find(line => line.startsWith(`CREATE TABLE IF NOT EXISTS \`${table}\``))!
      database.exec(`DROP TABLE ${table}`)
      database.exec(sql)
      const first = database.prepare('SELECT * FROM temp.variable_identity_upgrade_rows ORDER BY upgradeRowId LIMIT 1')
      const next = database.prepare('SELECT * FROM temp.variable_identity_upgrade_rows WHERE upgradeRowId>? ORDER BY upgradeRowId LIMIT 1')
      let value = first.get() as Record<string, string | number | null> | undefined
      while (value) {
        const { upgradeRowId, ...row } = value
        const raw = row[rawColumn]
        row[identityColumn] = JSON.stringify(raw === null ? {} : createVariableIdentities(JSON.parse(String(raw)), config(String(row[owner])), 'runtime'))
        const keys = Object.keys(row)
        database.prepare(`INSERT INTO ${table} (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
          .run(...keys.map(key => row[key]))
        value = next.get(upgradeRowId) as typeof value
      }
      database.exec('DROP TABLE temp.variable_identity_upgrade_rows')
    }
    database.exec('CREATE INDEX `index_conversation_state_snapshots_session_turn` ON `conversation_state_snapshots` (`conversationId`, `runtimeSessionId`, `turn`, `phase`)')
    const openings = database.prepare(`SELECT o.rowid,o.payloadJson,s.characterId FROM agent_openings o JOIN chat_sessions s ON s.id=o.conversationId`).all() as { rowid: number; payloadJson: string; characterId: string }[]
    const updateOpening = database.prepare('UPDATE agent_openings SET payloadJson=? WHERE rowid=?')
    for (const row of openings) updateOpening.run(upgradeLegacyOpeningIdentities(database, row.characterId, row.payloadJson), row.rowid)
    // The superseded development blacklist is not part of the identity model.
    database.prepare("DELETE FROM variable_config_version_contents WHERE kind='removed_paths'").run()
  }
} as const

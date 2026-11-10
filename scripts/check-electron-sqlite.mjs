import { spawnSync } from 'node:child_process'
import electron from 'electron'

const executable = electron

const probe = [
  "const Database = require('better-sqlite3')",
  "const db = new Database(':memory:')",
  "db.exec(require('node:fs').readFileSync('apps/desktop/resources/database/eleckoi-common-schema-v1.sql', 'utf8'))",
  "const tables = db.prepare(\"SELECT count(*) AS n FROM sqlite_master WHERE type='table'\").get().n",
  "const views = db.prepare(\"SELECT count(*) AS n FROM sqlite_master WHERE type='view'\").get().n",
  "const userVersion = db.pragma('user_version', { simple: true })",
  "if (tables !== 49 || views !== 2 || userVersion !== 17) { console.error(`SQLite schema contract mismatch: ${tables} tables, ${views} views, user_version ${userVersion}.`); process.exit(2) }",
  "if (db.pragma('table_info(chat_sessions)').some(column => column.name === 'historyUserMessageCount')) { console.error('Retired user counter is still present.'); process.exit(4) }",
  "if (db.pragma('table_info(characters)').some(column => column.name === 'showOpening')) { console.error('Retired character opening flag is still present.'); process.exit(7) }",
  "if (db.pragma('table_info(agent_responses)').some(column => ['variableStateJson','storedRegexRulesJson'].includes(column.name)) || db.prepare(\"SELECT 1 FROM sqlite_master WHERE name='agent_setting_snapshots'\").get()) { console.error('Retired response state storage is still present.'); process.exit(5) }",
  "if (db.pragma('table_info(conversation_state_snapshots)').length !== 10 || !db.pragma('table_info(conversation_state_snapshots)').some(column => column.name === 'variableIdentityJson' && column.notnull === 1) || !db.pragma('table_info(chat_session_variable_states)').some(column => column.name === 'identityJson' && column.notnull === 1)) { console.error('Conversation state schema mismatch.'); process.exit(6) }",
  "if (db.pragma('foreign_keys', { simple: true }) !== 1 || db.pragma('foreign_key_check').length || db.pragma('integrity_check', { simple: true }) !== 'ok') process.exit(3)",
  'db.close()',
].join(';')

const result = spawnSync(executable, ['-e', probe], {
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8'
})

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Electron SQLite ABI probe failed.\n')
  process.exit(result.status ?? 1)
}

console.log('Electron SQLite check passed: native ABI, 49 business tables, 2 views, user_version 17, foreign keys and integrity.')

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const executable = process.platform === 'win32'
  ? join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe')
  : join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron')

const probe = [
  "const Database = require('better-sqlite3')",
  "const db = new Database(':memory:')",
  "db.exec(require('node:fs').readFileSync('resources/database/eleckoi-common-schema-v1.sql', 'utf8'))",
  "const tables = db.prepare(\"SELECT count(*) AS n FROM sqlite_master WHERE type='table'\").get().n",
  "const views = db.prepare(\"SELECT count(*) AS n FROM sqlite_master WHERE type='view'\").get().n",
  "if (tables !== 51 || views !== 2 || db.pragma('user_version', { simple: true }) !== 1) process.exit(2)",
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

console.log('Electron SQLite check passed: native ABI, 51 common tables, 2 views, foreign keys and integrity.')

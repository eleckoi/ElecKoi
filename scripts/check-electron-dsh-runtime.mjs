import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const executable = process.platform === 'win32'
  ? join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe')
  : join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron')

const result = spawnSync(executable, [join(process.cwd(), 'scripts', 'probe-dsh-runtime.mjs')], {
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
  timeout: 30_000
})

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Electron DSH runtime handshake failed.\n')
  process.exit(result.status ?? 1)
}

process.stdout.write(result.stdout)

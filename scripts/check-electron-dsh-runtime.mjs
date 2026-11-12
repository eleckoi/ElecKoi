import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import electron from 'electron'

const executable = electron

const result = spawnSync(executable, [join(process.cwd(), 'scripts', 'probe-dsh-runtime.mjs')], {
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
  timeout: 90_000
})

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Electron DSH runtime handshake failed.\n')
  process.exit(result.status ?? 1)
}

process.stdout.write(result.stdout)

const pluginHost = spawnSync(executable, [join(process.cwd(), 'scripts', 'probe-dsh-desktop-plugin-host.mjs')], {
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
  timeout: 90_000
})

if (pluginHost.status !== 0) {
  process.stderr.write(pluginHost.stderr || pluginHost.stdout || 'Electron DSH plugin Host handshake failed.\n')
  process.exit(pluginHost.status ?? 1)
}

process.stdout.write(pluginHost.stdout)

const nativeAuthor = spawnSync(executable, [join(process.cwd(), 'scripts', 'probe-dsh-native-author.mjs')], {
  cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 120_000,
})
if (nativeAuthor.status !== 0) {
  process.stderr.write(nativeAuthor.stderr || nativeAuthor.stdout || 'Electron native author Host check failed.\n')
  process.exit(nativeAuthor.status ?? 1)
}
process.stdout.write(nativeAuthor.stdout)

const regeneration = spawnSync(executable, [join(process.cwd(), 'scripts', 'probe-dsh-regeneration.mjs')], {
  cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 90_000,
})
if (regeneration.status !== 0) {
  process.stderr.write(regeneration.stderr || regeneration.stdout || 'Electron DSH regeneration check failed.\n')
  process.exit(regeneration.status ?? 1)
}
process.stdout.write(regeneration.stdout)

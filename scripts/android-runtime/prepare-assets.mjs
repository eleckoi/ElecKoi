import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repo = resolve(import.meta.dirname, '../..')
const build = resolve(repo, 'build/android-runtime')
function run(command, args) {
  const result = spawnSync(command, args, { cwd: repo, stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Android asset preparation failed: ${command} ${args[0]}`)
}
run(process.execPath, ['scripts/android-runtime/prepare-closure.mjs'])
run(process.execPath, ['scripts/android-runtime/check-profile-bundles.mjs'])
run(process.execPath, ['scripts/android-runtime/download-runtime.mjs'])
run('python', ['scripts/android-runtime/prepare-glibc-probe.py', '--production'])
run('python', ['scripts/android-runtime/package-runtime.py'])
run('python', ['scripts/android-runtime/verify-hardlink-free.py', '--source', `${build}/downloads/ubuntu-base-24.04.4-arm64.tar.gz`,
  '--archive', `${build}/archives/rootfs.tar.gz`, '--report', `${build}/rootfs-verification.json`,
  '--glibc-directory', `${build}/glibc-probe/portable`])
const manifest = JSON.parse(readFileSync(resolve(repo, 'apps/android-host/package.json'), 'utf8'))
run(process.execPath, ['scripts/android-runtime/assemble-assets.mjs', '--rootfs', `${build}/archives/rootfs.tar.gz`,
  '--node', `${build}/archives/node.tar.gz`, '--git', `${build}/archives/git.tar.gz`, '--app', `${build}/archives/app.tar.gz`,
  '--version', `${manifest.version}-android-dev-dsh-0.2.2-rc.1`, '--output', `${build}/assets`])
run(process.execPath, ['scripts/android-runtime/check-runtime.mjs'])

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { canReuseInstalledRuntime, rendererTransferScript, runtimeInputs } from '../install-development.mjs'

it('keeps the renderer fast path for UI changes and invalidates it for changed base inputs', () => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-android-dev-install-'))
  const write = (file, text) => {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  const git = args => execFileSync('git', args, { cwd: root, windowsHide: true })
  try {
    git(['init', '-q'])
    write('apps/web/src/chat.css', '.chat { gap: 4px }')
    write('apps/android-host/src/index.ts', 'export const value = 1')
    write('apps/android/app/src/main/AndroidManifest.xml', '<manifest/>')
    write('patches/example.patch', 'original')
    write('pnpm-lock.yaml', 'dependencies: {}')
    write('node_modules/.pnpm/lock.yaml', 'dependencies: {}')
    write('.gitignore', 'node_modules/\n')
    git(['add', '.'])
    const initial = runtimeInputs(root)
    write('apps/web/src/chat.css', '.chat { gap: 8px }')
    write('apps/web/src/avatar.jsx', 'export default function Avatar() {}')
    write('apps/web/tests/chat.test.jsx', 'test()')
    expect(runtimeInputs(root)).toBe(initial)

    write('patches/example.patch', 'modified')
    expect(runtimeInputs(root)).not.toBe(initial)
    write('patches/example.patch', 'original')
    write('node_modules/.pnpm/lock.yaml', 'dependencies: { changed: 1 }')
    expect(runtimeInputs(root)).not.toBe(initial)
    write('node_modules/.pnpm/lock.yaml', 'dependencies: {}')
    rmSync(join(root, 'apps/android-host/src/index.ts'))
    expect(runtimeInputs(root)).not.toBe(initial)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('uses an installation receipt only for the same APK path and the same base inputs', () => {
  const installedPath = '/data/app/current/com.eleckoi.app.dev-a/base.apk'
  const receipt = { installedPath, runtimeInputs: 'same' }
  expect(canReuseInstalledRuntime(receipt, 'same', installedPath)).toBe(true)
  expect(canReuseInstalledRuntime(receipt, 'changed', installedPath)).toBe(false)
  expect(canReuseInstalledRuntime(receipt, 'same', installedPath.replace('current', 'other'))).toBe(false)
  expect(canReuseInstalledRuntime(null, 'same', installedPath)).toBe(false)
})

it('rejects shell syntax and paths outside the renderer cache naming scheme', () => {
  expect(() => rendererTransferScript('a'.repeat(64), '../outside', 'b'.repeat(64))).toThrow('Invalid Android development renderer identity')
  expect(() => rendererTransferScript('a'.repeat(64), 'renderer-' + 'b'.repeat(16), '| invalid')).toThrow('Invalid Android development renderer identity')
})

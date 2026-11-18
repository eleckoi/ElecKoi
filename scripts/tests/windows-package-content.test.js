import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { inspectWindowsArchive } from '../windows-package-content.mjs'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const libRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'))
const asar = libRequire('@electron/asar')
const { archToNodeCpu, isPackageCompatible } = libRequire('./out/util/archCompatibility.js')
const { Arch } = libRequire('builder-util')

it('uses the target architecture and npm positive/negative constraints', () => {
  expect(archToNodeCpu(Arch.x64)).toBe('x64')
  expect(archToNodeCpu(Arch.arm64)).toBe('arm64')
  expect(archToNodeCpu(Arch.armv7l)).toBe('arm')
  expect(isPackageCompatible({}, 'x64', 'win32')).toBe(true)
  expect(isPackageCompatible({ os: 'any', cpu: 'any' }, 'x64', 'win32')).toBe(true)
  expect(isPackageCompatible({ os: ['!linux'], cpu: ['!arm64'] }, 'x64', 'win32')).toBe(true)
  expect(isPackageCompatible({ os: ['win32', '!win32'] }, 'x64', 'win32')).toBe(false)
  expect(isPackageCompatible({ cpu: 'arm64' }, 'x64', 'win32')).toBe(false)
})

it('inspects actual nested package declarations, foreign prebuilds and compiler residue in ASAR', async () => {
  const root = await mkdtemp(join(tmpdir(), 'eleckoi-windows-content-'))
  try {
    const input = join(root, 'input')
    const write = async (path, value) => {
      const parts = path.split('/')
      const filename = parts.pop()
      await mkdir(join(input, ...parts), { recursive: true })
      await writeFile(join(input, ...parts, filename), value)
    }
    const pe = Buffer.alloc(128)
    pe.write('MZ'); pe.writeUInt32LE(64, 60); pe.write('PE\0\0', 64); pe.writeUInt16LE(0x8664, 68)
    await write('node_modules/synthetic-native/package.json', JSON.stringify({ name: 'synthetic-native', cpu: ['x64'], os: ['win32'] }))
    await write('node_modules/synthetic-native/native.node', pe)
    await write('node_modules/synthetic-native/LICENSE', 'Synthetic license retained')
    await write('node_modules/synthetic-wasm/package.json', JSON.stringify({ name: 'synthetic-wasm' }))
    await write('node_modules/synthetic-wasm/runtime.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))
    const good = join(root, 'good.asar')
    await asar.createPackage(input, good)
    const report = inspectWindowsArchive(good, 'x64')
    expect(report.errors).toEqual([])
    expect(report.nativeFiles).toBe(1)
    expect(report.packages).toHaveLength(2)
    await write('node_modules/synthetic-js/node_modules/synthetic-linux/package.json', JSON.stringify({ name: 'synthetic-linux', os: ['linux'] }))
    await write('node_modules/synthetic-native/prebuilds/linux-x64/native.node', Buffer.from([0x7f, 69, 76, 70, 0, 0, 0, 0]))
    await write('node_modules/better-sqlite3/build/Release/obj/compiler.iobj', 'Synthetic intermediate')
    pe.writeUInt16LE(0xaa64, 68)
    await write('node_modules/synthetic-native/prebuilds/win32-arm64/native.node', pe)
    const bad = join(root, 'bad.asar')
    await asar.createPackage(input, bad)
    const failures = inspectWindowsArchive(bad, 'x64').errors.join('\n')
    expect(failures).toContain('Wrong target cpu/os: node_modules/synthetic-js/node_modules/synthetic-linux/package.json')
    expect(failures).toContain('Non-Windows native binary:')
    expect(failures).toContain('Wrong native architecture 0xaa64:')
    expect(failures).toContain('Build-only file:')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

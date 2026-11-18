import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const libRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'))
const asar = libRequire('@electron/asar')
const { isPackageCompatible } = libRequire('./out/util/archCompatibility.js')

/** Inspect the actual archive, including nested packages and auto-unpacked binaries. */
export function inspectWindowsArchive(archive, arch) {
  const machine = { x64: 0x8664, arm64: 0xaa64, ia32: 0x14c }[arch]
  if (machine == null) throw new Error(`Unknown Windows package target: ${arch}`)
  const errors = []
  const packages = []
  let bytes = 0, files = 0, nativeFiles = 0
  for (const entry of asar.listPackage(archive)) {
    const archivePath = entry.replace(/^[/\\]/, '')
    const path = entry.replaceAll('\\', '/').replace(/^\//, '')
    const stat = asar.statFile(archive, archivePath, false)
    if (stat.size == null) continue
    files++
    bytes += stat.size
    if (/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(path)) {
      const metadata = JSON.parse(asar.extractFile(archive, archivePath).toString('utf8'))
      packages.push({ path, name: metadata.name, version: metadata.version, os: metadata.os, cpu: metadata.cpu })
      if (!isPackageCompatible(metadata, arch, 'win32')) errors.push(`Wrong target cpu/os: ${path}`)
    }
    if (/node_modules\/better-sqlite3\/(?:src|deps|build\/Release\/obj)\//.test(path)
      || /node_modules\/better-sqlite3\/build\/.*\.(?:iobj|ipdb|lib|vcxproj|filters|sln|gypi|tlog|lastbuildstate)$/.test(path)
      || /(?:^|\/)tsconfig[^/]*\.tsbuildinfo$/.test(path)) {
      errors.push(`Build-only file: ${path}`)
    }
    if (!/\.(?:node|dll|exe|dylib|so(?:\.\d+)*)$/i.test(path)) continue
    const buffer = asar.extractFile(archive, archivePath)
    nativeFiles++
    const magic = buffer.length >= 4 ? buffer.readUInt32BE(0) : 0
    if ([0x7f454c46, 0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(magic)) {
      errors.push(`Non-Windows native binary: ${path}`)
    } else if (buffer.length >= 64 && buffer.toString('ascii', 0, 2) === 'MZ') {
      const offset = buffer.readUInt32LE(60)
      if (offset + 6 <= buffer.length && buffer.toString('ascii', offset, offset + 4) === 'PE\0\0') {
        const actual = buffer.readUInt16LE(offset + 4)
        // Windows x64 can execute an x86 helper, but cannot load an x86 Node addon.
        const compatibleHelper = arch === 'x64' && actual === 0x14c && !path.endsWith('.node')
        if (actual !== machine && !compatibleHelper) errors.push(`Wrong native architecture 0x${actual.toString(16)}: ${path}`)
      }
    }
  }
  return { target: `win32-${arch}`, files, bytes, nativeFiles, packages, errors }
}

export async function verifyWindowsPackageContent(appOutDir, arch, reportPath) {
  const report = inspectWindowsArchive(join(appOutDir, 'resources', 'app.asar'), arch)
  if (reportPath) {
    const { dirname } = await import('node:path')
    await mkdir(dirname(reportPath), { recursive: true })
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  }
  if (report.errors.length) throw new Error('Windows package contains unexpected files:\n' + report.errors.join('\n'))
  console.log(`Windows package content verified: ${report.target}, ${report.packages.length} packages, ${report.nativeFiles} native files, ${report.bytes} bytes.`)
  return report
}

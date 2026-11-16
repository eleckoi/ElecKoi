import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareProductionClosure } from '../stage-production-closure.mjs'

describe('Android production dependency staging', () => {
  it('excludes installed musl-only optional packages from the glibc runtime', () => {
    const repo = mkdtempSync(join(tmpdir(), 'eleckoi-platform-'))
    try {
      mkdirSync(join(repo, 'apps/android-host'), { recursive: true })
      writeFileSync(join(repo, 'apps/android-host/package.json'), JSON.stringify({
        name: 'synthetic-host', version: '1.0.0',
        optionalDependencies: { 'synthetic-glibc': '1.0.0', 'synthetic-musl': '1.0.0' }
      }))
      for (const libc of ['glibc', 'musl']) {
        const source = join(repo, 'node_modules', `synthetic-${libc}`)
        mkdirSync(source, { recursive: true })
        writeFileSync(join(source, 'package.json'), JSON.stringify({
          name: `synthetic-${libc}`, version: '1.0.0', os: ['linux'], cpu: ['arm64'], libc: [libc]
        }))
      }
      const inventory = prepareProductionClosure(repo, join(repo, 'build/android-runtime/closure'))
      expect(inventory.packages.map(pkg => pkg.name)).toEqual(['synthetic-host', 'synthetic-glibc'])
      expect(inventory.missingOptional).toContainEqual({
        owner: 'synthetic-host', name: 'synthetic-musl', reason: 'not-linux-arm64-glibc'
      })
    } finally {
      expect(resolve(repo).startsWith(resolve(tmpdir()) + sep)).toBe(true)
      rmSync(repo, { recursive: true, force: true })
    }
  })
  it('ships current patched bytes and removes obsolete files when the package version stays the same', () => {
    const repo = mkdtempSync(join(tmpdir(), 'eleckoi-closure-'))
    const output = join(repo, 'build/android-runtime/closure')
    const source = join(repo, 'node_modules/synthetic-plugin')
    try {
      mkdirSync(join(repo, 'apps/android-host'), { recursive: true })
      mkdirSync(source, { recursive: true })
      writeFileSync(join(repo, 'apps/android-host/package.json'), JSON.stringify({
        name: 'synthetic-host', version: '1.0.0', dependencies: { 'synthetic-plugin': '1.0.0' }
      }))
      writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'synthetic-plugin', version: '1.0.0' }))
      writeFileSync(join(source, 'index.js'), 'old patched bytes')
      writeFileSync(join(source, 'obsolete.js'), 'obsolete')
      writeFileSync(join(source, 'stable.js'), 'unchanged dependency')
      prepareProductionClosure(repo, output)
      expect(readFileSync(join(output, 'node_modules/synthetic-plugin/index.js'), 'utf8')).toBe('old patched bytes')
      const stable = join(output, 'node_modules/synthetic-plugin/stable.js')
      const stableBefore = statSync(stable)
      const previous = statSync(join(source, 'index.js'))

      writeFileSync(join(source, 'index.js'), 'new patched bytes')
      utimesSync(join(source, 'index.js'), previous.atime, previous.mtime)
      rmSync(join(source, 'obsolete.js'))
      const inventory = prepareProductionClosure(repo, output, { reuse: true })
      expect(readFileSync(join(output, 'node_modules/synthetic-plugin/index.js'), 'utf8')).toBe('new patched bytes')
      expect(() => readFileSync(join(output, 'node_modules/synthetic-plugin/obsolete.js'))).toThrow()
      expect(statSync(stable).ino).toBe(stableBefore.ino)
      writeFileSync(join(source, 'stable.js'), 'later source modification')
      expect(readFileSync(stable, 'utf8')).toBe('unchanged dependency')
      writeFileSync(stable, 'corrupted staging')
      prepareProductionClosure(repo, output, { reuse: true })
      expect(readFileSync(stable, 'utf8')).toBe('later source modification')
      const dependency = inventory.packages.find(pkg => pkg.name === 'synthetic-plugin')
      expect(realpathSync(join(output, 'node_modules/synthetic-plugin'))).toBe(realpathSync(join(output, dependency.directory)))
      expect(dependency.version).toBe('1.0.0')
    } finally {
      expect(resolve(repo).startsWith(resolve(tmpdir()) + sep)).toBe(true)
      rmSync(repo, { recursive: true, force: true })
    }
  }, 30_000)

  it('rejects a replacement target outside the Android closure directory before touching it', () => {
    const repo = mkdtempSync(join(tmpdir(), 'eleckoi-closure-boundary-'))
    try {
      const sentinel = join(repo, 'sentinel')
      writeFileSync(sentinel, 'retain')
      expect(() => prepareProductionClosure(repo, repo)).toThrow(/target/)
      expect(readFileSync(sentinel, 'utf8')).toBe('retain')
    } finally {
      expect(resolve(repo).startsWith(resolve(tmpdir()) + sep)).toBe(true)
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('rejects missing compiled workspace exports without replacing the last complete snapshot', () => {
    const repo = mkdtempSync(join(tmpdir(), 'eleckoi-closure-entries-'))
    const source = join(repo, 'apps/android-host')
    const output = join(repo, 'build/android-runtime/closure')
    try {
      mkdirSync(join(source, 'dist'), { recursive: true })
      writeFileSync(join(source, 'package.json'), JSON.stringify({
        name: 'synthetic-host', version: '1.0.0', exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.mjs' },
          './media': './dist/media.mjs'
        }
      }))
      writeFileSync(join(source, 'dist/index.mjs'), 'export const host = true')
      writeFileSync(join(source, 'dist/media.mjs'), 'export const media = true')
      const inventory = prepareProductionClosure(repo, output)
      expect(inventory.packages[0].workspace).toBe(true)
      rmSync(join(source, 'dist/media.mjs'))
      expect(() => prepareProductionClosure(repo, output, { reuse: true })).toThrow(/synthetic-host.*dist\/media\.mjs/)
      expect(readFileSync(join(output, 'dist/media.mjs'), 'utf8')).toBe('export const media = true')
      rmSync(join(source, 'dist'), { recursive: true })
      expect(() => prepareProductionClosure(repo, output)).toThrow(/Missing workspace runtime entry/)
      expect(readFileSync(join(output, 'dist/index.mjs'), 'utf8')).toBe('export const host = true')
    } finally {
      expect(resolve(repo).startsWith(resolve(tmpdir()) + sep)).toBe(true)
      rmSync(repo, { recursive: true, force: true })
    }
  }, 30_000)
})

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalMediaStore } from '../src/main/platform/filesystem/LocalMediaStore'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-media-test-'))
  directories.push(directory)
  return new LocalMediaStore(directory)
}

function image(value: string) {
  return `data:image/png;base64,${Buffer.from(value).toString('base64')}`
}

describe('local stable media store', () => {
  it('stores image bytes outside SQLite-shaped values', () => {
    const store = harness()
    const prepared = store.prepareImage('character/a', 'avatar', image('first'))
    const path = store.pathForReference(prepared.reference)
    expect(prepared.reference).toMatch(/^eleckoi-media:\/\/asset\/v1\/[a-f0-9]{64}\/avatar\/[a-f0-9]{64}\.png$/)
    expect(path).toBeTruthy()
    expect(readFileSync(path!).toString()).toBe('first')
    prepared.commit()
  })

  it('deletes the previous file only after a replacement commits', () => {
    const store = harness()
    const first = store.prepareImage('user/default', 'portrait', image('first'))
    const firstPath = store.pathForReference(first.reference)!
    first.commit()

    const rolledBack = store.prepareImage('user/default', 'portrait', image('rollback'))
    const rolledBackPath = store.pathForReference(rolledBack.reference)!
    rolledBack.rollback()
    expect(existsSync(firstPath)).toBe(true)
    expect(existsSync(rolledBackPath)).toBe(false)

    const replacement = store.prepareImage('user/default', 'portrait', image('second'))
    const replacementPath = store.pathForReference(replacement.reference)!
    replacement.commit()
    expect(existsSync(firstPath)).toBe(false)
    expect(existsSync(replacementPath)).toBe(true)
  })

  it('keeps the current file when the same stored reference is saved again', () => {
    const store = harness()
    const first = store.prepareImage('character/a', 'avatar', image('first'))
    const firstPath = store.pathForReference(first.reference)!
    first.commit()

    store.prepareImage('character/a', 'avatar', first.reference).commit()

    expect(existsSync(firstPath)).toBe(true)
    expect(readFileSync(firstPath).toString()).toBe('first')
  })

  it('removes the owned file when the image is cleared', () => {
    const store = harness()
    const first = store.prepareImage('character/a', 'cover', image('first'))
    const firstPath = store.pathForReference(first.reference)!
    first.commit()
    store.prepareImage('character/a', 'cover', '').commit()
    expect(existsSync(firstPath)).toBe(false)
  })

  it('rejects unsupported or malformed inline image data', () => {
    const store = harness()
    expect(() => store.prepareImage('character/a', 'avatar', 'data:image/svg+xml;base64,PHN2Zz4=')).toThrow('仅支持')
    expect(() => store.prepareImage('character/a', 'avatar', 'data:image/png;base64,***')).toThrow('格式无效')
  })
})

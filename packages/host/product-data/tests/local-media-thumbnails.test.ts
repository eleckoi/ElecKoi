import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import sharp, { type Sharp } from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalMediaStore, LocalMediaThumbnails } from '@eleckoi/dsh-product-data/media'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
async function harness(width = 900, height = 1200) {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-thumbnails-')); roots.push(root)
  const store = new LocalMediaStore(root)
  const bytes = await sharp({ create: { width, height, channels: 4, background: '#bb558880' } }).png().toBuffer()
  const image = store.prepareImage('character/a', 'portrait', `data:image/png;base64,${bytes.toString('base64')}`)
  image.commit()
  return { root, store, bytes, image, source: store.pathForReference(image.reference)!, cache: new LocalMediaThumbnails(root) }
}
const request = (reference: string, size = 256) => `${reference}?thumbnail=${size}`
const files = (root: string): string[] => existsSync(root) ? readdirSync(root, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]) : []

describe('owned local media thumbnails', () => {
  it('downsamples once per requested density without cropping, losing alpha, or modifying the original', async () => {
    const h = await harness()
    const first = await h.cache.resolve(request(h.image.reference))
    const high = await h.cache.resolve(request(h.image.reference, 512))
    const normal = await sharp(readFileSync(first!)).metadata(), retina = await sharp(readFileSync(high!)).metadata()
    expect([normal.width, normal.height, normal.hasAlpha]).toEqual([192, 256, true])
    expect([retina.width, retina.height, retina.hasAlpha]).toEqual([384, 512, true])
    const pixel = await sharp(readFileSync(first!)).raw().toBuffer()
    expect(pixel[3]).toBe(128)
    expect(readFileSync(h.source)).toEqual(h.bytes)
    expect(await h.cache.resolve(request(h.image.reference))).toBe(first)
    expect(files(h.root)).toHaveLength(3)
  })
  it('reuses existing small originals without enlarging or storing another copy', async () => {
    const h = await harness(42, 56)
    expect(await h.cache.resolve(request(h.image.reference))).toBe(h.source)
    expect(files(h.root)).toEqual([h.source])
  })
  it('creates larger cover renditions, reuses them on reopen and removes every density with its owner', async () => {
    const h = await harness(2400, 3000)
    const paths = []
    for (const size of [256, 512, 1024, 2048]) {
      const path = await h.cache.resolve(request(h.image.reference, size))
      expect((await sharp(readFileSync(path!)).metadata()).height).toBe(size)
      paths.push(path)
    }
    expect(files(h.root)).toHaveLength(5)
    const reopened = new LocalMediaThumbnails(h.root)
    for (const [index, size] of [256, 512, 1024, 2048].entries()) expect(await reopened.resolve(request(h.image.reference, size))).toBe(paths[index])
    expect(readFileSync(h.source)).toEqual(h.bytes)
    h.store.removeOwner('character/a')
    expect(files(h.root)).toEqual([])
  })
  it('preserves animation pages and orientation when creating a thumbnail', async () => {
    const h = await harness()
    const frames = await sharp({ create: { width: 600, height: 1200, channels: 4, background: '#334455' } }).raw().toBuffer()
    for (let index = 600 * 600 * 4; index < frames.length; index += 4) frames[index] = 200
    const animated = await sharp(frames, { raw: { width: 600, height: 1200, channels: 4, pageHeight: 600 } }).gif({ loop: 0, delay: [100, 200] }).toBuffer()
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2)
    const image = h.store.prepareImage('character/animated', 'avatar', `data:image/gif;base64,${animated.toString('base64')}`); image.commit()
    const path = await h.cache.resolve(request(image.reference)), metadata = await sharp(readFileSync(path!), { animated: true }).metadata()
    expect(metadata.pages).toBe(2); expect(metadata.pageHeight).toBe(256); expect(metadata.delay).toEqual([100, 200])
    const oriented = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#aa5566' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const portrait = h.store.prepareImage('character/oriented', 'avatar', `data:image/jpeg;base64,${oriented.toString('base64')}`); portrait.commit()
    const orientedPath = await h.cache.resolve(request(portrait.reference)), orientedMeta = await sharp(readFileSync(orientedPath!)).metadata()
    expect([orientedMeta.width, orientedMeta.height]).toEqual([256, 171])
  })
  it('coalesces concurrent requests and releases in-flight records', async () => {
    const h = await harness(), spy = vi.spyOn(sharp.prototype, 'toBuffer')
    const paths = await Promise.all(Array.from({ length: 12 }, () => h.cache.resolve(request(h.image.reference))))
    expect(new Set(paths).size).toBe(1); expect(spy).toHaveBeenCalledTimes(1)
    await h.cache.resolve(request(h.image.reference))
    expect(spy).toHaveBeenCalledTimes(1)
  })
  it.each(['replace', 'clear', 'owner', 'rollback'])('cleans all derivatives after %s, preserving other owners', async action => {
    const h = await harness()
    const other = h.store.prepareImage('character/b', 'portrait', `data:image/png;base64,${h.bytes.toString('base64')}`); other.commit()
    const otherPath = await h.cache.resolve(request(other.reference))
    const target = await h.cache.resolve(request(h.image.reference))
    await h.cache.resolve(request(h.image.reference, 512))
    if (action === 'replace') h.store.prepareImage('character/a', 'portrait', `data:image/png;base64,${(await sharp(h.bytes).flop().tint('#223344').png().toBuffer()).toString('base64')}`).commit()
    else if (action === 'clear') h.store.prepareImage('character/a', 'portrait', '').commit()
    else if (action === 'owner') h.store.removeOwner('character/a')
    else {
      const pending = h.store.prepareImage('character/c', 'portrait', `data:image/png;base64,${h.bytes.toString('base64')}`)
      const pendingPath = await h.cache.resolve(request(pending.reference))
      pending.rollback(); expect(existsSync(pendingPath!)).toBe(false)
      expect(existsSync(target!)).toBe(true); return
    }
    expect(existsSync(target!)).toBe(false)
    expect(existsSync(dirname(target!))).toBe(false)
    expect(existsSync(otherPath!)).toBe(true)
    expect(await h.cache.resolve(request(h.image.reference))).toBeUndefined()
  })
  it('rebuilds a corrupt cache and removes interrupted files and orphan derivatives on reopen', async () => {
    const h = await harness(), target = await h.cache.resolve(request(h.image.reference))
    writeFileSync(target!, 'broken'); writeFileSync(join(dirname(target!), '.interrupted.tmp'), 'partial')
    const orphan = join(dirname(dirname(target!)), `${'f'.repeat(64)}.png`)
    mkdirSync(orphan); writeFileSync(join(orphan, '256.webp'), 'orphan')
    const reopened = new LocalMediaThumbnails(h.root)
    expect(await reopened.resolve(request(h.image.reference))).toBe(target)
    expect((await sharp(readFileSync(target!)).metadata()).width).toBe(192)
    await vi.waitFor(() => { expect(files(h.root)).toHaveLength(2); expect(existsSync(orphan)).toBe(false) })
  })
  it('does not resurrect media removed while native decoding is in flight', async () => {
    const h = await harness()
    let started!: () => void, release!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const original = sharp.prototype.toBuffer
    vi.spyOn(sharp.prototype, 'toBuffer').mockImplementationOnce(async function (this: Sharp) {
      started(); await gate; return original.call(this)
    } as typeof original)
    const pending = h.cache.resolve(request(h.image.reference))
    await entered; h.store.removeOwner('character/a'); release()
    expect(await pending).toBeUndefined()
    expect(files(h.root)).toEqual([])
    expect(readdirSync(join(h.root, 'v1'))).toEqual([])
  })
  it('validates thumbnail requests without relaxing the original path contract', async () => {
    const h = await harness()
    for (const suffix of ['?thumbnail=1', '?thumbnail=256&x=1', '?thumbnail=256&thumbnail=512', '?thumbnail=0256', '?thumbnail=256#x']) {
      expect(await h.cache.resolve(h.image.reference + suffix)).toBeUndefined()
    }
    expect(await h.cache.resolve(h.image.reference)).toBe(h.source)
  })
})

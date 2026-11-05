import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { dshClientPlugin } from '../../../../../../tests/helpers/dshClientPlugin'

const source = readFileSync(new URL('../../src/client.js', import.meta.url), 'utf8')
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

interface Collection {
  active_character_id: string
  groups: string[]
  items: Array<{ id: string }>
}

const collection = (id: string): Collection => ({ active_character_id: id, groups: [], items: [{ id }] })

function recordChanges() {
  const queue: Array<{ kind: 'snapshot' } | { kind: 'records'; domain: 'characters' }> = [{ kind: 'snapshot' }]
  let wake: (() => void) | undefined
  let stopped = false
  return {
    open(signal?: AbortSignal): AsyncIterable<(typeof queue)[number]> {
      const stop = () => { stopped = true; wake?.(); wake = undefined }
      if (signal?.aborted) stop()
      else signal?.addEventListener('abort', stop, { once: true })
      return (async function* () {
        try {
          while (!stopped) {
            if (queue.length) yield queue.shift()!
            else await new Promise<void>(resolve => { wake = resolve })
          }
        } finally {
          signal?.removeEventListener('abort', stop)
          stop()
        }
      })()
    },
    emit() { queue.push({ kind: 'records', domain: 'characters' }); wake?.(); wake = undefined },
    isStopped: () => stopped
  }
}

describe('DSH ElecKoi character client model', () => {
  function exportCatalog(platform?: { saveBytes: ReturnType<typeof vi.fn> }) {
    let registration: any, catalog: any
    const blobs: Blob[] = []
    const anchors: any[] = []
    const remoteExport = vi.fn()
    const revoke = vi.fn()
    const timers: Array<() => void> = []
    const document = {
      body: { append: vi.fn() },
      createElement: vi.fn(() => {
        const anchor = { href: '', download: '', style: {}, click: vi.fn(), remove: vi.fn() }
        anchors.push(anchor)
        return anchor
      }),
    }
    class ExportUrl extends URL {
      static override createObjectURL(blob: Blob) { blobs.push(blob); return `blob:synthetic/${blobs.length}` }
      static override revokeObjectURL = revoke
    }
    runInNewContext(source, {
      window: { ElecKoiPlatform: platform, __ModuleLoader__: { load: (item: any) => { registration = item } } },
      document, URL: ExportUrl, Blob, Uint8Array, atob,
      setTimeout: (callback: () => void) => { timers.push(callback) },
    })
    dshClientPlugin(registration).apply({
      remote: { eleckoiCharacters: { export: remoteExport } },
      provide: (_name: string, value: any) => { catalog = value },
      effect: () => {},
    })
    return { catalog, remoteExport, document, blobs, anchors, timers, revoke }
  }

  it.each(['png', 'json'])('hands the actual %s bytes and filename to the desktop browser download', async format => {
    const test = exportCatalog()
    const bytes = format === 'png' ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 255, 0, 128])
      : Buffer.from(JSON.stringify({ name: 'Synthetic export', entries: Array.from({ length: 10001 }, (_, i) => ({ id: i, text: `Synthetic ${i} ` + '正文'.repeat(30) })) }))
    const file = { fileName: `synthetic.${format}`, mimeType: format === 'png' ? 'image/png' : 'application/json', base64: bytes.toString('base64') }
    test.remoteExport.mockResolvedValue({ ok: true, value: file })
    const result = await test.catalog.exportCharacters(['a', 'a'], format)
    expect(test.remoteExport).toHaveBeenCalledExactlyOnceWith('a', format)
    expect(test.anchors).toHaveLength(1)
    expect(test.document.body.append).toHaveBeenCalledWith(test.anchors[0])
    expect(test.anchors[0]).toMatchObject({ href: 'blob:synthetic/1', download: file.fileName })
    expect(test.anchors[0].click).toHaveBeenCalledOnce()
    expect(test.anchors[0].remove).toHaveBeenCalledOnce()
    expect(test.blobs[0]!.type).toBe(file.mimeType)
    expect(Buffer.from(await test.blobs[0]!.arrayBuffer())).toEqual(bytes)
    expect(result).toMatchObject({ canceled: false, written: [{ characterId: 'a', fileName: file.fileName }], failures: [] })
    expect(test.revoke).not.toHaveBeenCalled()
    test.timers.forEach(callback => callback())
    expect(test.revoke).toHaveBeenCalledWith('blob:synthetic/1')
  })

  it('waits for Android native saving before starting another card or reporting success', async () => {
    let finish!: (result: unknown) => void
    const saveBytes = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockResolvedValue({ result: 'content://synthetic/second', cancelled: false })
    const test = exportCatalog({ saveBytes })
    const bytes = Buffer.from('Synthetic\u0000二进制\u00ff')
    test.remoteExport.mockImplementation(async (id: string) => ({ ok: true, value: { fileName: `${id}.png`, mimeType: 'image/png', base64: bytes.toString('base64') } }))
    let done = false
    const pending = test.catalog.exportCharacters(['a', 'b'], 'png').then((result: unknown) => { done = true; return result })
    await settle()
    expect(done).toBe(false)
    expect(test.remoteExport).toHaveBeenCalledTimes(1)
    expect(saveBytes.mock.calls[0]![0]).toBe('a.png')
    expect(Buffer.from(saveBytes.mock.calls[0]![1])).toEqual(bytes)
    expect(saveBytes.mock.calls[0]![2]).toBe('image/png')
    finish({ result: 'content://synthetic/first', cancelled: false })
    expect(await pending).toMatchObject({ canceled: false, written: [{ characterId: 'a' }, { characterId: 'b' }], failures: [] })
    expect(test.anchors).toHaveLength(0)
  })

  it('stops on native cancellation without counting canceled or unattempted cards as written', async () => {
    const saveBytes = vi.fn().mockResolvedValueOnce({ cancelled: false }).mockResolvedValueOnce({ cancelled: true })
    const test = exportCatalog({ saveBytes })
    test.remoteExport.mockImplementation(async (id: string) => ({ ok: true, value: { fileName: `${id}.json`, mimeType: 'application/json', base64: 'e30=' } }))
    expect(await test.catalog.exportCharacters(['a', 'b', 'c'], 'json')).toMatchObject({ canceled: true, written: [{ characterId: 'a' }], failures: [] })
    expect(test.remoteExport.mock.calls).toEqual([['a', 'json'], ['b', 'json']])
  })

  it('reports remote and native write failures while still exporting the other selected cards', async () => {
    const saveBytes = vi.fn().mockRejectedValueOnce(new Error('Synthetic write failure')).mockResolvedValue({ cancelled: false })
    const test = exportCatalog({ saveBytes })
    test.remoteExport.mockRejectedValueOnce(new Error('Synthetic export failure'))
      .mockResolvedValue({ ok: true, value: { fileName: 'synthetic.json', mimeType: 'application/json', base64: 'e30=' } })
    const result = await test.catalog.exportCharacters(['a', 'b', 'c'], 'json')
    expect(result.written).toEqual([{ characterId: 'c', fileName: 'synthetic.json' }])
    expect(result.failures).toEqual([{ characterId: 'a', message: 'Synthetic export failure' }, { characterId: 'b', message: 'Synthetic write failure' }])
  })

  it('uses the generated Character Remote and keeps a mutation ahead of an older read', async () => {
    const pending: Array<(result: { ok: true; value: Collection }) => void> = []
    let registration: { id: string; factory: () => { apply: (ctx: unknown) => void } } | undefined
    let cleanup = () => {}
    let catalog: {
      getSnapshot: () => { status: string; collection: Collection }
      subscribe: (listener: () => void) => () => void
      refresh: () => Promise<Collection>
      select: (id: string) => Promise<Collection>
      duplicate: (id: string) => Promise<{ characterId: string; collection: Collection }>
    } | undefined
    const remote = {
      eleckoiCharacters: {
        changes: (signal?: AbortSignal) => changeFeed.open(signal),
        list: vi.fn(() => new Promise<{ ok: true; value: Collection }>(resolve => pending.push(resolve))),
        select: vi.fn(async (id: string) => ({ ok: true as const, value: collection(id) })),
        duplicate: vi.fn(async (_id: string) => ({ ok: true as const, value: { characterId: 'copied', collection: collection('copied') } })),
      }
    }
    const changeFeed = recordChanges()
    runInNewContext(source, {
      AbortController,
      window: { __ModuleLoader__: { load: (item: typeof registration) => { registration = item } } },
      document: {}, URL, Blob, Uint8Array, atob, setTimeout
    })
    expect(registration?.id).toBe('@eleckoi/dsh-client-characters')
    dshClientPlugin(registration!).apply({
      remote,
      provide: (name: string, value: typeof catalog) => {
        expect(name).toBe('eleckoiCharacters')
        catalog = value
      },
      effect: (run: () => () => void) => { cleanup = run() },
      on: () => () => {},
      slots: { inject: () => {}, register: () => () => {} }
    })
    if (!catalog) throw new Error('Character catalog was not provided')
    let notifications = 0
    catalog.subscribe(() => { notifications += 1 })
    await settle()
    expect(remote.eleckoiCharacters.list).toHaveBeenCalledTimes(2)

    await catalog.select('saved')
    pending[0]!({ ok: true, value: collection('stale') })
    pending[1]!({ ok: true, value: collection('stale') })
    await settle()

    expect(remote.eleckoiCharacters.select).toHaveBeenCalledWith('saved')
    expect(catalog.getSnapshot().collection.active_character_id).toBe('saved')
    expect(notifications).toBe(1)
    expect((await catalog.duplicate('saved')).characterId).toBe('copied')
    expect(remote.eleckoiCharacters.duplicate).toHaveBeenCalledWith('saved')
    expect(catalog.getSnapshot().collection.active_character_id).toBe('copied')
    remote.eleckoiCharacters.duplicate.mockRejectedValueOnce(new Error('Synthetic duplication failure'))
    await expect(catalog.duplicate('saved')).rejects.toThrow('Synthetic duplication failure')
    expect(catalog.getSnapshot().collection.active_character_id).toBe('copied')
    cleanup()
    await expect(catalog.duplicate('saved')).rejects.toMatchObject({ code: 'eleckoi/lifecycle/disposed' })
    expect(changeFeed.isStopped()).toBe(true)
  })
})

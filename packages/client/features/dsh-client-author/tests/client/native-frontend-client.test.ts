import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeFrontendClient } from '@eleckoi/dsh-client-author/frontends'
// @ts-expect-error UI command mapper is a JavaScript module.
import { requestNativeFrontend } from '../../../../../../apps/web/src/modules/authorFrontend/model/nativeFrontendRequest.js'

const cleanups: Array<() => void> = []
afterEach(() => { for (const close of cleanups.splice(0)) close() })
const owner = { scope: 'application' as const }
const value = (revision: number, extra = {}) => ({ scope: 'application', revision, projects: [], activeBindings: [], selectedProjectId: null, messageRendererEnabled: true, ...extra })
class Feed {
  private readonly queue: any[] = []
  private wake: (() => void) | undefined
  private closed = false
  error: Error | undefined
  readonly dispose = vi.fn(async () => { this.closed = true; this.wake?.() })
  constructor(signal: AbortSignal) { signal.addEventListener('abort', () => { void this.dispose() }, { once: true }) }
  push(revision: number) { this.queue.push({ kind: 'changed', revision }); this.wake?.() }
  fail() { this.error = new Error('Synthetic stream failure'); this.wake?.() }
  async *[Symbol.asyncIterator]() {
    while (!this.closed) {
      if (this.error) throw this.error
      if (this.queue.length) yield this.queue.shift()
      else await new Promise<void>(resolve => { this.wake = resolve })
    }
  }
}
function fixture() {
  const feeds: Feed[] = [], received = vi.fn(), error = vi.fn()
  const remote = { workspace: vi.fn(async () => ({ ok: true, value: value(0) })),
    changes: vi.fn((_owner: any, signal: AbortSignal) => { const feed = new Feed(signal); feeds.push(feed); return feed }),
  }
  const client = new NativeFrontendClient(remote as any)
  cleanups.push(() => client.dispose())
  return { remote, client, feeds, received, error }
}

describe('native frontend Client', () => {
  it('uses explicit immutable ownership without depending on chat or script status', async () => {
    const r = fixture(), character = { scope: 'character' as const, characterId: 'synthetic-character' }
    r.remote.workspace.mockResolvedValue({ ok: true, value: value(0, character) } as any)
    const stop = r.client.watch(character, r.received, r.error)
    character.characterId = 'synthetic-other'
    r.feeds[0]!.push(0)
    await vi.waitFor(() => expect(r.received).toHaveBeenCalledOnce())
    expect(r.remote.workspace).toHaveBeenCalledExactlyOnceWith({ scope: 'character', characterId: 'synthetic-character' })
    expect(r.received.mock.calls[0]![0].characterId).toBe('synthetic-character')
    stop(); await vi.waitFor(() => expect(r.feeds[0]!.dispose).toHaveBeenCalled())
    expect(r.error).not.toHaveBeenCalled()
  })
  it('coalesces notifications and re-reads when a change arrives during the previous snapshot request', async () => {
    const r = fixture(); let finish!: (result: any) => void
    r.remote.workspace.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    r.remote.workspace.mockResolvedValue({ ok: true, value: value(100) })
    r.client.watch(owner, r.received, r.error); r.feeds[0]!.push(0)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    for (let revision = 1; revision <= 100; revision++) r.feeds[0]!.push(revision)
    await vi.waitFor(() => expect(r.remote.workspace).toHaveBeenCalledOnce())
    finish({ ok: true, value: value(0) })
    await vi.waitFor(() => expect(r.received).toHaveBeenLastCalledWith(value(100)))
    expect(r.remote.workspace).toHaveBeenCalledTimes(2)
    expect(r.error).not.toHaveBeenCalled()
  })
  it('ignores late snapshots from old connections, restarts exact owners and releases every watcher', async () => {
    const r = fixture(); let finish!: (result: any) => void
    r.remote.workspace.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    r.client.watch(owner, r.received, r.error); r.feeds[0]!.push(0)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.client.reset(); r.feeds[1]!.push(0)
    await vi.waitFor(() => expect(r.received).toHaveBeenCalledOnce())
    finish({ ok: true, value: value(999) }); await Promise.resolve(); await Promise.resolve()
    expect(r.received).toHaveBeenCalledOnce()
    r.client.dispose(); r.client.reset()
    await vi.waitFor(() => expect(r.feeds.every(feed => feed.dispose.mock.calls.length > 0)).toBe(true))
    expect(r.remote.changes).toHaveBeenCalledTimes(2)
    expect(r.error).not.toHaveBeenCalled()
    expect(() => r.client.watch(owner, r.received, r.error)).toThrow('closed')
  })
  it('preserves errors rather than publishing an empty successful workspace, and permits a later retry', async () => {
    const r = fixture(); r.client.watch(owner, r.received, r.error)
    r.feeds[0]!.push(0); await vi.waitFor(() => expect(r.received).toHaveBeenCalledOnce())
    r.remote.workspace.mockResolvedValueOnce({ ok: false, error: { code: 'synthetic/failed', message: 'Synthetic read failure' } } as any)
    r.feeds[0]!.push(1); await vi.waitFor(() => expect(r.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'synthetic/failed' })))
    expect(r.received).toHaveBeenCalledOnce()
    r.remote.workspace.mockResolvedValue({ ok: true, value: value(2) })
    r.feeds[0]!.push(2); await vi.waitFor(() => expect(r.received).toHaveBeenLastCalledWith(value(2)))
    r.feeds[0]!.fail(); await vi.waitFor(() => expect(r.error).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Synthetic stream failure' })))
  })
  it('rejects mismatched snapshot ownership rather than assigning it to the requested character', async () => {
    const r = fixture(); r.client.watch({ scope: 'character', characterId: 'synthetic-character' }, r.received, r.error)
    r.feeds[0]!.push(0)
    await vi.waitFor(() => expect(r.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'Frontend workspace owner mismatch' })))
    expect(r.received).not.toHaveBeenCalled()
  })
})

describe('native frontend UI command mapping', () => {
  it('maps each command to the formal generated Remote signature and retains literal values', async () => {
    const methods = ['workspace', 'importProject', 'select', 'delete', 'readFile', 'writeFile', 'exportProject', 'setMessageRenderer', 'updateProject', 'replaceFiles', 'restoreDefault']
    const projects = Object.fromEntries(methods.map(method => [method, vi.fn(async () => ({ ok: true, value: { method } }))]))
    const service = { projects }, id = 'synthetic-project'
    const cases: Array<[string, any, string, any[]]> = [
      ['workspace', {}, 'workspace', [owner]], ['import', { html: 'Synthetic HTML' }, 'importProject', [owner, { html: 'Synthetic HTML' }]],
      ['select', { projectId: null }, 'select', [owner, null]], ['delete', { projectId: id }, 'delete', [owner, id]],
      ['readFile', { projectId: id }, 'readFile', [owner, id, {}]],
      ['writeFile', { projectId: id, path: 'index.html', content: '' }, 'writeFile', [owner, id, { path: 'index.html', content: '' }]],
      ['export', { projectId: id }, 'exportProject', [owner, id]], ['setMessageRenderer', { enabled: false }, 'setMessageRenderer', [owner, false]],
      ['updateProject', { projectId: id, patch: { name: 'Synthetic name' } }, 'updateProject', [owner, id, { name: 'Synthetic name' }]],
      ['replaceFiles', { projectId: id, files: [], deletePaths: ['synthetic.txt'] }, 'replaceFiles', [owner, id, { files: [], deletePaths: ['synthetic.txt'] }]],
      ['restoreDefault', {}, 'restoreDefault', [owner]],
    ]
    for (const [command, input, method, expected] of cases) {
      expect(await requestNativeFrontend(service, owner, `frontends.${command}`, input)).toEqual({ method })
      expect(projects[method]).toHaveBeenCalledWith(...expected)
    }
    await expect(requestNativeFrontend(service, owner, 'frontends.unknown')).rejects.toThrow('未知')
    await expect(requestNativeFrontend(null, owner, 'frontends.workspace')).rejects.toThrow('未启用')
    projects.workspace!.mockResolvedValueOnce({ ok: false, error: { code: 'synthetic/error', message: 'Synthetic rejected request', details: { stage: 'read' } } } as any)
    await expect(requestNativeFrontend(service, owner, 'frontends.workspace')).rejects.toMatchObject({ code: 'synthetic/error', message: 'Synthetic rejected request', details: { stage: 'read' } })
  })
})

it('recovers asset reads after failure and releases stale role subscriptions across a reconnect', async () => {
  const feeds:Feed[]=[],received=vi.fn(),error=vi.fn(),catalog=(revision:number)=>({characterId:'synthetic-owner',revision,items:[]});
  let finish!:(value:any)=>void;
  const assets={list:vi.fn(async()=>({ok:true,value:catalog(1)})),changes:vi.fn((_id:string,signal:AbortSignal)=>{const feed=new Feed(signal);feeds.push(feed);return feed})};
  assets.list.mockResolvedValueOnce({ok:false,error:{code:'synthetic/read',message:'Synthetic failure'}} as any);
  const client=new NativeFrontendClient({} as any,assets as any);cleanups.push(()=>client.dispose());
  const stop=client.watchAssets('synthetic-owner',received,error);feeds[0]!.push(0);
  await vi.waitFor(()=>expect(error).toHaveBeenCalledOnce());expect(received).not.toHaveBeenCalled();
  feeds[0]!.push(1);await vi.waitFor(()=>expect(received).toHaveBeenCalledWith(catalog(1)));
  assets.list.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));feeds[0]!.push(2);
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));client.reset();feeds[1]!.push(1);
  await vi.waitFor(()=>expect(received).toHaveBeenCalledTimes(2));finish({ok:true,value:catalog(99)});
  await Promise.resolve();await Promise.resolve();expect(received).toHaveBeenCalledTimes(2);
  stop();await vi.waitFor(()=>expect(feeds.every(feed=>feed.dispose.mock.calls.length>0)).toBe(true));
  expect(assets.changes.mock.calls.map(args=>args[0])).toEqual(['synthetic-owner','synthetic-owner']);
});

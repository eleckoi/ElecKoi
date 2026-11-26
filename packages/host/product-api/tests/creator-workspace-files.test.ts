import { lstatSync, renameSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import { unzipSync } from 'fflate'
import { afterEach, expect, it } from 'vitest'
import { ElecKoiCreatorStudioSessionsApi } from '@eleckoi/dsh-product-api'
import { TYPERT } from '@eleckoi/dsh-product-api/typert'
import { ownerPeer } from '../../../../tests/support/owner-peer.js'
import { CreatorWorkspaceFiles } from '../src/creatorWorkspaceFiles.js'
import { ELECKOI_FAILURE_CODES as codes } from '../src/errorCodes.generated.js'
import type { CreatorStudioRuntime, CreatorWorkspaceDirectory } from '../src/types.js'

const temporary: string[] = []
const signal = new AbortController().signal
afterEach(async () => {
  for (const folder of temporary.splice(0)) await rm(folder, { recursive: true, force: true })
})

async function collectFrames<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const frames: T[] = []
  for await (const frame of stream) frames.push(frame)
  return frames
}

async function setup() {
  const home = await mkdtemp(join(tmpdir(), 'eleckoi-workspace-test-'))
  temporary.push(home)
  const cwd = join(home, '创作目录')
  await mkdir(cwd)
  const publish = (from: string, to: string) => {
    if (lstatSync(to, { throwIfNoEntry: false })) throw Object.assign(new Error('Destination exists'), { code: 'EEXIST' })
    renameSync(from, to)
  }
  const files = new CreatorWorkspaceFiles(cwd, publish)
  const scope = { cwd }
  const list = (path: string[] = []) => files.list(scope, path, signal, 'synthetic-session')
  const entry = async (name: string, path?: string[]) => {
    const result = (await list(path)).entries.find(item => item.name === name)!
    return { name: result.name, version: result.version }
  }
  return { cwd, home, files, list, entry, publish, scope }
}

it('round-trips binary files and archives a whole selected folder including empty directories', async () => {
  const { cwd, files, list, entry, scope } = await setup()
  const binary = Buffer.from(Uint8Array.from({ length: 154000 }, (_, index) => index % 251))
  async function* source() {
    for (let start = 0; start < binary.length; start += 65536) yield binary.subarray(start, start + 65536).toString('base64')
  }
  await mkdir(join(cwd, '图稿', '空文件夹'), { recursive: true })
  const received = await collectFrames(files.import(scope, ['图稿'], '绘图.bin', binary.length, source(), signal))
  expect(received).toEqual([
    { kind: 'ready', offset: 0 },
    { kind: 'ready', offset: 65536 },
    { kind: 'ready', offset: 131072 },
    { kind: 'ready', offset: 154000 },
    { kind: 'complete' },
  ])
  expect(await readFile(join(cwd, '图稿', '绘图.bin'))).toEqual(binary)
  expect((await list(['图稿'])).entries.find(item => item.name === '绘图.bin')?.address)
    .toBe('dsh-resource://file/session/synthetic-session/%E5%9B%BE%E7%A8%BF/%E7%BB%98%E5%9B%BE.bin')
  const direct = await collectFrames(files.export(scope, ['图稿'], [await entry('绘图.bin', ['图稿'])], signal))
  expect(direct[0]).toEqual({ kind: 'file', mime: 'application/octet-stream', name: '绘图.bin' })
  const readBytes = (frames: typeof direct) => Buffer.concat(frames.flatMap(frame => frame.kind === 'chunk' ? [Buffer.from(frame.data, 'base64')] : []))
  expect(readBytes(direct)).toEqual(binary)
  const archive = await collectFrames(files.export(scope, [], [await entry('图稿')], signal))
  expect(archive[0]).toEqual({ kind: 'file', mime: 'application/zip', name: '图稿.zip' })
  const contents = unzipSync(readBytes(archive))
  expect(Object.keys(contents).sort()).toEqual(['图稿/', '图稿/空文件夹/', '图稿/绘图.bin'])
  expect(Buffer.from(contents['图稿/绘图.bin']!)).toEqual(binary)
})

it('edits only the selected current entries and preserves files when the target conflicts', async () => {
  const { cwd, files, list, entry, scope } = await setup()
  await writeFile(join(cwd, 'script.js'), 'original')
  await files.edit(scope, [], { kind: 'mkdir', name: '目录' }, signal)
  await files.edit(scope, [], { kind: 'copy', entries: [await entry('script.js')], destination: [] }, signal)
  expect(await readFile(join(cwd, 'script 副本.js'), 'utf8')).toBe('original')
  const source = await entry('script.js')
  await expect(files.edit(scope, [], { kind: 'rename', entry: source, name: 'script 副本.js' }, signal))
    .rejects.toMatchObject({ code: codes.lookupDuplicate })
  await writeFile(join(cwd, 'script.js'), 'changed after selection')
  await expect(files.edit(scope, [], { kind: 'delete', entries: [source] }, signal))
    .rejects.toMatchObject({ code: codes.conflictStaleRevision })
  await files.edit(scope, [], { kind: 'rename', entry: await entry('script.js'), name: 'renamed.js' }, signal)
  await files.edit(scope, [], { kind: 'move', entries: [await entry('renamed.js')], destination: ['目录'] }, signal)
  expect(await readFile(join(cwd, '目录', 'renamed.js'), 'utf8')).toBe('changed after selection')
  await files.edit(scope, [], { kind: 'delete', entries: [await entry('目录')] }, signal)
  expect((await list()).entries.map(item => item.name)).toEqual(['script 副本.js'])
})

it('rejects outside paths and leaves no visible file when transfer ends early', async () => {
  const { cwd, files, home, list, scope } = await setup()
  await symlink(home, join(cwd, 'external'), 'junction')
  await expect(list(['external'])).rejects.toMatchObject({ code: codes.securityDenied })
  await expect(list(['..'])).rejects.toMatchObject({ code: codes.inputInvalid })
  await expect(files.list({ cwd: home }, [], signal, 'synthetic-session')).rejects.toMatchObject({ code: codes.securityDenied })
  async function* partial() { yield Buffer.from('partial').toString('base64') }
  await expect(collectFrames(files.import(scope, [], 'incomplete.bin', 20, partial(), signal)))
    .rejects.toMatchObject({ code: codes.inputInvalid })
  expect((await list()).entries).toMatchObject([{ name: 'external', kind: 'other' }])
})

it('opens a session’s registered workspace outside the default directory under either Android-style path alias', async () => {
  const { files, home } = await setup()
  const actual = join(home, 'app-data')
  const alias = join(home, 'app-data-alias')
  const registeredPath = join(actual, 'home', 'workspace')
  const cwd = join(alias, 'home', 'workspace')
  const unrelated = join(actual, 'home', 'unrelated')
  await mkdir(registeredPath, { recursive: true })
  await mkdir(unrelated)
  await symlink(actual, alias, 'junction')
  await writeFile(join(cwd, 'existing.sh'), 'synthetic script')
  const scope = { cwd, registeredPath }
  const list = (target: CreatorWorkspaceDirectory) => files.list(target, [], signal, 'synthetic-session')
  expect((await list(scope)).entries).toMatchObject([{ name: 'existing.sh', kind: 'file' }])
  await files.edit(scope, [], { kind: 'mkdir', name: 'scripts' }, signal)
  expect((await list(scope)).entries.map(entry => entry.name).sort()).toEqual(['existing.sh', 'scripts'])
  await expect(list({ cwd })).rejects.toMatchObject({ code: codes.securityDenied })
  await expect(list({ cwd, registeredPath: unrelated })).rejects.toMatchObject({ code: codes.securityDenied })
  await expect(list({ cwd: home, registeredPath: home })).rejects.toMatchObject({ code: codes.securityDenied })
})

it('uses the generated DSH duplex Remote to import and demand each export chunk', async () => {
  const { cwd, entry, publish } = await setup()
  const ctx = new Context()
  try {
    await ctx.plugin(TypertRegistry)
    ctx.typert.register(TYPERT as TypertContribution)
    await ctx.plugin(RemoteAccessService)
    await ctx.plugin(TypertGatewayService)
    const unusedSessionOperation = async (): Promise<never> => { throw new Error('Workspace file test invoked an unrelated Studio operation') }
    const runtime: CreatorStudioRuntime = {
      workspaceDirectory: async sessionId => {
        expect(sessionId).toBe('synthetic-session')
        return { cwd }
      },
      list: unusedSessionOperation,
      create: unusedSessionOperation,
      open: unusedSessionOperation,
      selectCharacter: unusedSessionOperation,
      rename: unusedSessionOperation,
      pin: unusedSessionOperation,
      delete: unusedSessionOperation,
      messages: unusedSessionOperation,
      deleteMessagesFrom: unusedSessionOperation,
      editUserMessage: unusedSessionOperation,
      regenerate: unusedSessionOperation,
    }
    ctx.provide('eleckoiCreatorStudioRuntime', runtime)
    await ctx.plugin(ElecKoiCreatorStudioSessionsApi)
    const peer = ownerPeer(ctx)
    const namespace = 'eleckoiCreatorStudioSessions'
    const args = { sessionId: 'synthetic-session', path: [] }
    await expect(ctx.typertGateway.invoke({ peer, namespace, method: 'listWorkspaceFiles', args }))
      .rejects.toMatchObject({ code: codes.statePrecondition })
    ctx.eleckoiCreatorStudioSessionsApi.mountWorkspaceFiles(cwd, publish)
    const content = Buffer.from('script data')
    async function* upload() { yield content.toString('base64') }
    const imported = await ctx.typertGateway.stream({ peer, namespace, method: 'importWorkspaceFile',
      args: { ...args, name: 'script.bin', size: content.length }, uplink: upload() })
    expect(await collectFrames(imported)).toEqual([{ kind: 'ready', offset: 0 }, { kind: 'ready', offset: content.length }, { kind: 'complete' }])
    let requests = 0
    async function* demand() {
      for (let index = 0; index < 2; index++) {
        requests++
        yield true
      }
    }
    const exported = await ctx.typertGateway.stream({ peer, namespace, method: 'exportWorkspaceFiles',
      args: { ...args, entries: [await entry('script.bin')] }, uplink: demand() })
    const iterator = exported[Symbol.asyncIterator]()
    try {
      expect(await iterator.next()).toMatchObject({ value: { kind: 'file', name: 'script.bin' } })
      expect(requests).toBe(0)
      expect(await iterator.next()).toMatchObject({ value: { kind: 'chunk', data: content.toString('base64') } })
      expect(requests).toBe(1)
      expect(await iterator.next()).toMatchObject({ value: { kind: 'complete' } })
      expect(await iterator.next()).toMatchObject({ done: true })
      expect(requests).toBe(2)
    } finally {
      await iterator.return?.()
      await peer.dispose()
    }
  } finally { await ctx.fiber.dispose() }
})

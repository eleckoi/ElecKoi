import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, rmdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { UpdateService } from '../../src/main/modules/updates/UpdateService'
import { DesktopUpdateCoordinator } from '../../src/main/modules/updates/dsh/update-coordinator'
import { DesktopUpdateHttpExecutor } from '../../src/main/modules/updates/dsh/update-http-executor'

const root = process.env.ELECKOI_UPDATE_TEST_ROOT!
assert.ok(root)
app.setPath('userData', join(root, 'electron'))
const payload = Buffer.alloc(256 * 1024, 37)
const replacement = Buffer.alloc(payload.length, 38)
const sha512 = createHash('sha512').update(payload).digest('base64')
const replacementHash = createHash('sha512').update(replacement).digest('base64')
const attempts: { range: string | undefined; ifRange: string | undefined; bytes: number; status: number }[] = []
const assetHeaders: { accept: string | undefined; authorization: string | undefined }[] = []
let mode = 'healthy', fileRequests = 0, feedRequests = 0, blockmapRequests = 0, serial = 0
let assetUrl = ''
const server = createServer(async (request, response) => {
  if (/^\/(?:latest|nightly)\.yml/.test(request.url ?? '')) {
    feedRequests++
    if (mode === 'feed-stall') return
    if (mode === 'feed-error') { response.writeHead(503).end(); return }
    if (mode === 'hold-check') await delay(100)
    const version = mode === 'replaced' ? '1.0.2' : mode === 'no-update' ? '1.0.0' : '1.0.1'
    const hash = mode === 'corrupt' ? Buffer.alloc(64).toString('base64') : mode === 'replaced' ? replacementHash : sha512
    response.end(`version: ${version}\nfiles:\n  - url: installer.exe\n    sha512: ${hash}\n    size: ${payload.length}\npath: installer.exe\nsha512: ${hash}\nreleaseDate: '2026-01-01T00:00:00.000Z'\n`)
    return
  }
  if (request.url === '/installer.exe') {
    assert.equal(request.headers.authorization, 'Bearer fixture-token')
    response.writeHead(302, { Location: assetUrl }).end()
    return
  }
  if (request.url?.startsWith('/installer.exe.blockmap')) {
    blockmapRequests++
    response.writeHead(404).end()
    return
  }
  response.writeHead(404).end()
})
const assetServer = createServer(async (request, response) => {
  if (request.url === '/asset') {
    fileRequests++
    assetHeaders.push({ accept: request.headers.accept, authorization: request.headers.authorization })
    const range = request.headers.range
    const ifRange = typeof request.headers['if-range'] === 'string' ? request.headers['if-range'] : undefined
    const attempt = { range, ifRange, bytes: 0, status: 200 }
    attempts.push(attempt)
    const etag = ['changed-etag', 'replaced'].includes(mode) ? '"fixture-new"' : '"fixture"'
    const bytes = mode === 'replaced' ? replacement : payload
    const offset = range !== undefined && ifRange === etag && mode !== 'ignore-range' ? Number(/^bytes=(\d+)-$/.exec(range)?.[1]) : 0
    if (range !== undefined && mode === 'invalid-range') {
      attempt.status = 416
      response.writeHead(416).end()
      return
    }
    const headers: Record<string, string | number> = { 'Content-Length': bytes.length - offset, 'Content-Type': 'application/octet-stream' }
    if (mode !== 'no-etag') headers.ETag = etag
    if (offset > 0) {
      attempt.status = 206
      headers['Content-Range'] = `bytes ${mode === 'misaligned-range' ? offset - 1 : offset}-${bytes.length - 1}/${bytes.length}`
    }
    response.writeHead(attempt.status, headers)
    if (mode === 'disconnect') {
      response.write(payload.subarray(0, 16384))
      await delay(100)
      response.destroy()
      return
    }
    if (mode === 'file-stall') { response.write(payload.subarray(0, 16384)); return }
    if (mode === 'slow') {
      for (let offset = 0; offset < payload.length; offset += 4096) {
        if (response.destroyed) return
        response.write(payload.subarray(offset, offset + 4096))
        await delay(30)
      }
      response.end()
    } else {
      attempt.bytes = bytes.length - offset
      response.end(bytes.subarray(offset))
    }
    return
  }
  response.writeHead(404).end()
})

async function main() {
  await app.whenReady()
  const logs = join(root, 'logs')
  await mkdir(logs, { recursive: true })
  app.setPath('logs', logs)
  const restarting = process.env.ELECKOI_UPDATE_TEST_RESTART === '1'
  const portFile = join(root, 'origin-port.txt')
  const originPort = restarting ? Number(await readFile(portFile, 'utf8')) : 0
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(originPort, '127.0.0.1', resolve)
  })
  await new Promise<void>(resolve => assetServer.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const assetAddress = assetServer.address()
  assert.ok(address && typeof address !== 'string')
  assert.ok(assetAddress && typeof assetAddress !== 'string')
  if (!restarting) await writeFile(portFile, String(address.port))
  assetUrl = `http://127.0.0.1:${assetAddress.port}/asset`
  const url = `http://127.0.0.1:${address.port}`
  const cases: string[] = []
  async function fixture(initialMode: string, directory = join(root, String(++serial))) {
    mode = initialMode
    await mkdir(directory, { recursive: true })
    const config = join(directory, 'app-update.yml')
    await writeFile(config, 'updaterCacheDirName: cache\npublisherName: Fixture Publisher\n')
    const forbidden = () => { throw new Error('Installer execution and application exit are forbidden in this fixture') }
    const updater = new electronUpdater.NsisUpdater(undefined, {
      version: '1.0.0', name: 'synthetic-update-test', isPackaged: true,
      appUpdateConfigPath: config, userDataPath: directory, baseCachePath: directory,
      whenReady: async () => {}, quit: forbidden, relaunch: forbidden, onQuit: forbidden
    })
    updater.logger = null
    updater.requestHeaders = { Accept: 'application/octet-stream', Authorization: 'Bearer fixture-token' }
    Object.assign(updater, { httpExecutor: new DesktopUpdateHttpExecutor(1000) })
    updater.disableDifferentialDownload = true
    const states: ReturnType<UpdateService['status']>[] = []
    const installations: boolean[][] = []
    const signatureChecks: string[] = []
    updater.verifyUpdateCodeSignature = async (publishers, path) => {
      assert.deepEqual(publishers, ['Fixture Publisher'])
      assert.equal(path, join(directory, 'cache', 'pending', 'temp-installer.exe'))
      assert.deepEqual(await readFile(path), mode === 'replaced' ? replacement : payload)
      signatureChecks.push(path)
      return mode === 'invalid-signature' ? 'synthetic signature rejection' : null
    }
    let authorized = true, released = 0
    updater.quitAndInstall = (...args) => { installations.push(args as boolean[]) }
    const service = new UpdateService({
      updater, currentVersion: '1.0.0', enabled: true, disabledMessage: '',
      prepareInstall: async () => authorized, releaseInstall: async () => { released++ },
      publish: state => states.push(state), logger: { info() {}, warn() {}, error() {} }
    })
    updater.setFeedURL({ provider: 'generic', url, channel: 'latest' })
    service.start()
    return { service, updater, states, installations, signatureChecks, directory, resume: join(directory, 'cache', 'resume'),
      pending: join(directory, 'cache', 'pending'), released: () => released,
      authorize: (value: boolean) => { authorized = value } }
  }
  async function scenario(name: string, run: () => Promise<void>) {
    await run()
    cases.push(name)
  }
  try {
    const restartDirectory = join(root, 'restart')
    if (restarting) {
      const next = await fixture('healthy', restartDirectory)
      try {
        assert.equal((await next.service.check()).phase, 'available')
        assert.equal((await next.service.download()).phase, 'ready')
        assert.deepEqual(attempts, [{ range: 'bytes=16384-', ifRange: '"fixture"', bytes: payload.length - 16384, status: 206 }])
        assert.equal((await next.service.install()).accepted, true)
        assert.deepEqual(next.installations, [[true, true]])
        await assert.rejects(stat(next.resume), { code: 'ENOENT' })
        await writeFile(join(root, 'restarted.json'), JSON.stringify({ resumed: true }))
      } finally { next.service.dispose() }
      return
    }
    await scenario('concurrent checks and downloads, checksum, separate install and Host unlock', async () => {
      const f = await fixture('hold-check')
      try {
        const before = feedRequests
        const checks = await Promise.all([f.service.check(), f.service.check()])
        assert.ok(checks.every(state => state.phase === 'available'))
        assert.equal(feedRequests - before, 1)
        assert.equal(fileRequests, 0)
        const downloads = await Promise.all([f.service.download(), f.service.download()])
        assert.ok(downloads.every(state => state.phase === 'ready'))
        assert.equal(fileRequests, 1)
        assert.deepEqual(assetHeaders, [{ accept: 'application/octet-stream', authorization: undefined }])
        assert.equal(f.signatureChecks.length, 1)
        assert.equal(f.installations.length, 0)
        f.authorize(false)
        assert.deepEqual(await f.service.install(), { accepted: false, reason: 'agent_running' })
        f.authorize(true)
        assert.equal((await f.service.install()).accepted, true)
        assert.equal(f.installations.length, 1)
        f.updater.emit('error', new Error('synthetic installation failure'))
        await delay(0)
        assert.equal(f.service.status().failedOperation, 'install')
        assert.equal(f.released(), 1)
        assert.equal((await f.service.install()).accepted, true)
        assert.equal(f.installations.length, 2)
        assert.equal(fileRequests, 1)
      } finally { f.service.dispose() }
    })
    for (const failure of ['disconnect', 'file-stall']) {
      await scenario(`${failure}: pending cleanup preserves the prefix, retry transfers the exact remainder`, async () => {
        const f = await fixture(failure)
        try {
          await f.service.check()
          const failed = await f.service.download()
          assert.equal(failed.phase, 'error')
          assert.equal(failed.failedOperation, 'download')
          assert.equal(f.states.filter(state => state.phase === 'error').length, 1)
          await assert.rejects(stat(join(f.pending, 'temp-installer.exe')), { code: 'ENOENT' })
          const saved = (await stat(join(f.resume, 'installer.part'))).size
          assert.equal(saved, 16384)
          mode = 'healthy'
          assert.equal((await f.service.download()).phase, 'ready')
          assert.deepEqual(attempts.at(-1), { range: `bytes=${saved}-`, ifRange: '"fixture"', bytes: payload.length - saved, status: 206 })
          assert.ok(f.states.some(state => state.phase === 'downloading' && state.progress?.transferredBytes === saved))
          assert.deepEqual(await readFile(join(f.pending, 'installer.exe')), payload)
          await assert.rejects(stat(f.resume), { code: 'ENOENT' })
        } finally { f.service.dispose() }
      })
    }
    await scenario('interrupted full download persists on disk across process exit', async () => {
      const first = await fixture('file-stall', restartDirectory)
      try {
        await first.service.check()
        assert.equal((await first.service.download()).phase, 'error')
        assert.equal((await stat(join(first.resume, 'installer.part'))).size, 16384)
      } finally { first.service.dispose() }
    })
    await scenario('the standard differential failure falls back to the resumable full installer', async () => {
      const f = await fixture('file-stall')
      f.updater.disableDifferentialDownload = false
      try {
        const before = blockmapRequests
        await f.service.check()
        assert.equal((await f.service.download()).phase, 'error')
        assert.ok(blockmapRequests > before)
        mode = 'healthy'
        assert.equal((await f.service.download()).phase, 'ready')
        assert.equal(attempts.at(-1)?.range, 'bytes=16384-')
        assert.equal(attempts.at(-1)?.status, 206)
        await assert.rejects(stat(f.resume), { code: 'ENOENT' })
      } finally { f.service.dispose() }
    })
    await scenario('a channel change cancels an active write before retiring the old partial', async () => {
      const f = await fixture('file-stall')
      f.service.dispose()
      const coordinator = new DesktopUpdateCoordinator(state => state, async () => true, f.updater, () => true, () => '1.0.0',
        undefined, 'latest')
      try {
        const checked = await coordinator.check(true)
        assert.equal(checked.phase, 'available')
        const download = coordinator.download(checked.version!)
        const part = join(f.resume, 'installer.part')
        for (let attempt = 0; attempt < 50; attempt++) {
          if ((await stat(part).catch(() => undefined))?.size === 16384) break
          await delay(10)
        }
        assert.equal((await stat(part)).size, 16384)
        mode = 'healthy'
        assert.equal(await coordinator.switchChannel('nightly', async () => {}), 'applied')
        await download
        assert.equal(coordinator.state.phase, 'available')
        await assert.rejects(stat(f.resume), { code: 'ENOENT' })
        assert.equal((await coordinator.download(checked.version!)).phase, 'ready')
        assert.equal(attempts.at(-1)?.range, undefined)
      } finally { coordinator.dispose() }
    })
    for (const behavior of ['ignore-range', 'changed-etag', 'invalid-range', 'misaligned-range', 'no-etag']) {
      await scenario(`${behavior}: download recovers without appending to an incompatible prefix`, async () => {
        const f = await fixture('file-stall')
        try {
          await f.service.check()
          assert.equal((await f.service.download()).phase, 'error')
          mode = behavior
          const before = attempts.length
          assert.equal((await f.service.download()).phase, 'ready')
          assert.equal(attempts[before]?.range, 'bytes=16384-')
          assert.deepEqual(attempts.at(-1), {
            range: ['ignore-range', 'changed-etag'].includes(behavior) ? 'bytes=16384-' : undefined,
            ifRange: ['ignore-range', 'changed-etag'].includes(behavior) ? '"fixture"' : undefined,
            bytes: payload.length, status: 200,
          })
          assert.deepEqual(await readFile(join(f.pending, 'installer.exe')), payload)
          await assert.rejects(stat(f.resume), { code: 'ENOENT' })
        } finally { f.service.dispose() }
      })
    }
    for (const refreshed of ['replaced', 'no-update']) {
      await scenario(`${refreshed}: a successful check removes the old partial`, async () => {
        const f = await fixture('file-stall')
        try {
          await f.service.check()
          assert.equal((await f.service.download()).phase, 'error')
          await stat(f.resume)
          mode = 'feed-error'
          assert.equal((await f.service.check()).phase, 'error')
          await stat(f.resume)
          mode = refreshed
          assert.equal((await f.service.check()).phase, refreshed === 'replaced' ? 'available' : 'idle')
          await assert.rejects(stat(f.resume), { code: 'ENOENT' })
          if (refreshed === 'replaced') {
            assert.equal((await f.service.download()).phase, 'ready')
            assert.equal(attempts.at(-1)?.range, undefined)
            assert.deepEqual(await readFile(join(f.pending, 'installer.exe')), replacement)
          }
        } finally { f.service.dispose() }
      })
    }
    await scenario('incorrect checksum never becomes installable', async () => {
      const f = await fixture('corrupt')
      try {
        await f.service.check()
        const failed = await f.service.download()
        assert.equal(failed.phase, 'error')
        assert.match(failed.message!, /sha512 checksum mismatch/)
        await assert.rejects(stat(f.resume), { code: 'ENOENT' })
        assert.equal(f.signatureChecks.length, 0)
        assert.equal((await f.service.install()).accepted, false)
        assert.equal(f.installations.length, 0)
      } finally { f.service.dispose() }
    })
    await scenario('signature rejection runs through NSIS preparation and clears the staged installer', async () => {
      const f = await fixture('invalid-signature')
      try {
        await f.service.check()
        const failed = await f.service.download()
        assert.equal(failed.phase, 'error')
        assert.match(failed.message!, /synthetic signature rejection/)
        assert.equal(f.signatureChecks.length, 1)
        assert.equal((await f.service.install()).accepted, false)
        await assert.rejects(stat(join(f.pending, 'temp-installer.exe')), { code: 'ENOENT' })
        await assert.rejects(stat(f.resume), { code: 'ENOENT' })
      } finally { f.service.dispose() }
    })
    await scenario('failed resume cleanup logs the path and leaves the standard updater usable', async () => {
      const f = await fixture('healthy')
      try {
        await f.service.check()
        const occupied = join(f.resume, 'installer.part')
        await mkdir(occupied, { recursive: true })
        assert.equal((await f.service.download()).phase, 'ready')
        assert.equal(attempts.at(-1)?.range, undefined)
        assert.ok((await stat(occupied)).isDirectory())
        const log = await readFile(join(logs, 'update-cleanup.jsonl'), 'utf8')
        assert.ok(log.split('\n').filter(Boolean).map(line => JSON.parse(line))
          .some(entry => entry.operation === 'remove' && entry.path === f.resume))
        await rmdir(occupied)
        // Reopen the same updater cache and let a settled check retry the deferred cleanup.
        const reopened = await fixture('no-update', f.directory)
        try {
          assert.equal((await reopened.service.check()).phase, 'idle')
          await assert.rejects(stat(f.resume), { code: 'ENOENT' })
        } finally { reopened.service.dispose() }
      } finally { f.service.dispose() }
    })
    await scenario('feed silence times out and manual check recovers', async () => {
      const f = await fixture('feed-stall')
      try {
        const failed = await f.service.check()
        assert.equal(failed.failedOperation, 'check')
        assert.match(failed.message!, /timed out/)
        mode = 'healthy'
        assert.equal((await f.service.check()).phase, 'available')
      } finally { f.service.dispose() }
    })
    await scenario('active transfer can exceed the inactivity deadline', async () => {
      const f = await fixture('slow')
      try {
        await f.service.check()
        const start = Date.now()
        assert.equal((await f.service.download()).phase, 'ready')
        assert.ok(Date.now() - start > 1000)
        assert.ok(f.states.some(state => state.phase === 'verifying'))
        assert.ok(!f.states.some(state => state.phase === 'error'))
      } finally { f.service.dispose() }
    })
    await writeFile(join(root, 'results.json'), JSON.stringify({ cases, fileRequests, feedRequests }))
  } finally {
    server.closeAllConnections()
    assetServer.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await new Promise<void>(resolve => assetServer.close(() => resolve()))
  }
}

void main().then(() => app.exit(0), error => { console.error(error); app.exit(1) })

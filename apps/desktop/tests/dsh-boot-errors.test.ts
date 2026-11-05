import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { DesktopFatalRecovery } from '../src/main/platform/electron/desktopFatalRecovery'
import { DesktopError } from '../../../packages/shared/src/foundation/DesktopError'
import { ELECKOI_FAILURE_CODES } from '../../../packages/shared/src/contracts/errors/codes'

const require = createRequire(import.meta.url)
let directory: string
let failures: Array<{ index: number; message: string; pageDetail: string }>

beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-boot-errors-'))
  const report = resolve(directory, 'report.json')
  const frontend = resolve(dirname(require.resolve('@deepseek-ai/dsh-web-frontend/package.json')), 'dist')
  const { build } = createRequire(require.resolve('vite/package.json'))('esbuild')
  await build({
    entryPoints: {
      preload: 'apps/desktop/src/preload/preload.ts',
      transport: 'apps/desktop/src/main/platform/electron/dshClientDocument.ts'
    },
    outdir: directory, outExtension: { '.js': '.cjs' }, bundle: true, format: 'cjs', platform: 'node',
    alias: { '@shared': resolve('packages/shared/src') }, external: ['electron'], logLevel: 'silent'
  })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  await promisify(execFile)(require('electron'), [resolve('apps/desktop/tests/fixtures/dsh-boot-errors.probe.cjs'), frontend, directory, report], {
    env, windowsHide: true, timeout: 45_000
  })
  failures = JSON.parse(await readFile(report, 'utf8'))
}, 50_000)

afterAll(async () => {
  if (!directory) return
  const child = relative(resolve(tmpdir()), directory)
  if (!child || child === '..' || child.startsWith('..' + sep)) throw new Error('Probe profile escaped the temporary directory')
  await rm(directory, { recursive: true, force: true, maxRetries: 3 })
})

it.each([
  [0, ['Synthetic request failed', 'synthetic/network', '503', '"attempts": 0', '"retryable": false', 'Synthetic nested cause']],
  [1, ['Synthetic standard failure', 'synthetic/standard', 'bootstrap', 'Synthetic inner failure', 'dsh-app://app/']],
  [2, ['Synthetic aggregate', 'Synthetic first member', 'Synthetic second member', 'synthetic/member', 'Synthetic aggregate cause']],
  [3, ['Synthetic circular failure', '完整诊断'.repeat(2000) + 'SYNTHETIC_END', '42n', '$ref']],
  [4, ['TypeError', 'Synthetic foreign error', 'synthetic/foreign', 'dsh-app://app/']],
  [5, ['Synthetic literal failure']],
  [6, ['Synthetic aborted request', 'AbortError', '"code": 20']],
  [7, ['Synthetic accessor failure', 'Accessor not evaluated']]
] as const)('retains original browser boot failure %i through the native recovery dialog', async (index, expected) => {
  const message = failures[index]!.message
  expect(failures[index]!.pageDetail).toBe(message)
  const operations = {
    show: vi.fn().mockResolvedValue({ response: 0 }), stop: vi.fn().mockResolvedValue(undefined),
    disableUserPlugins: vi.fn(), restart: vi.fn(), exit: vi.fn(), diagnostic: vi.fn()
  }
  await new DesktopFatalRecovery(operations).report(new DesktopError(
    ELECKOI_FAILURE_CODES.pluginLoadFailed, message, { what: 'DSH 插件页面启动' }
  ))
  const detail = operations.show.mock.calls[0]![0].detail as string
  for (const text of expected) {
    expect(message).toContain(text)
    expect(detail).toContain(text)
  }
  expect(message).not.toBe('[object Object]')
  expect(operations.diagnostic).toHaveBeenCalledOnce()
  expect(operations.stop).toHaveBeenCalledOnce()
  expect(operations.exit).toHaveBeenCalledOnce()
  expect(operations.disableUserPlugins).not.toHaveBeenCalled()
})

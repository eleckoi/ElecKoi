import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild')

it('releases renderer diagnostics across real Electron close and destroy paths', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-window-console-'))
  try {
    await build({ entryPoints: ['apps/desktop/src/main/platform/electron/mainWindowConsole.ts'],
      outfile: resolve(directory, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
      alias: { '@main': resolve('apps/desktop/src/main'), '@shared': resolve('packages/shared/src') } })
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    await promisify(execFile)(require('electron'), [resolve('apps/desktop/tests/fixtures/main-window-console.probe.cjs'), directory],
      { env, windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 })
    const report = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'))
    await mkdir('build/window-console-lifecycle-check', { recursive: true })
    await copyFile(resolve(directory, 'report.json'), 'build/window-console-lifecycle-check/native.json')
    expect(report.failure).toBeUndefined()
    expect(report.uncaught).toEqual([])
    expect(report.scenarios).toHaveLength(3)
    for (const scenario of report.scenarios) {
      expect(scenario).toMatchObject({ liveLogged: true, ownerDestroyed: true, contentsDestroyed: true,
        loggingReleased: true, lateLogged: false })
      expect(scenario.lateError).toBeUndefined()
      expect(scenario.afterCloseError).toBeUndefined()
    }
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }) }
}, 45_000)

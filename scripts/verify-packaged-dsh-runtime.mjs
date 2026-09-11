import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const unpacked = process.env.ELECKOI_UNPACKED_DIR ?? join(process.cwd(), 'release', 'win-unpacked')
const executable = join(unpacked, 'ElecKoi.exe')
const appAsar = join(unpacked, 'resources', 'app.asar')

if (!existsSync(executable) || !existsSync(appAsar)) {
  throw new Error(`找不到已解包的 ElecKoi：${unpacked}`)
}

const probe = `
  import('node:fs/promises').then(async ({ mkdtemp, rm }) => {
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { pathToFileURL } = await import('node:url')
    const appAsar = ${JSON.stringify(appAsar)}
    const runtimeUrl = pathToFileURL(join(appAsar, 'node_modules', '@eleckoi', 'dsh-runtime', 'dist', 'index.mjs')).href
    const { DshRuntime } = await import(runtimeUrl)
    const root = await mkdtemp(join(tmpdir(), 'eleckoi-packaged-dsh-'))
    const runtime = new DshRuntime({
      configPath: join(appAsar, 'resources', 'dsh', 'cordis.yml'),
      presetTemplatePath: join(appAsar, 'resources', 'dsh', 'agent-preset-template', 'agent.cordis.yml'),
      workspaceRoot: join(root, 'workspace'),
      runtimeDataRoot: join(root, 'runtime'),
      executablePath: process.execPath
    })
    try {
      await runtime.verify()
      process.stdout.write('Packaged DSH runtime handshake passed.\\n')
    } finally {
      await runtime.close()
      await rm(root, { recursive: true, force: true })
    }
  }).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
`

const result = spawnSync(executable, ['-e', probe], {
  cwd: unpacked,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
  timeout: 30_000
})

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Packaged DSH runtime handshake failed.\n')
  process.exit(result.status ?? 1)
}

process.stdout.write(result.stdout)

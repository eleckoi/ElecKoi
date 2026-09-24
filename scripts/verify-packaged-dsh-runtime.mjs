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
  import('node:fs/promises').then(async ({ access, mkdtemp, readFile, rm }) => {
    const { createServer } = await import('node:http')
    const { once } = await import('node:events')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { pathToFileURL } = await import('node:url')
    const appAsar = ${JSON.stringify(appAsar)}
    const mainSource = await readFile(join(appAsar, 'out', 'main', 'main.js'), 'utf8')
    const externalUpdaterDependencies = ['electron-updater', 'builder-util-runtime', 'debug', 'sax']
    for (const dependency of externalUpdaterDependencies) {
      const loadMarkers = ['require("' + dependency, "require('" + dependency]
      if (loadMarkers.some((marker) => mainSource.includes(marker))) {
        throw new Error('Packaged main process still loads ' + dependency + ' as an external dependency.')
      }
    }
    if (!mainSource.includes('class AppUpdater') || !mainSource.includes('NsisUpdater')) {
      throw new Error('Packaged main process does not contain the bundled updater runtime.')
    }
    process.stdout.write('Packaged updater runtime check passed.\\n')
    const buildTimeBrowserPackages = [
      '@fortawesome/fontawesome-free',
      '@tailwindcss/browser',
      'jquery',
      'jquery-ui-dist',
      'jquery-ui-touch-punch',
      'lodash',
      'pixi.js',
      'showdown',
      'toastr',
      'vue',
      'vue-router'
    ]
    for (const dependency of buildTimeBrowserPackages) {
      try {
        await access(join(appAsar, 'node_modules', ...dependency.split('/')))
      } catch (error) {
        if (error?.code === 'ENOENT') continue
        throw error
      }
      throw new Error('Build-time browser package leaked into app.asar: ' + dependency)
    }
    process.stdout.write('Packaged browser dependency boundary check passed.\\n')
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
    let server
    try {
      await runtime.verify()
      process.stdout.write('Packaged DSH runtime handshake passed.\\n')
      server = createServer(async (request, response) => {
        for await (const _chunk of request) {}
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache'
        })
        const base = {
          id: 'chatcmpl-packaged-probe',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'packaged-probe-model'
        }
        const send = (choice) => response.write('data: ' + JSON.stringify({
          ...base,
          choices: [{ index: 0, ...choice }]
        }) + '\\n\\n')
        send({ delta: { role: 'assistant', content: '' }, finish_reason: null })
        send({ delta: { content: 'packaged probe ok' }, finish_reason: null })
        send({ delta: {}, finish_reason: 'stop' })
        response.end('data: [DONE]\\n\\n')
      })
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const address = server.address()
      if (address === null || typeof address === 'string') {
        throw new Error('Packaged DSH probe server did not expose a TCP port.')
      }
      const final = []
      await runtime.stream(
        'packaged-probe-conversation',
        'hello',
        {
          configId: 'packaged-probe-config',
          provider: 'custom',
          apiKey: 'packaged-probe-key',
          baseUrl: 'http://127.0.0.1:' + address.port,
          model: 'packaged-probe-model',
          systemPrompt: '',
          apiFormat: 'openai-completions',
          customHeaders: {},
          contextWindow: 128000,
          autoCompactTokenLimit: 96000,
          supportsImageInput: false
        },
        { onDelta() {}, onFinal(content) { final.push(content) } },
        undefined,
        {
          characterId: 'packaged-probe-character',
          characterName: 'Probe Character',
          persona: {},
          history: [],
          settingLibrary: {
            characterId: 'packaged-probe-character',
            name: 'Probe Library',
            entries: [],
            groups: [],
            promptPositions: []
          }
        },
        'packaged-probe-thread',
        {
          disabledGroupIds: [
            'builtin:variables',
            'builtin:web',
            'builtin:workspace',
            'builtin:roleplay-workflow'
          ]
        },
        [],
        [],
        {
          id: 'agent-preset-standard',
          versionId: 'packaged-probe-v1',
          name: 'Packaged Probe',
          roleplayPlan: { steps: [] }
        }
      )
      if (final.join('') !== 'packaged probe ok') {
        throw new Error('Packaged DSH probe did not return the expected final reply.')
      }
      process.stdout.write('Packaged DSH preset, Agent plane and local turn passed.\\n')
    } finally {
      await runtime.close()
      if (server !== undefined) {
        server.close()
        await once(server, 'close')
      }
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
  timeout: 120_000
})

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Packaged DSH runtime handshake failed.\n')
  process.exit(result.status ?? 1)
}

process.stdout.write(result.stdout)

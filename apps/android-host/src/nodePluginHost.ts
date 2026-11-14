import { createInterface } from 'node:readline'
import { startPluginHostApplication, type PluginHostApplication } from './pluginHostApplication'
import { loadNodeHostConfiguration, nodeHostPackageManager, preparePluginHost } from './pluginHostConfiguration'
import { disableAndroidUserPlugins } from './androidPluginRecovery'
import {
  HOST_CONTROL_PROTOCOL_VERSION, HOST_CONTROL_STDOUT_PREFIX, isParentHostMessage,
  type ChildHostMessage
} from './hostSessionProtocol'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { formatHostDiagnostic } from '@eleckoi/dsh-runtime'

type NodeHostMessage = ChildHostMessage | { type: 'control-error'; message: string; id?: string }

function send(message: NodeHostMessage): Promise<void> {
  const line = `${HOST_CONTROL_STDOUT_PREFIX}${JSON.stringify({ protocolVersion: HOST_CONTROL_PROTOCOL_VERSION, ...message })}\n`
  return new Promise((resolve, reject) => process.stdout.write(line, error => error ? reject(error) : resolve()))
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args[0] !== '--config' || (args.length !== 2 && !(args.length === 3 && args[2] === '--disable-user-plugins'))) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'Usage: node eleckoi-host.mjs --config /absolute/path/runtime-config.json [--disable-user-plugins]', { field: 'argv' })
  }
  const config = loadNodeHostConfiguration(args[1]!)
  if (args[2] === '--disable-user-plugins') {
    const backupPath = disableAndroidUserPlugins(config.homeRoot)
    await send({ type: 'profile-recovered', ...(backupPath === undefined ? {} : { backupPath }) })
  }
  const prepared = preparePluginHost(config)
  Object.assign(process.env, prepared.environment)
  process.chdir(prepared.profileDirectory)
  const application = startPluginHostApplication({
    profileDirectory: prepared.profileDirectory,
    patchFiles: prepared.patchFiles,
    clientDirectory: config.clientDirectory,
    packageManager: nodeHostPackageManager(config)
  })
  // IO is attached before boot finishes, so shutdown during startup is observed.
  const controls = createInterface({ input: process.stdin, crlfDelay: Infinity })
  let stopping: Promise<void> | undefined
  let queue = Promise.resolve()
  const stop = (): Promise<void> => stopping ??= (async () => {
    controls.removeAllListeners('line')
    controls.removeListener('close', onSignal)
    controls.close()
    process.removeListener('SIGTERM', onSignal)
    process.removeListener('SIGINT', onSignal)
    const host = await application
    await host.close()
    await send({ type: 'shutdown-complete' })
  })()
  const onSignal = (): void => { void stop().catch(reportFailure) }
  controls.on('line', line => {
    if (!line.trim()) return
    queue = queue.then(async () => {
      let value: unknown
      try { value = JSON.parse(line) }
      catch (error) {
        await send({ type: 'control-error', message: `Invalid control JSON: ${error instanceof Error ? error.message : String(error)}` })
        return
      }
      if (!isParentHostMessage(value)) {
        await send({ type: 'control-error', message: 'Unknown ElecKoi Host control message' })
        return
      }
      if (value.type === 'shutdown') { await stop(); return }
      if (stopping !== undefined) {
        await send({ type: 'update-tasks-complete', id: value.id, active: true, message: 'ElecKoi Host is stopping' })
        return
      }
      const host = await application
      try {
        await send({ type: 'update-tasks-complete', id: value.id, active: await host.control(value) })
      } catch (error) {
        await send({ type: 'update-tasks-complete', id: value.id, active: true,
          message: error instanceof Error ? error.message : String(error) })
      }
    }).catch(reportFailure)
  })
  controls.once('close', onSignal)
  process.once('SIGTERM', onSignal)
  process.once('SIGINT', onSignal)
  let running: PluginHostApplication | undefined
  try {
    running = await application
    if (stopping === undefined) await send({ type: 'ready', ...running.ready })
  } catch (error) {
    controls.removeAllListeners()
    controls.close()
    process.removeListener('SIGTERM', onSignal)
    process.removeListener('SIGINT', onSignal)
    if (running !== undefined) {
      try { await running.close() }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Host transport and shutdown failed') }
    }
    throw error
  }
}

let failureReported = false
function reportFailure(error: unknown): void {
  if (failureReported) return
  failureReported = true
  const message = error instanceof Error ? error.message : String(error)
  void send({ type: 'fatal', message }).catch(sendError => { console.error(sendError) })
  console.error(formatHostDiagnostic(error))
  process.exitCode = 1
}

void main().catch(reportFailure)

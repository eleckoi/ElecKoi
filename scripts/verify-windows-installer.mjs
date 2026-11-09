import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { AclWriteGrant, workspaceWriteSid } from '@deepseek-ai/dsh-sandbox-windows-acl'
import { isMediumIntegrity } from './windows-integrity-label.mjs'

if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
  throw Error('Windows installer verification runs only in the GitHub Release workflow.')
}
if (!process.env.RUNNER_TEMP || !isAbsolute(process.env.RUNNER_TEMP)) throw Error('Hosted runner temporary directory is missing.')
const require = createRequire(import.meta.url)
const version = JSON.parse(readFileSync('apps/desktop/package.json', 'utf8')).version
const installer = resolve(process.argv[2] ?? '')
if (basename(installer) !== `ElecKoi-${version}-x64-setup.exe` || !existsSync(installer)) throw Error('Expected Windows installer is missing.')
const fixture = mkdtempSync(join(process.env.RUNNER_TEMP, 'eleckoi-installer-'))
const directory = join(fixture, 'affected installation')
const profile = join(fixture, 'profile')
const marker = join(profile, 'keep-user-data.txt')
let grant

function run(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8', windowsHide: true, timeout: 180_000 })
  if (result.error || result.status !== 0) throw Error(`Installer check failed (${result.status}): ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`)
  return result
}

async function startAndClose(label) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  rmSync(join(profile, 'DevToolsActivePort'), { force: true })
  const child = spawn(join(directory, 'ElecKoi.exe'), ['--user-data-dir=' + profile,
    '--remote-debugging-port=0', '--enable-logging=file', '--log-file=' + join(fixture, label + '.log')], { env, windowsHide: true })
  let output = ''
  child.stdout.on('data', data => { output = (output + data).slice(-12_000) })
  child.stderr.on('data', data => { output = (output + data).slice(-12_000) })
  let socket
  try {
    const deadline = Date.now() + 90_000
    let target
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw Error(`Installed app exited during ${label} (${child.exitCode}): ${output}`)
      if (existsSync(join(profile, 'DevToolsActivePort'))) {
        const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0]
        try {
          const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())
          target = targets.find(item => item.type === 'page' && item.url === 'dsh-app://app/')
          if (target) break
        } catch {}
      }
      await delay(250)
    }
    if (!target) throw Error(`Installed app did not open its main page during ${label}: ${output}`)
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((accept, reject) => { socket.addEventListener('open', accept, { once: true }); socket.addEventListener('error', reject, { once: true }) })
    let next = 0
    const pending = new Map()
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      const receiver = pending.get(message.id)
      if (receiver) { pending.delete(message.id); message.error ? receiver.reject(Error(JSON.stringify(message.error))) : receiver.accept(message.result) }
    })
    const call = (method, params = {}) => new Promise((accept, reject) => {
      const id = ++next
      const timeout = setTimeout(() => { pending.delete(id); reject(Error(`CDP ${method} timed out`)) }, 10_000)
      pending.set(id, { accept: value => { clearTimeout(timeout); accept(value) }, reject: error => { clearTimeout(timeout); reject(error) } })
      socket.send(JSON.stringify({ id, method, params }))
    })
    let ready = false
    while (Date.now() < deadline) {
      const state = await call('Runtime.evaluate', { expression: `Boolean(document.querySelector('.qq-shell'))`, returnByValue: true })
      if (state.result?.value === true) { ready = true; break }
      await delay(250)
    }
    if (!ready) throw Error(`Installed client did not mount during ${label}: ${output}`)
    await call('Runtime.evaluate', { expression: 'window.close()' }).catch(() => {})
    await Promise.race([new Promise(accept => { if (child.exitCode !== null) accept(); else child.once('exit', accept) }), delay(15_000)])
    if (child.exitCode !== 0) throw Error(`Installed app did not shut down normally during ${label}: ${output}`)
    console.log(`Installed app ${label}: main page mounted and exited normally.`)
  } finally {
    socket?.close()
    if (child.exitCode === null) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  }
}

try {
  mkdirSync(directory)
  mkdirSync(profile)
  writeFileSync(marker, 'synthetic retained data')
  const quoted = directory.replaceAll("'", "''")
  run('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', `$a=Get-Acl -LiteralPath '${quoted}';$r=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r);Set-Acl -LiteralPath '${quoted}' -AclObject $a`])
  grant = AclWriteGrant.create(workspaceWriteSid(directory))
  grant.add(directory)
  run(installer, ['/S', '/D=' + directory])
  // Check the actual installed bytes before starting any product process.
  const kof = require('koffi'), adv = kof.load('advapi32.dll'), kernel = kof.load('kernel32.dll')
  const get = adv.func('uint32 __stdcall GetNamedSecurityInfoW(str16, int, uint32, void*, void*, void*, void*, _Out_ void**)')
  const text = adv.func('int __stdcall ConvertSecurityDescriptorToStringSecurityDescriptorW(void*, uint32, uint32, _Out_ void**, void*)')
  const free = kernel.func('void* __stdcall LocalFree(void*)')
  for (const name of ['ElecKoi.exe', 'Uninstall ElecKoi.exe', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'ffmpeg.dll', 'vk_swiftshader.dll', 'vulkan-1.dll']) {
    const descriptor = [null], output = [null]
    if (get(join(directory, name), 1, 0x10, null, null, null, null, descriptor) !== 0) throw Error(`Cannot inspect installed ${name}`)
    try {
      if (!text(descriptor[0], 1, 0x10, output, null)) throw Error(`Cannot decode installed ${name}`)
      try {
        const label = kof.decode.string16(output[0])
        if (!isMediumIntegrity(label)) throw Error(`Installed ${name} still has abnormal integrity: ${label}`)
        console.log(`Installed ${name} integrity: ${label || '(implicit Medium)'}`)
      } finally { free(output[0]) }
    } finally { free(descriptor[0]) }
  }
  await startAndClose('first launch')
  await startAndClose('cold restart')
  if (readFileSync(marker, 'utf8') !== 'synthetic retained data') throw Error('Synthetic user data changed')
  grant.dispose(); grant = undefined
  run(join(directory, 'Uninstall ElecKoi.exe'), ['/S', '_?=' + directory])
  if (readFileSync(marker, 'utf8') !== 'synthetic retained data') throw Error('Uninstall removed synthetic user data')
  console.log('Installer Low-integrity recovery, cold restart and retained-data checks passed.')
} finally {
  grant?.dispose()
  // This check requires a GitHub-hosted Windows VM, which is discarded after
  // the job. Leave the disposable installation to that lifecycle: Windows may
  // still hold deleted executable files after the uninstaller returns, and a
  // second recursive deletion must not replace the actual verification result.
}

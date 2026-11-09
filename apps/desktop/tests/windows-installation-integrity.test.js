import { createRequire } from 'node:module'
import { cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isMediumIntegrity } from '../../../scripts/windows-integrity-label.mjs'

const require = createRequire(import.meta.url)
const helper = resolve('apps/desktop/resources/installer/eleckoi-installation.exe')
const runtimeLibraries = ['d3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'ffmpeg.dll', 'vk_swiftshader.dll', 'vulkan-1.dll']
let root
let grant
let readSecurity
let setFullControl
let AclWriteGrant
let workspaceWriteSid

describe.skipIf(process.platform !== 'win32')('Windows installation integrity', () => {
  beforeAll(async () => {
    const compiled = spawnSync(process.execPath, ['scripts/build-windows-installation-helper.mjs'], { encoding: 'utf8', windowsHide: true })
    expect(compiled.status, compiled.stdout + compiled.stderr).toBe(0)
    ;({ AclWriteGrant, workspaceWriteSid } = await import('@deepseek-ai/dsh-sandbox-windows-acl'))
    const koffi = require('koffi')
    const advapi = koffi.load('advapi32.dll')
    const kernel = koffi.load('kernel32.dll')
    const get = advapi.func('uint32 __stdcall GetNamedSecurityInfoW(str16, int, uint32, void*, void*, _Out_ void**, _Out_ void**, _Out_ void**)')
    const stringify = advapi.func('bool __stdcall ConvertSecurityDescriptorToStringSecurityDescriptorW(void*, uint32, uint32, _Out_ void**, void*)')
    const free = kernel.func('void* __stdcall LocalFree(void*)')
    readSecurity = path => {
      const descriptor = [null], dacl = [null], label = [null]
      expect(get(path, 1, 0x17, null, null, dacl, label, descriptor)).toBe(0)
      try {
        const output = [null]
        expect(stringify(descriptor[0], 1, 0x17, output, null)).toBe(true)
        try { return koffi.decode(output[0], 'char16_t', -1) } finally { free(output[0]) }
      } finally { free(descriptor[0]) }
    }
    // A grant requires WRITE_OWNER as well as ownership of its synthetic root.
    setFullControl = path => {
      const code = `$a=Get-Acl -LiteralPath '${path.replaceAll("'", "''")}';$r=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r);Set-Acl -LiteralPath '${path.replaceAll("'", "''")}' -AclObject $a`
      const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { encoding: 'utf8', windowsHide: true })
      expect(result.status, result.stdout + result.stderr).toBe(0)
    }
    root = mkdtempSync(join(tmpdir(), 'eleckoi-install-integrity-'))
  }, 60_000)

  afterAll(() => {
    grant?.dispose()
    if (root) {
      const child = relative(tmpdir(), root)
      if (!child || child.startsWith('..') || isAbsolute(child)) throw Error('Invalid fixture cleanup path')
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('recognizes implicit Medium while rejecting Low, unknown and mixed mandatory labels', () => {
    expect(isMediumIntegrity('S:')).toBe(true)
    expect(isMediumIntegrity('S:(ML;;NW;;;ME)')).toBe(true)
    expect(isMediumIntegrity('S:(ML;ID;NW;;;S-1-16-8192)')).toBe(true)
    for (const label of ['S:(ML;;NW;;;LW)', 'S:(ML;;NW;;;S-1-16-4096)', 'S:(ML;;NW;;;UN)',
      'S:(ML;;NW;;;UNKNOWN)', 'S:(ML;;NW;;;ME)(ML;;NW;;;LW)']) expect(isMediumIntegrity(label)).toBe(false)
    const directory = join(root, 'normal staging')
    mkdirSync(directory)
    setFullControl(directory)
    for (const name of ['ElecKoi.exe', ...runtimeLibraries]) writeFileSync(join(directory, name), 'synthetic normal file')
    const before = readSecurity(join(directory, 'ElecKoi.exe'))
    expect(isMediumIntegrity(before)).toBe(true)
    const result = spawnSync(helper, ['--repair', directory], { encoding: 'utf8', windowsHide: true })
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(readSecurity(join(directory, 'ElecKoi.exe'))).toBe(before)
  })

  it('repairs inherited Low labels without changing directory security, file access, owner, contents, or unrelated files', () => {
    const directory = join(root, 'affected installation')
    mkdirSync(join(directory, 'resources'), { recursive: true })
    setFullControl(directory)
    const images = ['ElecKoi.exe', 'Uninstall ElecKoi.exe', 'resources/elevate.exe', ...runtimeLibraries]
    const files = [...images, 'unrelated.exe']
    for (const name of files) writeFileSync(join(directory, name), 'synthetic executable fixture')
    const executable = join(directory, 'ElecKoi.exe').replaceAll("'", "''")
    const permissions = `$a=Get-Acl -LiteralPath '${executable}';$a.SetAccessRuleProtection($true,$false);$r=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.WindowsIdentity]::GetCurrent().User,'Modify','Allow');$a.AddAccessRule($r);Set-Acl -LiteralPath '${executable}' -AclObject $a`
    grant = AclWriteGrant.create(workspaceWriteSid(directory))
    try {
      grant.add(directory)
      expect(spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', permissions], { windowsHide: true }).status).toBe(0)
      const before = Object.fromEntries(files.map(name => [name, readSecurity(join(directory, name))]))
      const directoryBefore = readSecurity(directory)
      expect(before['ElecKoi.exe']).toContain(';;;LW)')
      const result = spawnSync(helper, ['--repair', directory], { encoding: 'utf8', windowsHide: true })
      expect(result.status, result.stdout + result.stderr).toBe(0)
      expect(readSecurity(directory)).toBe(directoryBefore)
      expect(readSecurity(join(directory, 'unrelated.exe'))).toBe(before['unrelated.exe'])
      for (const name of images) {
        const after = readSecurity(join(directory, name))
        expect(after).toContain('(ML;;NW;;;ME)')
        expect(after.split('S:')[0]).toBe(before[name].split('S:')[0])
        expect(readFileSync(join(directory, name), 'utf8')).toBe('synthetic executable fixture')
      }
      const repaired = readSecurity(join(directory, 'ElecKoi.exe'))
      expect(spawnSync(helper, ['--repair', directory], { windowsHide: true }).status).toBe(0)
      expect(readSecurity(join(directory, 'ElecKoi.exe'))).toBe(repaired)
    } finally { grant.dispose(); grant = undefined }
  }, 30_000)

  it('restores real sandboxed Electron GUI startup after the current workspace grant breaks it', async () => {
    const directory = join(root, 'runtime')
    const electron = dirname(require('electron'))
    expect(readdirSync(electron).filter(name => name.endsWith('.dll')).sort()).toEqual([...runtimeLibraries].sort())
    cpSync(electron, directory, { recursive: true, filter: path => relative(electron, path) !== 'resources' })
    copyFileSync(join(directory, 'electron.exe'), join(directory, 'ElecKoi.exe'))
    rmSync(join(directory, 'electron.exe'))
    mkdirSync(join(directory, 'resources/app'), { recursive: true })
    writeFileSync(join(directory, 'resources/app/package.json'), JSON.stringify({ name: 'installation-fixture', main: 'main.cjs' }))
    writeFileSync(join(directory, 'resources/app/main.cjs'), `const {app,BrowserWindow}=require('electron');app.whenReady().then(async()=>{const w=new BrowserWindow({show:false});await w.loadURL('data:text/html,fixture');require('fs').writeFileSync(process.env.ELECKOI_INTEGRITY_RESULT,JSON.stringify({sandboxed:w.webContents.getLastWebPreferences().sandbox}));app.quit()}).catch(error=>{console.error(error);app.exit(1)});`)
    setFullControl(directory)
    const launch = async name => {
      const result = join(root, name + '.json')
      const log = join(root, name + '.log')
      const env = { ...process.env, ELECKOI_INTEGRITY_RESULT: result }
      delete env.ELECTRON_RUN_AS_NODE
      const child = spawn(join(directory, 'ElecKoi.exe'), ['--user-data-dir=' + join(root, name + '-profile'), '--enable-logging=file', '--log-file=' + log], { env, windowsHide: true })
      let diagnostic = ''
      child.stdout.on('data', data => { diagnostic += data })
      child.stderr.on('data', data => { diagnostic += data })
      const code = await new Promise((accept, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(Error(`Electron ${name} startup deadline exceeded: ${diagnostic}`)) }, 15_000)
        child.once('error', error => { clearTimeout(timer); reject(error) })
        child.once('exit', value => { clearTimeout(timer); accept(value) })
      })
      if (code === 1) throw Error(`Electron ${name} failed: ${diagnostic}\n${existsSync(log) ? readFileSync(log, 'utf8') : ''}\n${readSecurity(join(directory, 'ElecKoi.exe'))}`)
      return { code, result: existsSync(result) ? JSON.parse(readFileSync(result, 'utf8')) : undefined }
    }
    expect(await launch('before')).toEqual({ code: 0, result: { sandboxed: true } })
    grant = AclWriteGrant.create(workspaceWriteSid(directory))
    try {
      grant.add(directory)
      const broken = await launch('affected')
      // The runner image and Chromium build decide which abnormal NTSTATUS a
      // sandboxed startup reports; the invariant under test is that the broken
      // grant never yields a working window, not one specific crash code.
      expect(broken.code >>> 0).not.toBe(0)
      expect(broken.result).toBeUndefined()
      const repaired = spawnSync(helper, ['--repair', directory], { encoding: 'utf8', windowsHide: true })
      expect(repaired.status, repaired.stdout + repaired.stderr).toBe(0)
      expect(await launch('repaired')).toEqual({ code: 0, result: { sandboxed: true } })
      expect(await launch('restarted')).toEqual({ code: 0, result: { sandboxed: true } })
      grant.dispose()
      grant = AclWriteGrant.create(workspaceWriteSid(directory))
      grant.add(directory)
      expect(await launch('regranted')).toEqual({ code: 0, result: { sandboxed: true } })
    } finally { grant.dispose(); grant = undefined }
  }, 60_000)

  it('reports missing files and refuses linked executables or resources instead of editing outside the installation', () => {
    const directory = join(root, 'invalid')
    mkdirSync(directory)
    expect(spawnSync(helper, ['--repair', directory], { windowsHide: true }).status).not.toBe(0)
    expect(spawnSync(helper, ['--repair', 'relative'], { windowsHide: true }).status).not.toBe(0)
    writeFileSync(join(directory, 'ElecKoi.exe'), 'fixture')
    const outside = join(root, 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'elevate.exe'), 'outside')
    const { symlinkSync, linkSync } = require('node:fs')
    symlinkSync(outside, join(directory, 'resources'), 'junction')
    const before = readSecurity(join(outside, 'elevate.exe'))
    expect(spawnSync(helper, ['--repair', directory], { windowsHide: true }).status).not.toBe(0)
    expect(readSecurity(join(outside, 'elevate.exe'))).toBe(before)
    rmSync(join(directory, 'resources'))
    rmSync(join(directory, 'ElecKoi.exe'))
    linkSync(join(outside, 'elevate.exe'), join(directory, 'ElecKoi.exe'))
    expect(spawnSync(helper, ['--repair', directory], { windowsHide: true }).status).not.toBe(0)
    expect(readSecurity(join(outside, 'elevate.exe'))).toBe(before)
  })

  it('restores temporary access when an explicit policy denies changing the label', () => {
    const directory = join(root, 'denied')
    mkdirSync(directory)
    setFullControl(directory)
    const file = join(directory, 'ElecKoi.exe')
    writeFileSync(file, 'fixture')
    grant = AclWriteGrant.create(workspaceWriteSid(directory))
    try {
      grant.add(directory)
      const code = `$a=Get-Acl -LiteralPath '${file.replaceAll("'", "''")}';$r=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.WindowsIdentity]::GetCurrent().User,'TakeOwnership','Deny');$a.AddAccessRule($r);Set-Acl -LiteralPath '${file.replaceAll("'", "''")}' -AclObject $a`
      expect(spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { windowsHide: true }).status).toBe(0)
      const before = readSecurity(file)
      expect(before).toContain(';;;LW)')
      const failed = spawnSync(helper, ['--repair', directory], { windowsHide: true, encoding: 'utf8' })
      expect(failed.status, failed.stdout + failed.stderr).toBe(5)
      expect(readSecurity(file)).toBe(before)
    } finally { grant.dispose(); grant = undefined }
  }, 30_000)
})

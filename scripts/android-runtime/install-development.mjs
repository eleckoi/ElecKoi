import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readlinkSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repo = resolve(import.meta.dirname, '../..')
const packageId = 'com.eleckoi.app.dev'
const cachePath = 'cache/eleckoi-dev-web'
const require = createRequire(import.meta.url)
const digest = value => createHash('sha256').update(value).digest('hex')
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"

function run(command, args, { capture = false, cwd = repo, allowMissing = false } = {}) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', windowsHide: true,
    stdio: ['ignore', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'],
  })
  if (result.error) throw result.error
  if (allowMissing && result.status === 1 && !result.stdout.trim() && !result.stderr.trim()) return ''
  if (result.status !== 0) throw new Error([command, ...args].join(' ') + ' failed (' + result.status + '): ' + (result.stderr ?? '').trim())
  return result.stdout?.trim() ?? ''
}

function pnpm(script) {
  const cli = join(dirname(require.resolve('pnpm')), 'bin', 'pnpm.mjs')
  run(process.execPath, [cli, script])
}

// Only the Web renderer's source and public files can change on the fast path.
// Include added/deleted files, patch bytes and dependency resolution metadata.
export function runtimeInputs(root) {
  const files = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, capture: true })
  const hostFile = file => /^(apps\/(?:android(?:-host)?|desktop(?:-host)?|web)\/|packages\/|native\/|patches\/|scripts\/)/.test(file)
    && !/(?:^|\/)(?:tests|__tests__|docs)\//.test(file)
    && !/^apps\/web\/(?:src|public)\//.test(file)
    && file !== 'scripts/android-runtime/install-development.mjs'
    && !/\.(?:md|test\.[cm]?[jt]sx?|spec\.[cm]?[jt]sx?)$/.test(file)
  const rootInput = file => /^(?:package\.json|pnpm-[^/]+|\.npmrc|\.pnpmfile\.[cm]?js|(?:tsconfig|dsh)[^/]*\.(?:json|ya?ml))$/.test(file)
  const paths = files.split('\0').filter(file => hostFile(file) || rootInput(file))
  paths.push('node_modules/.modules.yaml', 'node_modules/.pnpm/lock.yaml')
  const hash = createHash('sha256')
  for (const file of [...new Set(paths)].sort()) {
    const path = join(root, file)
    const stat = lstatSync(path, { throwIfNoEntry: false })
    const content = !stat ? null : stat.isSymbolicLink() ? 'link:' + readlinkSync(path) : digest(readFileSync(path))
    hash.update(JSON.stringify([file, content]))
  }
  return hash.digest('hex')
}

export function canReuseInstalledRuntime(receipt, inputs, installedPath) {
  return Boolean(installedPath && receipt?.installedPath === installedPath && receipt.runtimeInputs === inputs)
}

export function rendererTransferScript(apkIdentity, rendererId, archiveDigest) {
  if (!/^[a-f0-9]{64}$/.test(apkIdentity) || !/^renderer-[a-f0-9]{16}$/.test(rendererId) || !/^[a-f0-9]{64}$/.test(archiveDigest)) {
    throw new Error('Invalid Android development renderer identity')
  }
  return [
    'set -eu',
    'mkdir -p ' + cachePath,
    'stage=' + cachePath + '/incoming-' + rendererId,
    'renderer=' + cachePath + '/' + rendererId,
    'mkdir "$stage"',
    'trap \'rm -rf "$stage"\' EXIT',
    'mkdir "$stage/content"',
    'cat > "$stage/payload.tar.gz"',
    'printf "%s  %s\\n" ' + archiveDigest + ' "$stage/payload.tar.gz" | sha256sum -c -',
    'tar -xzf "$stage/payload.tar.gz" -C "$stage/content"',
    'test -s "$stage/content/dsh.html"',
    'mv "$stage/content" "$renderer"',
    'printf "%s %s\\n" ' + apkIdentity + ' ' + rendererId + ' > "$stage/selection"',
    'mv "$stage/selection" ' + cachePath + '/active',
  ].join('\n')
}

function adbShellScript(script) {
  return 'run-as ' + packageId + ' sh -c ' + quote(script)
}

function activeRenderer(adb) {
  const active = cachePath + '/active'
  return adb(['shell', adbShellScript('if [ -f ' + active + ' ]; then cat ' + active + '; fi')], { capture: true })
}

function refreshRenderer(adb, installedPath, inputs, cache) {
  console.log('复用手机上已验证的标准开发运行环境，只构建网页资源。')
  pnpm('build:dsh-renderer')
  if (runtimeInputs(repo) !== inputs || getInstalledPath(adb) !== installedPath) {
    throw new Error('构建期间 Android 基础输入或已安装 APK 已变化，请重新执行安装。')
  }
  const directory = mkdtempSync(join(cache, 'renderer-'))
  try {
    const archive = join(directory, 'renderer.tar.gz')
    run('tar', ['-czf', archive, '-C', join(repo, 'apps/web/dist'), '.'])
    const rendererId = 'renderer-' + randomBytes(8).toString('hex')
    const archiveDigest = digest(readFileSync(archive))
    const apkIdentity = digest(installedPath)
    const previous = /^[a-f0-9]{64} (renderer-[a-f0-9]{16})$/.exec(activeRenderer(adb))?.[1]
    const payload = '/data/local/tmp/eleckoi-dev-' + rendererId + '.tar.gz'
    try {
      adb(['push', archive, payload])
      adb(['shell', '-n', '-T', 'cat ' + payload + ' | ' + adbShellScript(rendererTransferScript(apkIdentity, rendererId, archiveDigest))])
    } finally {
      adb(['shell', 'rm', '-f', payload])
    }
    if (getInstalledPath(adb) !== installedPath || activeRenderer(adb) !== apkIdentity + ' ' + rendererId) {
      throw new Error('未能确认网页资源已完整更新。')
    }
    adb(['shell', 'am', 'force-stop', packageId])
    if (previous) adb(['shell', 'run-as', packageId, 'rm', '-rf', cachePath + '/' + previous])
    console.log('网页资源已更新并通过传输校验。打开 ElecKoi 开发版即可查看。')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function getInstalledPath(adb) {
  const result = adb(['shell', 'pm', 'path', packageId], { capture: true, allowMissing: true })
  if (!result) return ''
  const match = /^package:(\/data\/app\/[^\r\n]+\/base\.apk)$/.exec(result)
  if (!match) throw new Error('无法确认手机上的标准开发包 APK 路径：' + result)
  return match[1]
}

function installBase(adb, inputs, receiptPath) {
  console.log('首次部署或 Android 基础已变化，构建并校验标准开发 APK。')
  pnpm('prepare:android-dev-runtime')
  const args = ['-p', 'apps/android', ':app:clean', ':app:assembleStandardDebug', '--console=plain', '--max-workers=2',
    '-PunifiedRuntimeAssetsDir=../../build/android-runtime/assets']
  if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', 'apps\\android\\gradlew.bat', ...args])
  else run('./apps/android/gradlew', args)
  if (runtimeInputs(repo) !== inputs) throw new Error('打包期间 Android 基础输入已变化，请重新执行安装。')
  const output = join(repo, 'apps/android/app/build/outputs/apk/standard/debug')
  const metadata = JSON.parse(readFileSync(join(output, 'output-metadata.json'), 'utf8'))
  if (metadata.applicationId !== packageId || metadata.variantName !== 'standardDebug' ||
      metadata.elements?.length !== 1 || metadata.elements[0].outputFile !== 'app-standard-debug.apk') {
    throw new Error('APK 不是标准 Android 开发包。')
  }
  const apk = join(output, metadata.elements[0].outputFile)
  const apkDigest = digest(readFileSync(apk))
  adb(['install', '-r', apk])
  const installedPath = getInstalledPath(adb)
  if (!installedPath) throw new Error('Android 未返回已安装 APK。')
  const installedDigest = adb(['shell', 'sha256sum', quote(installedPath)], { capture: true }).split(/\s+/)[0]
  if (installedDigest !== apkDigest) throw new Error('手机上的 APK 与本地构建校验值不一致。')
  const temporary = receiptPath + '.tmp'
  writeFileSync(temporary, JSON.stringify({ runtimeInputs: inputs, installedPath, apkDigest }) + '\n')
  renameSync(temporary, receiptPath)
  console.log('标准开发 APK 已覆盖安装并核对校验值。')
}

function main(args) {
  const full = args.includes('--full')
  const positional = args.filter(arg => arg !== '--full')
  if (positional.length > 1) throw new Error('用法：pnpm android:dev:install [--full] [设备序列号]')
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME
  const executable = process.platform === 'win32' ? 'adb.exe' : 'adb'
  const adbPath = sdk ? join(sdk, 'platform-tools', executable) : executable
  const devices = run(adbPath, ['devices'], { capture: true }).split(/\r?\n/).flatMap(line => {
    const match = /^(\S+)\s+device$/.exec(line.trim())
    return match ? [match[1]] : []
  })
  const serial = positional[0] ?? (devices.length === 1 ? devices[0] : null)
  if (!devices.includes(serial)) throw new Error('请连接并授权目标 Android 手机。多台设备时请指定序列号。')
  const adb = (command, options) => run(adbPath, ['-s', serial, ...command], options)
  const cache = join(repo, 'build/android-dev-install')
  mkdirSync(cache, { recursive: true })
  const lockPath = join(cache, 'install.lock')
  const lock = openSync(lockPath, 'wx')
  try {
    const receiptPath = join(cache, 'base-' + digest(serial) + '.json')
    const receipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : null
    const inputs = runtimeInputs(repo)
    const installedPath = getInstalledPath(adb)
    if (!full && canReuseInstalledRuntime(receipt, inputs, installedPath)) refreshRenderer(adb, installedPath, inputs, cache)
    else installBase(adb, inputs, receiptPath)
  } finally {
    closeSync(lock)
    rmSync(lockPath, { force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

if (process.platform !== 'win32') process.exit(0)

const repositoryRoot = resolve(import.meta.dirname, '..')
const source = join(repositoryRoot, 'packages', 'windows-native-frame', 'src', 'native_frame.cpp')
const output = join(repositoryRoot, 'resources', 'native', 'win32-x64', 'eleckoi-window-frame.dll')
const vswhere = join(process.env['ProgramFiles(x86)'] ?? '', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')

if (!existsSync(vswhere)) {
  throw new Error('未找到 Visual Studio Build Tools，无法构建 Windows 窗口外框。')
}

const discovery = spawnSync(
  vswhere,
  ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
  { encoding: 'utf8' }
)
if (discovery.status !== 0 || discovery.stdout.trim() === '') {
  throw new Error('未找到包含 MSVC x64 工具链的 Visual Studio Build Tools。')
}

const developerCommand = join(discovery.stdout.trim(), 'Common7', 'Tools', 'VsDevCmd.bat')
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'eleckoi-window-frame-'))
const batchFile = join(temporaryDirectory, 'build.cmd')
mkdirSync(dirname(output), { recursive: true })

const quote = (value) => `"${value.replaceAll('"', '""')}"`
const compilerCommand = [
  'cl.exe',
  '/nologo',
  '/LD',
  '/std:c++17',
  '/MT',
  '/O2',
  '/W4',
  '/WX',
  '/EHsc-',
  '/GR-',
  '/DUNICODE',
  '/D_UNICODE',
  `/Fo${quote(join(temporaryDirectory, 'native_frame.obj'))}`,
  `/Fe:${quote(output)}`,
  quote(source),
  '/link',
  '/NOLOGO',
  '/INCREMENTAL:NO',
  '/OPT:REF',
  '/OPT:ICF',
  `/IMPLIB:${quote(join(temporaryDirectory, 'eleckoi-window-frame.lib'))}`,
  'user32.lib',
  'comctl32.lib',
  'dwmapi.lib'
].join(' ')

writeFileSync(
  batchFile,
  `@echo off\r\ncall ${quote(developerCommand)} -arch=x64 -host_arch=x64\r\nif errorlevel 1 exit /b %errorlevel%\r\n${compilerCommand}\r\n`,
  'utf8'
)

try {
  const build = spawnSync('cmd.exe', ['/d', '/c', batchFile], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'inherit'
  })
  if (build.status !== 0) process.exit(build.status ?? 1)
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}

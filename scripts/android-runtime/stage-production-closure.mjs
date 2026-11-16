import { createHash } from 'node:crypto'
import { cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

/** Stage the current dependency graph; equal versions do not imply equal patched bytes. */
export function prepareProductionClosure(repo, output, { reuse = false } = {}) {
  const buildRoot = resolve(repo, 'build/android-runtime')
  if (resolve(output) !== join(buildRoot, 'closure')) throw new Error('Production closure target must be the Android build staging directory')
  mkdirSync(buildRoot, { recursive: true })
  const temporary = mkdtempSync(join(buildRoot, 'closure-staging-'))
  try {
    const inventory = stageProductionClosure(repo, temporary, { links: false, reuseFrom: reuse && existsSync(output) ? output : null })
    // Complete the new copy before replacing the expendable previous staging tree.
    if (existsSync(output)) rmSync(output, { recursive: true, force: true })
    renameSync(temporary, output)
    exposeInstallationPackages(output, inventory)
    return inventory
  } finally {
    if (!temporary.startsWith(buildRoot + sep)) throw new Error('Closure staging cleanup escapes Android build directory')
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
  }
}

/** Copy exact installed production packages, retaining each importer's version graph. */
export function stageProductionClosure(repo, output, { links = true, reuseFrom = null } = {}) {
  const initial = resolve(repo, 'apps/android-host')
  const packages = new Map()
  const missingOptional = []
  function register(source, root = false) {
    source = realpathSync(source)
    if (packages.has(source)) return packages.get(source)
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
    const id = `${manifest.name.replace(/[^a-zA-Z0-9.-]/g, '_')}@${manifest.version}-${createHash('sha256').update(relative(repo, source)).digest('hex').slice(0, 10)}`
    const target = root ? output : join(output, 'node_modules', '.eleckoi-packages', id)
    const sourcePath = relative(repo, source).split(sep).join('/')
    const workspace = root || sourcePath.startsWith('apps/') || sourcePath.startsWith('packages/')
    const record = { source, target, name: manifest.name, version: manifest.version, workspace, dependencies: [] }
    packages.set(source, record)
    const require = createRequire(join(source, 'package.json'))
    const edges = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {})])
    for (const name of edges) {
      const optional = name in (manifest.optionalDependencies ?? {}) || manifest.peerDependenciesMeta?.[name]?.optional === true
      // Some npm dependencies (buffer, util) share names with Node builtins;
      // querying their name yields null although the installed package exists.
      const directory = (require.resolve.paths('__eleckoi_package_lookup__') ?? []).map(search => join(search, name))
        .find(candidate => existsSync(join(candidate, 'package.json')))
      if (!directory) {
        if (optional) { missingOptional.push({ owner: manifest.name, name }); continue }
        throw new Error(`Installed production dependency missing: ${manifest.name} -> ${name}`)
      }
      if (optional) {
        const child = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
        if (!matchesPlatform(child.os, 'linux') || !matchesPlatform(child.cpu, 'arm64') || !matchesPlatform(child.libc, 'glibc')) {
          missingOptional.push({ owner: manifest.name, name, reason: 'not-linux-arm64-glibc' })
          continue
        }
      }
      record.dependencies.push({ name, package: register(directory) })
    }
    return record
  }
  register(initial, true)
  let reused = 0
  for (const record of packages.values()) {
    mkdirSync(record.target, { recursive: true })
    cpSync(record.source, record.target, { recursive: true, dereference: false,
      filter: path => {
        if (path === join(record.source, 'node_modules') || ['.git', '.turbo'].includes(basename(path))) return false
        if (reuseFrom && lstatSync(path).isFile()) {
          const within = relative(record.source, path)
          const previous = join(reuseFrom, relative(output, record.target), within)
          const before = lstatSync(previous, { throwIfNoEntry: false })
          const current = statSync(path)
          if (before?.isFile() && before.size === current.size && before.mode === current.mode
              && readFileSync(path).equals(readFileSync(previous))) {
            const target = join(record.target, within)
            mkdirSync(dirname(target), { recursive: true })
            try { linkSync(previous, target); reused++; return false }
            catch (error) { if (!['EXDEV', 'ENOTSUP', 'EPERM'].includes(error.code)) throw error }
          }
        }
        return true
      } })
    if (record.workspace) verifyWorkspaceEntrypoints(record.target)
  }
  // DSH installation anchors resolve shipped bundles before the runtime
  // interceptor starts. Expose the installed closure at the installation root;
  // importer-local links above still retain different transitive versions.
  const inventory = { schemaVersion: 1, packages: [...packages.values()].map(record => ({ name: record.name,
    version: record.version, workspace: record.workspace, directory: relative(output, record.target).split('\\').join('/'),
    dependencies: record.dependencies.map(dependency => ({ name: dependency.name,
      directory: relative(output, dependency.package.target).split('\\').join('/') })) })), missingOptional }
  writeFileSync(join(output, 'production-closure.json'), `${JSON.stringify(inventory, null, 2)}\n`)
  if (links) exposeInstallationPackages(output, inventory)
  if (reuseFrom) process.stdout.write(`Reused ${reused} byte-identical staged files.\n`)
  return inventory
}

/** Validate copied build outputs before replacing the last complete dependency snapshot. */
export function verifyWorkspaceEntrypoints(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const targets = new Set()
  const collect = value => {
    if (typeof value === 'string') targets.add(value)
    else if (Array.isArray(value)) value.forEach(collect)
    else if (value && typeof value === 'object') {
      for (const [condition, target] of Object.entries(value)) if (condition !== 'types') collect(target)
    }
  }
  collect(manifest.exports)
  for (const value of [manifest.main, manifest.module]) if (typeof value === 'string') targets.add(value)
  collect(manifest.bin)
  let files
  const list = (root, prefix = '') => readdirSync(root, { withFileTypes: true }).flatMap(item => {
    if (item.name === 'node_modules' || item.isSymbolicLink()) return []
    const name = prefix + item.name
    return item.isDirectory() ? list(join(root, item.name), name + '/') : item.isFile() ? [name] : []
  })
  for (const target of targets) {
    const normalized = target.replace(/^\.\//, '')
    const resolved = resolve(directory, normalized)
    if (!resolved.startsWith(resolve(directory) + sep)) throw new Error(`Workspace entry escapes package: ${manifest.name} -> ${target}`)
    let present
    if (normalized.includes('*')) {
      files ??= list(directory)
      const pattern = new RegExp('^' + normalized.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
      present = files.some(file => pattern.test(file))
    } else present = existsSync(resolved) && statSync(resolved).isFile()
    if (!present) throw new Error(`Missing workspace runtime entry: ${manifest.name} -> ${target}; rebuild the package before staging Android assets`)
  }
}

function matchesPlatform(constraints, value) {
  if (!Array.isArray(constraints) || constraints.length === 0) return true
  if (constraints.includes(`!${value}`)) return false
  const positive = constraints.filter(entry => !entry.startsWith('!'))
  return positive.length === 0 || positive.includes(value)
}

export function exposeInstallationPackages(output, inventory) {
  // Windows directory junctions do not require the symbolic-link privilege.
  // Linux keeps relative links so the closure remains relocatable in the APK.
  const linkDirectory = (target, link) => symlinkSync(
    process.platform === 'win32' ? resolve(target) : relative(dirname(link), target),
    link,
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  for (const record of inventory.packages) {
    for (const dependency of record.dependencies ?? []) {
      const link = join(output, record.directory, 'node_modules', dependency.name)
      if (existsSync(link)) continue
      mkdirSync(dirname(link), { recursive: true })
      linkDirectory(join(output, dependency.directory), link)
    }
  }
  const installation = inventory.packages.find(record => record.directory === '')
  if (!installation) throw new Error('Production closure has no installation root')
  const selected = new Map((installation.dependencies ?? []).map(edge => [edge.name, edge.directory]))
  const names = new Map()
  for (const record of inventory.packages) {
    const owners = names.get(record.name) ?? []
    owners.push(record)
    names.set(record.name, owners)
  }
  for (const [name, owners] of names) {
    if (!selected.has(name) && owners.length === 1) selected.set(name, owners[0].directory)
  }
  for (const [name, directory] of selected) {
    const link = join(output, 'node_modules', name)
    if (existsSync(link)) continue
    mkdirSync(dirname(link), { recursive: true })
    linkDirectory(join(output, directory), link)
  }
}

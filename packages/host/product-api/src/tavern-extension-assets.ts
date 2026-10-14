import type { Context } from '@deepseek-ai/cordis'
import { resolveBundleDir } from '@deepseek-ai/dsh-app-boot'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type Manifest = Record<string, unknown>
const object = (value: unknown): Manifest => value && typeof value === 'object' && !Array.isArray(value) ? value as Manifest : {}

/** Read public extension assets through the same package resolver used by native plugins. */
export class TavernExtensionAssets {
  constructor(private readonly owner: Context, private readonly installedNames?: readonly string[]) {}

  private async package(name: string): Promise<{ dir: string; manifest: Manifest } | undefined> {
    if (!name || name.includes('\\') || name.startsWith('.') || isAbsolute(name)) throw new TypeError('An installed extension package name is required.')
    const short = name.replace(/^third-party\//, '')
    const manager = this.owner.get('pluginManager')
    const names = this.installedNames ?? (manager ? (await manager.listBundles()).map(bundle => bundle.name) : Array.from(this.owner.root.registry.values()).flatMap(runtime => runtime.name ? [runtime.name] : []))
    const key = names.find(value => value.toLocaleLowerCase() === short.toLocaleLowerCase() || value.toLocaleLowerCase() === name.toLocaleLowerCase())
    if (!key) return undefined
    const profile = this.owner.get('profileContext')
    const parent = profile ? pathToFileURL(resolve(profile.dir, 'package.json')).href : import.meta.url
    const resolved = this.owner.get('pluginPackages')?.packageOf(key, parent)
    if (resolved) return { dir: resolved.dir, manifest: structuredClone(resolved.manifest) }
    if (!profile) throw new Error(`The native package resolver is not available: ${key}`)
    const dir = resolveBundleDir('ElecKoi', key, profile.installAnchor, profile.dir)
    return { dir, manifest: object(JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'))) }
  }

  private async file(dir: string, path: string): Promise<string | undefined> {
    if (!path || isAbsolute(path)) throw new TypeError('An extension asset path must be relative to its package.')
    const target = resolve(dir, path), lexical = relative(dir, target)
    if (lexical === '..' || lexical.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(lexical)) throw new TypeError('The requested extension asset is outside its package.')
    let physical: string
    try { physical = await realpath(target) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
    const base = await realpath(dir), location = relative(base, physical)
    if (location === '..' || location.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(location)) throw new TypeError('The requested extension asset points outside its package.')
    return readFile(physical, 'utf8')
  }

  async manifest(name: string): Promise<Manifest | null> {
    const entry = await this.package(name)
    if (!entry) return null
    const manifest = await this.file(entry.dir, 'manifest.json')
    return manifest === undefined ? structuredClone(entry.manifest) : object(JSON.parse(manifest))
  }

  async template(extension: string, name: string): Promise<string> {
    const entry = await this.package(extension)
    if (!entry) throw new Error(`Extension package was not found: ${extension}`)
    if (!name || isAbsolute(name)) throw new TypeError('An extension template name is required.')
    const declared = object(object(entry.manifest.eleckoi).templates)[name]
    if (declared !== undefined && typeof declared !== 'string') throw new TypeError(`Extension template path must be text: ${name}`)
    const basename = /\.(?:html?|hbs|handlebars)$/i.test(name) ? name : `${name}.html`
    const candidates = typeof declared === 'string' ? [declared] : [`templates/${basename}`, basename]
    for (const candidate of candidates) {
      const source = await this.file(entry.dir, candidate)
      if (source !== undefined) return source
    }
    throw new Error(`Extension template was not found: ${extension}/${name}`)
  }
}


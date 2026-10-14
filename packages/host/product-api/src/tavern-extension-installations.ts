import type { Context } from '@deepseek-ai/cordis'
import { parseInstallSpec, type BundleInfo, type ChangeResult } from '@deepseek-ai/dsh-plugin-manager'

type RecordValue = Record<string, unknown>
const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
const namespace = 'eleckoi-product-api'

/** Keep the original installation address beside the native plugin manager's installed bundle. */
export class TavernExtensionInstallations {
  constructor(private readonly owner: Context) {}

  private descriptor() {
    const descriptor = this.owner.settings.describe().find(item => item.ns === namespace)
    if (!descriptor) throw new Error('ElecKoi 插件安装记录尚未注册。')
    return descriptor
  }

  read(name: string): RecordValue | undefined {
    const saved = object(object(object(this.descriptor().value).state).extensionInstallations)[name]
    return saved === undefined ? undefined : structuredClone(object(saved))
  }

  describe(bundle: BundleInfo): RecordValue {
    const installation = this.read(bundle.name)
    return { ...bundle, ...(installation ? { installation } : {}) }
  }

  spec(bundle: BundleInfo, reinstall: boolean): string {
    const saved = this.read(bundle.name)
    if (typeof saved?.spec === 'string') {
      const parsed = parseInstallSpec(saved.spec)
      if (reinstall && parsed.kind === 'registry') return `${bundle.name}@${bundle.version ?? parsed.range ?? 'latest'}`
      return saved.spec
    }
    return `${bundle.name}@${reinstall ? bundle.version ?? 'latest' : 'latest'}`
  }

  async save(spec: string, type: unknown, result: ChangeResult, previousName?: string): Promise<void> {
    if (result.application === 'failed' || result.application === 'cancelled' || result.error) return
    const parsed = parseInstallSpec(spec)
    const name = result.bundle ?? previousName ?? (parsed.kind === 'registry' ? parsed.name : result.target)
    const bundle = (await this.owner.pluginManager.listBundles()).find(item => item.name === name)
    if (!bundle) throw new Error(`安装结果没有对应原生插件：${name}`)
    const fragment = parsed.kind === 'git' ? /#(.+)$/.exec(spec)?.[1] : undefined
    const pinnedCommit = fragment && /^[a-f\d]{7,40}$/i.test(fragment) ? fragment : null
    const previous = this.read(name)
    const installation = { spec, kind: parsed.kind, type: type === 'global' ? 'global' : type === 'local' ? 'local' : previous?.type ?? 'local',
      url: parsed.kind === 'git' || parsed.kind === 'tarball' ? spec.replace(/#.*$/, '').replace(/^git\+/, '') : null,
      branch: parsed.kind === 'git' && fragment && !pinnedCommit ? fragment.replace(/^refs\/heads\//, '') : null,
      commit: pinnedCommit, version: bundle.version ?? null, installedAt: previous?.installedAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() }
    const descriptor = this.descriptor()
    await this.owner.settings.mutate(namespace, [{ op: 'set', path: ['state', 'extensionInstallations', name], value: installation }], descriptor.revision)
  }

  async remove(name: string, result: ChangeResult): Promise<void> {
    if (!result.changed || result.application === 'failed' || result.error || !this.read(name)) return
    const descriptor = this.descriptor()
    await this.owner.settings.mutate(namespace, [{ op: 'unset', path: ['state', 'extensionInstallations', name] }], descriptor.revision)
  }
}

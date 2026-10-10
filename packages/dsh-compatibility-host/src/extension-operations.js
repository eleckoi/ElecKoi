import { createHash } from 'node:crypto';
import { decodePluginPackage } from './package-decoder.js';
import { APP_VERSION, COMPONENT_VERSION } from './component-metadata.js';

export const EXTENSION_METHODS = ['extensions.install', 'extensions.update', 'extensions.remove', 'extensions.info',
  'extensions.reinstall', 'extensions.updateComponent'];
export const COMPONENT_ID = 'eleckoi-tavern-compat';
export const COMPATIBILITY_COMPONENT = { id: COMPONENT_ID, name: 'ElecKoi Tavern compatibility', type: 'system', version: COMPONENT_VERSION,
  targetVersions: { SillyTavern: '1.19.0', TavernHelper: '4.11.2' }, bundled: true };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Installation source metadata and resources share the existing Author registry. */
export class ExtensionOperations {
  constructor({ author, fetchImpl = fetch, appVersion = APP_VERSION }) { this.author = author; this.fetch = fetchImpl; this.appVersion = appVersion; }
  async json(url) {
    const response = await this.fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw Object.assign(new Error(`Extension source HTTP ${response.status}: ${await response.text()}`), { status: response.status });
    return response.json();
  }
  async resolve(url, branch) {
    const source = new URL(url);
    if (source.hostname === 'github.com' && /^\/[^/]+\/[^/]+(?:\.git)?\/?$/.test(source.pathname)) {
      const repository = source.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/, '');
      const metadata = await this.json(`https://api.github.com/repos/${repository}`);
      const selected = branch || metadata.default_branch;
      const commit = await this.json(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(selected)}`);
      if (typeof commit.sha !== 'string' || !commit.sha) throw new Error('Repository source did not return a real commit');
      return { url: `https://api.github.com/repos/${repository}/zipball/${encodeURIComponent(commit.sha)}`,
        sourceUrl: source.href, branch: selected, revision: commit.sha, kind: 'github', repository };
    }
    return { url: source.href, sourceUrl: source.href, branch: branch || '', kind: 'package' };
  }
  async download(url, branch) {
    const source = await this.resolve(url, branch), response = await this.fetch(source.url);
    if (!response.ok) throw Object.assign(new Error(`Extension package HTTP ${response.status}: ${await response.text()}`), { status: response.status });
    const bytes = Buffer.from(await response.arrayBuffer()), manifest = decodePluginPackage(bytes), packageHash = hash(bytes);
    return { manifest, source: { ...source, revision: source.revision || packageHash, packageHash,
      etag: response.headers.get('etag') || '', lastModified: response.headers.get('last-modified') || '' } };
  }
  manifest(id) { const value = this.author.lookupManifest(id); if (!value) throw new Error(`Extension does not exist: ${id}`); return value; }
  async invoke({ method, params: p }) {
    switch (method) {
      case 'extensions.install': {
        if (!p.url) throw new TypeError('Extension installation requires a source URL');
        const { manifest, source } = await this.download(p.url, p.branch);
        const id = p.id || manifest.id || manifest.name;
        if (!id) throw new Error('Extension package requires an id or name');
        if (this.author.lookupManifest(id)) throw new Error(`Extension is already installed: ${id}`);
        const installedAt = new Date().toISOString();
        this.author.install(id, { ...manifest, type: p.type || 'local', installation: { ...source, installedAt, updatedAt: installedAt } });
        return { id, name: manifest.name || id, version: manifest.version || '', revision: source.revision };
      }
      case 'extensions.update': case 'extensions.reinstall': {
        const previous = this.manifest(p.id), source = previous.installation;
        if (!source?.sourceUrl) throw new Error('Imported local extension has no update source; import a replacement package');
        const next = await this.download(source.sourceUrl, source.branch);
        const unchanged = next.source.revision === source.revision && next.source.packageHash === source.packageHash;
        if (unchanged && method !== 'extensions.reinstall') return { id: p.id, updated: false, revision: source.revision };
        this.author.install(p.id, { ...next.manifest, id: p.id, enabled: previous.enabled, type: previous.type || 'local',
          installation: { ...next.source, installedAt: source.installedAt, updatedAt: new Date().toISOString() } });
        return { id: p.id, updated: !unchanged, reinstalled: method === 'extensions.reinstall', revision: next.source.revision };
      }
      case 'extensions.remove': {
        if (p.id === COMPONENT_ID) throw new Error('Bundled compatibility component is part of the application');
        return this.author.invoke({ method: 'plugins.remove', params: p });
      }
      case 'extensions.info': {
        if (p.id === COMPONENT_ID) {
          const release = await this.invoke({ method: 'extensions.updateComponent', params: {} });
          return { ...COMPATIBILITY_COMPONENT, is_up_to_date: release.ok, remote_url: release.updateUrl, commit_hash: '', branch: '',
            requiresAppUpdate: release.requiresAppUpdate, latestVersion: release.latestVersion };
        }
        const manifest = this.manifest(p.id), source = manifest.installation;
        const latest = source?.sourceUrl ? await this.download(source.sourceUrl, source.branch) : undefined;
        return { ...manifest, is_up_to_date: latest ? latest.source.revision === source.revision && latest.source.packageHash === source.packageHash : true,
          remote_url: source?.sourceUrl || '', commit_hash: source?.revision || '', branch: source?.branch || '',
          ...(latest ? { remote_commit_hash: latest.source.revision } : {}), locally_imported: !source?.sourceUrl };
      }
      case 'extensions.updateComponent': {
        const release = await this.json('https://api.github.com/repos/eleckoi/ElecKoi/releases/latest');
        if (!release.tag_name || !release.html_url) throw new Error('Application release metadata is incomplete');
        const version = release.tag_name.replace(/^v/, ''), current = version === this.appVersion;
        return { ok: current, requiresAppUpdate: !current, latestVersion: version, currentVersion: this.appVersion,
          updateUrl: release.html_url, component: COMPATIBILITY_COMPONENT, open: p.open === true };
      }
      default: throw new Error(`Extension method is not connected: ${method}`);
    }
  }
}

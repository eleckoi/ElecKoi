export const DEFAULT_CHARACTER_INDEX = 'https://raw.githubusercontent.com/SillyTavern/SillyTavern-Content/main/index.json';
const OWNER = '__eleckoi_character_library';
/** Online browser contract shared with Android; cards enter the original native importer. */
export class CharacterLibraryBrowser {
  constructor(runtime) { this.runtime = runtime; this.dialog = null; this.revision = 0; }
  call(method, params = {}) { return this.runtime.adapter.request(method, { ...params, pluginId: OWNER }); }
  open(forceDefault = false) {
    if (this.dialog) return false;
    const document = this.runtime.window.document, dialog = document.createElement('dialog');
    this.dialog = dialog; dialog.className = 'eleckoi-character-library';
    dialog.style.cssText = 'width:min(720px,calc(100vw - 24px));height:90dvh;max-height:90dvh;border:1px solid var(--dsw-alias-border-l1,#888);border-radius:12px;padding:16px;background:var(--dsw-alias-bg-layer-1,Canvas);color:var(--dsw-alias-label-primary,CanvasText);box-sizing:border-box;display:flex;flex-direction:column;gap:10px';
    const node = (tag, content, parent = dialog) => { const value = document.createElement(tag); if (content) value.textContent = content; parent.appendChild(value); return value; };
    const heading = node('div'); heading.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
    node('h2', '在线角色库', heading).style.margin = '0';
    node('button', '关闭', heading).addEventListener('click', () => this.close());
    const label = node('label', '资源索引地址'), url = node('input', '', label);
    url.type = 'url'; url.value = DEFAULT_CHARACTER_INDEX; url.style.cssText = 'display:block;width:100%;box-sizing:border-box';
    const actions = node('div'), load = node('button', '载入', actions), defaults = node('button', '默认资源库', actions);
    const searchLabel = node('label', '搜索角色'), search = node('input', '', searchLabel); search.type = 'search'; search.style.width = '100%';
    const status = node('p'); status.setAttribute('role', 'status');
    const rows = node('div'); rows.style.cssText = 'overflow:auto;flex:1;min-height:0';
    this.ui = { dialog, url, search, status, rows, load, defaults };
    this.entries = []; this.installations = {}; this.nativeIds = new Set(); this.downloading = new Set();
    load.addEventListener('click', () => this.load().catch(error => this.error(error)));
    defaults.addEventListener('click', () => { url.value = DEFAULT_CHARACTER_INDEX; this.load().catch(error => this.error(error)); });
    search.addEventListener('input', () => this.render());
    dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) {
      const b = dialog.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) this.close();
    } });
    document.body.appendChild(dialog);
    try { dialog.showModal(); } catch (error) { this.close(); throw error; }
    const revision = ++this.revision;
    this.initialize(forceDefault, revision).catch(error => { if (revision === this.revision) this.error(error); });
    return true;
  }
  async initialize(forceDefault, revision) {
    const saved = await this.call('settings.get');
    if (revision !== this.revision) return;
    if (!forceDefault && saved.indexUrl) this.ui.url.value = saved.indexUrl;
    this.installations = saved.installations || {}; await this.load();
  }
  error(error) { if (this.ui) { this.ui.status.textContent = error.message || String(error); this.ui.status.setAttribute('role', 'alert'); } }
  saveSettings() { return this.call('settings.set', { value: { indexUrl: this.ui.url.value, installations: this.installations } }); }
  async load() {
    const ui = this.ui, revision = this.revision;
    ui.load.disabled = true; ui.defaults.disabled = true; ui.status.textContent = '正在载入…'; ui.status.setAttribute('role', 'status');
    try {
      const [response, characters] = await Promise.all([this.call('network.request', { url: ui.url.value, method: 'GET' }), this.call('characters.rawList')]);
      if (revision !== this.revision) return;
      if (!response.ok) throw new Error(`角色索引下载失败：HTTP ${response.status}`);
      const index = JSON.parse(response.body); if (!Array.isArray(index)) throw new TypeError('Character index must be an array');
      this.entries = index.filter(item => item.type === 'character').sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      if (!this.entries.length) throw new Error('索引没有 type=character 的角色资源');
      this.nativeIds = new Set(characters.map(item => item.native_id)); await this.saveSettings();
      if (revision !== this.revision) return;
      ui.status.textContent = `${this.entries.length} 个角色`; this.render();
    } finally { if (revision === this.revision) { ui.load.disabled = false; ui.defaults.disabled = false; } }
  }
  render() {
    if (!this.ui) return;
    const { rows, search } = this.ui, document = this.runtime.window.document; rows.replaceChildren();
    for (const entry of this.entries.filter(item => JSON.stringify(item).toLowerCase().includes(search.value.toLowerCase()))) {
      const row = document.createElement('article'); row.style.cssText = 'border-bottom:1px solid var(--dsw-alias-border-l1,#888);padding:10px 0';
      const name = document.createElement('strong'); name.textContent = entry.name || entry.id || entry.url; row.appendChild(name);
      if (entry.description) { const p = document.createElement('p'); p.textContent = entry.description; row.appendChild(p); }
      const installed = this.nativeIds.has(this.installations[entry.url]), button = document.createElement('button');
      button.textContent = this.downloading.has(entry.url) ? '正在安装…' : installed ? '已安装' : '下载并安装'; button.disabled = installed || this.downloading.has(entry.url);
      button.addEventListener('click', () => this.install(entry).catch(error => this.error(error))); row.appendChild(button); rows.appendChild(row);
    }
  }
  async install(entry) {
    const revision = this.revision; this.downloading.add(entry.url); this.render();
    try {
      const card = await this.call('characters.importUrl', { url: entry.url });
      if (revision !== this.revision) return;
      this.nativeIds.add(card.native_id); this.installations[entry.url] = card.native_id; await this.saveSettings();
    } finally { if (revision === this.revision) { this.downloading.delete(entry.url); this.render(); } }
  }
  close() { this.revision++; this.dialog?.remove(); this.dialog = null; this.ui = null; }
}

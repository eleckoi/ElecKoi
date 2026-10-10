import { unzipSync } from 'fflate';

/** Keep the portable Author JSON/ZIP format, including unknown manifest fields. */
export function decodePluginPackage(bytes) {
  const data = new Uint8Array(bytes);
  if (data[0] !== 0x50 || data[1] !== 0x4b) {
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    if (typeof manifest.source !== 'string' || !manifest.source.trim()) throw new Error('JSON 插件缺少 source');
    return manifest;
  }
  const files = unzipSync(data);
  const candidates = Object.keys(files).filter(name => name === 'plugin.json' || /^[^/]+\/plugin\.json$/.test(name));
  const path = Object.hasOwn(files, 'plugin.json') ? 'plugin.json' : candidates.length === 1 ? candidates[0] : null;
  if (!path) throw new Error('插件包缺少根目录 plugin.json；依赖 ST 内部模块的扩展需要迁移到共同 SDK');
  const prefix = path.slice(0, -'plugin.json'.length);
  const resources = Object.fromEntries(Object.entries(files).filter(([name]) => name.startsWith(prefix) && !name.endsWith('/'))
    .map(([name, content]) => [name.slice(prefix.length), Buffer.from(content).toString('base64')]));
  const manifest = JSON.parse(Buffer.from(files[path]).toString('utf8'));
  if (typeof manifest.entry !== 'string' || !resources[manifest.entry]) throw new Error(`ZIP 缺少插件入口：${manifest.entry}`);
  return { ...manifest, source: Buffer.from(resources[manifest.entry], 'base64').toString('utf8'), resources };
}

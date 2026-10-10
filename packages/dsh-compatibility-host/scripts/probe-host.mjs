import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
const root = fileURLToPath(new URL('../..', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'eleckoi-author-formal-'));
const report = join(root, 'build/android-runtime/author-shared-host-probe.json');
const config = join(directory, 'runtime-config.json');
await writeFile(config, JSON.stringify({ runtimeDataRoot: join(directory, 'data'), homeRoot: join(directory, 'home'),
  workspaceRoot: join(directory, 'workspace'), productMediaRoot: join(directory, 'media'), resourceRoot: join(root, 'resources/dsh'),
  clientDirectory: join(root, 'out/renderer-dsh') }));
const child = spawn(process.execPath, [join(root, 'packages/dsh-runtime/dist/node-host.mjs'), '--config', config], { stdio: ['pipe', 'pipe', 'pipe'] });
const checks = [], diagnostics = [], waiting = new Map(), pending = new Map();
const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
const output = createInterface({ input: child.stdout }), errors = createInterface({ input: child.stderr });
errors.on('line', line => diagnostics.push(line));
output.on('line', line => {
  if (!line.startsWith('ELECKOI_HOST\t')) { diagnostics.push(line); return; }
  const message = JSON.parse(line.slice('ELECKOI_HOST\t'.length)), key = message.id || message.type;
  if (message.type === 'fatal') { for (const waiter of waiting.values()) waiter.reject(new Error(message.message)); return; }
  const waiter = waiting.get(key); if (waiter) { waiting.delete(key); waiter.resolve(message); } else pending.set(key, message);
});
function wait(key) {
  if (pending.has(key)) { const value = pending.get(key); pending.delete(key); return Promise.resolve(value); }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { waiting.delete(key); reject(new Error(`Formal Host did not reply: ${key}`)); }, 45000);
    waiting.set(key, { resolve(value) { clearTimeout(timeout); resolve(value); }, reject(error) { clearTimeout(timeout); reject(error); } });
  });
}
let failure;
try {
  const ready = await wait('ready');
  const boot = ready.injections.find(item => item.kind === 'global' && item.name === '__DSH_BOOT__');
  for (const id of ['@eleckoi/dsh-compatibility-host', '@eleckoi/dsh-client-tavern-shared']) assert.ok(boot.value.entries.some(entry => entry.id === id), id);
  checks.push({ name: 'official-client-module-graph', pass: true });
  const exchange = await fetch(ready.url, { redirect: 'manual' }), cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie);
  let sequence = 0;
  async function rpc(namespace, method, args = {}) {
    const endpoint = namespace + '/' + method, rpcId = 'author-probe-' + ++sequence;
    const response = await fetch(new URL('/api/' + endpoint, ready.url), { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }) });
    assert.equal(response.status, 200, await response.clone().text());
    const reply = await response.json(); assert.equal(reply.type, 'server-response'); assert.equal(reply.rpcId, rpcId);
    if (!reply.result.ok) throw Object.assign(new Error(reply.result.error.message), reply.result.error);
    return reply.result.value;
  }
  const invoke = (method, params = {}) => rpc('eleckoiAuthorPlugins', 'invoke', { command: { method, params: { pluginId: 'formal-test', ...params } } });
    const capability = await rpc('eleckoiAuthorPlugins', 'capabilities'); assert.equal(new Set(capability.methods).size, capability.methods.length); assert.ok(capability.methods.includes('tts.synthesize')); assert.equal(capability.version, 1);
  checks.push({ name: 'generated-author-capability-and-invoke', pass: true, methods: capability.methods });
  await invoke('plugins.install', { id: 'formal-test', manifest: { id: 'formal-test', source: 'window.started=true', name: 'Formal integration',
    unknown: { keep: '未知🌸' }, resources: { 'icon.png': Buffer.from([1, 2, 3]).toString('base64') } } });
  assert.equal((await invoke('plugins.list'))['formal-test'].unknown.keep, '未知🌸');
  checks.push({ name: 'author-package-native-registry', pass: true });
  for (const path of ['assets/tavern-shared.global.js', 'assets/assets/tiktoken.global.js', 'client/runtime.js', 'plugin/formal-test/__eleckoi_frame__.html', 'plugin/formal-test/icon.png']) {
    const response = await fetch(new URL('/eleckoi/compat/' + path, ready.url), { headers: { Cookie: cookie } }); assert.equal(response.status, 200, path);
    const bytes = new Uint8Array(await response.arrayBuffer()); assert.ok(bytes.length, path);
    if (path.endsWith('icon.png')) assert.deepEqual([...bytes], [1, 2, 3]);
    checks.push({ name: 'same-origin-' + path, pass: true, bytes: bytes.length });
  }
  const created = await rpc('eleckoiConversations', 'create', { input: { title: 'Author formal integration' } });
  const conversationId = created.conversation.id;
  await assert.rejects(invoke('plugins.bootstrap', { conversationId }), /正式 DSH 消息投影/);
  const bootstrap = await invoke('plugins.bootstrap', { conversationId, presentation: { conversationId, messages: [], isGenerating: false } });
  assert.equal(bootstrap.conversationId, conversationId); assert.deepEqual(bootstrap.messages, []); assert.ok(Array.isArray(bootstrap.tavernPresets));
  assert.equal(bootstrap.presetId, (await rpc('eleckoiAgentPresets', 'catalog')).activePresetId);
  checks.push({ name: 'bootstrap-native-data-preset-model-projection', pass: true });
  let active = await invoke('scripts.synchronize', { conversationId }); assert.ok(active['formal-test']);
  await invoke('plugins.setEnabled', { id: 'formal-test', enabled: false }); active = await invoke('scripts.synchronize', { conversationId }); assert.equal(active['formal-test'], undefined);
  await invoke('plugins.setEnabled', { id: 'formal-test', enabled: true }); await invoke('plugins.patch', { id: 'formal-test', patch: { name: 'Patched' } });
  assert.equal((await invoke('plugins.list'))['formal-test'].name, 'Patched');
  await invoke('plugins.remove', { id: 'formal-test' }); assert.equal((await invoke('plugins.list'))['formal-test'], undefined);
  checks.push({ name: 'native-plugin-enable-patch-remove-and-script-synchronization', pass: true });
  const shutdown = wait('shutdown-complete'); child.stdin.write('{"type":"shutdown"}\n'); await shutdown;
  assert.equal((await exit).code, 0); checks.push({ name: 'graceful-host-disposal', pass: true });
} catch (error) { failure = error.message || String(error); checks.push({ name: 'failure', pass: false, message: failure }); child.kill('SIGTERM'); }
finally {
  output.close(); errors.close(); await mkdir(dirname(report), { recursive: true });
  await writeFile(report, JSON.stringify({ pass: !failure, runtime: process.version, platform: process.platform, checks, diagnostics, temporary: directory }, null, 2) + '\n');
}
if (failure) throw new Error(failure + '; report=' + report);
console.log(JSON.stringify({ pass: true, report, checks: checks.length }));

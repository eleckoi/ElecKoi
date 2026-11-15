import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('@deepseek-ai/dsh-client-ui-workspace/package.json'));
const source = readFileSync(join(packageRoot, 'lib/client.js'), 'utf8');
const ts = createRequire(require.resolve('@deepseek-ai/dsh-typert-generator/package.json'))('typescript');
const parsed = ts.createSourceFile('workspace.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let serviceDeclaration;
const findService = node => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'UiWorkspaceService') serviceDeclaration = node;
  ts.forEachChild(node, findService);
};
findService(parsed);
if (!serviceDeclaration) throw new Error('Locked Workspace service declaration changed');

function fixture(saved = {}, items = []) {
  const disposers = [];
  const list = snapshot => {
    const listeners = new Set();
    return { getSnapshot: () => snapshot,
      subscribe: vi.fn(listener => { listeners.add(listener); return () => listeners.delete(listener); }),
      publish: () => { for (const listener of listeners) listener(); } };
  };
  const workspaces = { list: list({ phase: 'ready', items, archivedSessionIds: [] }),
    initializeDefault: vi.fn(async () => ({ workspaceId: 'workspace-a' })) };
  const releases = [];
  const sessions = { list: list({ phase: 'ready', ids: [], byId: {} }),
    create: vi.fn(async () => 'synthetic-session'),
    subagentAddress: vi.fn(() => undefined),
    retain: vi.fn(sessionId => {
      const release = vi.fn(); releases.push(release);
      return { sessionId, release };
    }) };
  const selection = { getSnapshot: vi.fn(() => saved), set: vi.fn() };
  const ctx = { effect: fn => { disposers.push(fn()); },
    layout: { beginNavigation: vi.fn(() => new AbortController().signal), selectPanel: vi.fn() } };
  const Service = class { constructor(context) { this.ctx = context; } };
  const Constructor = runInNewContext(`var ${serviceDeclaration.getText(parsed)}; UiWorkspaceService`, {
    _deepseek_ai_cordis: { Service },
    _deepseek_ai_dsh_client_store: { createSnapshotStore: () => selection },
    AbortController, AbortSignal, console,
  });
  const navigation = new Constructor(ctx, {}, workspaces, sessions, {}, vi.fn(), false);
  return { navigation, ctx, workspaces, sessions, selection, releases,
    dispose: () => { for (const dispose of disposers) dispose?.(); } };
}

describe('product-owned startup navigation', () => {
  it.each([[], [{ workspaceId: 'workspace-a', path: '/synthetic', sessionIds: [] }]])(
    'does not create or select a Workspace Session during startup: %j', async items => {
      const f = fixture({}, items);
      f.workspaces.list.publish(); f.sessions.list.publish();
      await Promise.resolve(); await Promise.resolve();
      expect(f.workspaces.initializeDefault).not.toHaveBeenCalled();
      expect(f.sessions.create).not.toHaveBeenCalled();
      expect(f.sessions.retain).not.toHaveBeenCalled();
      expect(f.ctx.layout.beginNavigation).not.toHaveBeenCalled();
      expect(f.ctx.layout.selectPanel).not.toHaveBeenCalled();
      // Native subscriptions still perform archived-current cleanup under product startup policy.
      expect(f.workspaces.list.subscribe).toHaveBeenCalledOnce();
      expect(f.sessions.list.subscribe).toHaveBeenCalledOnce();
      f.dispose();
    },
  );

  it.each([{ sessionId: 'synthetic-saved-session' }, { subagentAddress: { parentSessionId: 'synthetic-parent', name: 'synthetic-child' } }])(
    'leaves saved Workspace selection to the product navigation: %j', async saved => {
      const f = fixture(saved);
      f.sessions.list.publish();
      await Promise.resolve();
      expect(f.selection.getSnapshot).not.toHaveBeenCalled();
      expect(f.sessions.retain).not.toHaveBeenCalled();
      expect(f.sessions.create).not.toHaveBeenCalled();
      f.dispose();
    },
  );

  it('retains explicit Session navigation and releases its references on replacement and shutdown', () => {
    const f = fixture();
    f.navigation.openSession('synthetic-first');
    expect(f.sessions.retain).toHaveBeenCalledWith('synthetic-first', { source: 'mainView' });
    expect(f.ctx.layout.selectPanel).toHaveBeenCalledWith(null);
    f.navigation.openSession('synthetic-second');
    expect(f.releases[0]).toHaveBeenCalledOnce();
    expect(f.releases[1]).not.toHaveBeenCalled();
    f.dispose(); f.dispose();
    expect(f.releases[1]).toHaveBeenCalledOnce();
    expect(f.navigation.lifetime.signal.aborted).toBe(true);
  });

  it('archives the common implementation unchanged for Android', () => {
    const result = execFileSync('python', ['-c', `import importlib.util,io,json,sys,tarfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('packager','scripts/android-runtime/package-runtime.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
root=Path(sys.argv[1])
output=io.BytesIO()
with tarfile.open(fileobj=output,mode='w:gz') as archive:
    module.add_directory(archive,root,'workspace','@deepseek-ai/dsh-client-ui-workspace')
output.seek(0)
with tarfile.open(fileobj=output,mode='r:gz') as archive:
    packed=archive.extractfile('workspace/lib/client.js').read()
print(json.dumps({'same':packed==(root/'lib/client.js').read_bytes()}))`, packageRoot], { encoding: 'utf8', windowsHide: true });
    expect(JSON.parse(result)).toEqual({ same: true });
  }, 15_000);
});

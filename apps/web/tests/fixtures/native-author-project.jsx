import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { NativeFrontendProvider } from '../../src/modules/authorFrontend/hooks/NativeFrontendContext.jsx';
import { ApplicationFrontendController } from '../../src/modules/authorFrontend/components/ApplicationFrontendController.jsx';
import { CharacterEditorWindow } from '../../src/app/windows/CharacterEditorWindow.jsx';
import { CharacterFrontendView } from '../../src/modules/authorFrontend/components/CharacterFrontendView.jsx';
import { NativeFrontendClient } from '../../../../packages/client/features/dsh-client-author/src/frontends.ts';
import '../../src/modules/authorFrontend/styles/advancedFrontends.css';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/app/windows/shell/styles/titlebar.css';
import '../../src/app/windows/shell/styles/client-shell.css';
import '../../src/modules/persona/styles/character-editor.css';

window.syntheticProjectSource = '<!doctype html><html lang="en"><head><meta name="eleckoi-author-api" content="0.1.0"><script type="module" src="app.js"></script></head><body><img src="../assets/synthetic.png" width="24" height="24" alt="Synthetic image"><label>Score <input id="score" type="number" value="4"></label><button id="confirm">Confirm</button><button id="play-audio">Play audio</button><output id="result"></output><output id="audio-result"></output></body></html>';
const project = { id: 'synthetic-project', name: 'Synthetic project', scope: 'application', entryFile: 'pages/main.html',
  files: ['pages/main.html', 'pages/app.js', 'shared.css', 'assets/synthetic.png', 'assets/synthetic.wav'],
  manifest: { manifestVersion: 1, sdkVersion: '0.1.0', scope: 'application', entryFile: 'pages/main.html', globalStyles: ['shared.css'],
    bindings: [{ target: 'root', view: 'main', entryFile: 'pages/main.html' }] },
};
window.syntheticProjectWorkspace = { scope: 'application', projects: [project], selectedProjectId: project.id, messageRendererEnabled: true,
  activeBindings: project.manifest.bindings, revision: 1 };
window.mountNativeProjectFixture = (runtime, frontends) => {
  const root = createRoot(document.querySelector('#author-root')), slots = new SlotCore();
  const stopRoot = slots.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' } } }, () => null);
  const connection = value => ({ getSnapshot: () => value, subscribe: () => () => {} });
  document.querySelector('#author-root').style.height = '320px';
  flushSync(() => root.render(<NativeFrontendProvider connection={connection(frontends)} authorConnection={connection(runtime)}>
    <ApplicationFrontendController slots={slots} subscribeSlots={listener => slots.onMutate(listener)} navigation={{}}>
      {() => <div>Default application</div>}
    </ApplicationFrontendController>
  </NativeFrontendProvider>));
  return () => { flushSync(() => root.unmount()); stopRoot(); };
};

window.mountNativeCharacterFixture = runtime => {
  const characterId = 'synthetic-character';
  let workspace = { ...window.syntheticProjectWorkspace, scope: 'character', characterId, selectedProjectId: null,
    projects: [{ ...project, scope: 'character', characterId, manifest: { ...project.manifest, scope: 'character',
      bindings: [{ target: 'root', view: 'chat', entryFile: project.entryFile }] } }] };
  const files = new Map([[JSON.stringify([project.id, project.entryFile]), window.syntheticProjectSource]]), feeds = new Set();
  class Feed {
    queue = []; closed = false;
    constructor(signal) { feeds.add(this); signal.addEventListener('abort', () => this.dispose(), { once: true }); this.push({ kind: 'snapshot', revision: workspace.revision }); }
    push(value) { this.queue.push(value); this.wake?.(); }
    dispose() { this.closed = true; feeds.delete(this); this.wake?.(); }
    async *[Symbol.asyncIterator]() { while (!this.closed) { if (this.queue.length) yield this.queue.shift(); else await new Promise(resolve => { this.wake = resolve; }); } }
  }
  const check = owner => { if (owner.scope !== 'character' || owner.characterId !== characterId) throw new Error('Synthetic role owner mismatch'); };
  const updated = () => { workspace.revision++; for (const feed of feeds) feed.push({ kind: 'snapshot', revision: workspace.revision }); return { ok: true, value: structuredClone(workspace) }; };
  const remote = {
    workspace: async owner => { check(owner); return { ok: true, value: structuredClone(workspace) }; },
    changes: (owner, signal) => { check(owner); return new Feed(signal); },
    readFile: async (owner, id, query) => {
      check(owner); const content = files.get(JSON.stringify([id, query.path])); if (content === undefined) throw new Error('Unknown synthetic role file');
      return { ok: true, value: { path: query.path, content } };
    },
    importProject: async (owner, options) => {
      check(owner); const id = crypto.randomUUID();
      const item = { id, name: options.name, scope: 'character', characterId, entryFile: 'index.html', files: ['index.html'],
        manifest: options.manifest, updatedAt: String(workspace.revision) };
      const source = options.files?.[0]?.content ?? new TextDecoder().decode(Uint8Array.from(atob(options.data), value => value.charCodeAt(0)));
      files.set(JSON.stringify([id, 'index.html']), source); workspace.projects.push(item); return updated();
    },
    select: async (owner, id) => { check(owner); workspace.selectedProjectId = id; return updated(); },
    restoreDefault: async owner => { check(owner); workspace.selectedProjectId = null; return updated(); },
    writeFile: async (owner, id, file) => {
      check(owner); files.set(JSON.stringify([id, file.path]), file.content); workspace.projects.find(item => item.id === id).updatedAt = String(workspace.revision + 1); return updated();
    },
  };
  const service = new NativeFrontendClient(remote), root = createRoot(document.querySelector('#author-root'));
  const connection = value => ({ getSnapshot: () => value, subscribe: () => () => {} });
  const catalog = { refresh: async () => ({ items: [{ id: characterId, name: 'Synthetic character', persona: {} }] }) };
  function Fixture() {
    const [editor, setEditor] = useState(true);
    return <NativeFrontendProvider connection={connection(service)} authorConnection={connection(runtime)}>
      <nav><button onClick={() => setEditor(true)}>Show editor</button><button onClick={() => setEditor(false)}>Show chat</button></nav>
      <div style={{ height: 560 }}>{editor ? <CharacterEditorWindow embeddedCharacterId={characterId}
        characterCatalog={catalog} characterConfiguration={{}} compact={window.innerWidth <= 760}
        renderHeader={() => <header>Synthetic character</header>} />
        : <CharacterFrontendView characterId={characterId} conversationId="synthetic-chat">{frontend => frontend ?? <div>Default transcript</div>}</CharacterFrontendView>}</div>
    </NativeFrontendProvider>;
  }
  document.querySelector('#author-root').style.height = 'auto';
  flushSync(() => root.render(<Fixture />));
  return () => { flushSync(() => root.unmount()); service.dispose(); if (feeds.size) throw new Error('Synthetic role subscriptions were not released'); };
};

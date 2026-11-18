import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { NativeProjectFrame } from '../../src/modules/authorFrontend/components/NativeProjectFrame.jsx';
import { CharacterFrontendView } from '../../src/modules/authorFrontend/components/CharacterFrontendView.jsx';
import { NativeFrontendProvider } from '../../src/modules/authorFrontend/hooks/NativeFrontendContext.jsx';

// Deliberately no advancedFrontends.css: production project frames also mount
// inside the character workbench's shadow root, outside global styles.
let root;
const runtime = { mountProjectDocument(page) { window.layoutLifecycle.mounts++; page.ElecKoi = {}; return () => { window.layoutLifecycle.releases++; }; } };
const project = { id: 'synthetic-layout', name: 'Synthetic character', scope: 'character', characterId: 'synthetic-character', entryFile: 'index.html', files: ['index.html'],
  manifest: { manifestVersion: 1, sdkVersion: '0.1.0', scope: 'character', entryFile: 'index.html', bindings: [{ target: 'root', view: 'chat', entryFile: 'index.html' }] } };
window.renderProjectLayout = (shadow, automatic) => {
  if (root) flushSync(() => root.unmount());
  window.layoutLifecycle = { mounts: 0, releases: 0 };
  document.body.innerHTML = '<aside style="position:absolute;inset:0 auto 0 0;width:260px;background:#ddd"></aside><main style="position:absolute;inset:40px 0 100px 260px;display:flex;flex-direction:column"></main><footer style="position:absolute;left:260px;right:0;bottom:0;height:100px"></footer>';
  const host = document.querySelector('main');
  const seat = shadow ? host.attachShadow({ mode: 'open' }) : host;
  const container = document.createElement('section');
  container.style.cssText = 'height:100%;min-height:0;display:flex;flex-direction:column;width:100%';
  seat.append(container); root = createRoot(container);
  const source = '<!doctype html><meta name="eleckoi-author-api" content="0.1.0"><style>html,body{margin:0;padding:0}</style><div style="height:240px;background:#aacbd5">Synthetic character content</div>';
  const frame = <NativeProjectFrame project={project} content={source} entryFile="index.html" runtime={runtime}
    context={{ view: 'chat', binding: automatic ? { target: 'slot', slot: 'synthetic.side' } : { target: 'root' }, owner: { characterId: project.characterId, conversationId: 'synthetic-chat' } }} />;
  const service = {
    watch(owner, publish) { publish({ ...owner, projects: [project], selectedProjectId: project.id, revision: 1 }); return () => {}; },
    projects: { readFile: async () => ({ ok: true, value: { content: source } }) },
  };
  const connection = value => ({ getSnapshot: () => value, subscribe: () => () => {} });
  flushSync(() => root.render(!shadow && !automatic
    ? <NativeFrontendProvider connection={connection(service)} authorConnection={connection(runtime)}>
      <CharacterFrontendView characterId={project.characterId} conversationId="synthetic-chat">{frontend => frontend}</CharacterFrontendView>
    </NativeFrontendProvider> : frame));
  window.layoutSeat = seat;
};

window.triggerProjectLayoutNotification = () => {
  const frame = window.layoutSeat.querySelector('iframe');
  window.layoutFrame = frame;
  frame.contentWindow.eval(`
    window.layoutObserverSettled = false;
    const box = document.createElement('div'); box.style.cssText = 'width:100px;height:1px;position:absolute'; document.body.append(box);
    let changed = false;
    const observer = new ResizeObserver(() => {
      if (!changed) { changed = true; box.style.width = '150px'; }
      else { observer.disconnect(); box.remove(); window.layoutObserverSettled = true; }
    });
    observer.observe(box);
  `);
};

window.triggerProjectMediaFailure = () => {
  const page = window.layoutFrame.contentWindow;
  page.eval(`
    window.layoutMediaFailed = false;
    const image = document.createElement('img');
    image.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px';
    image.addEventListener('error', () => { window.layoutMediaFailed = true; image.remove(); }, { once: true });
    image.src = 'data:image/png;base64,AA==';
    document.body.append(image);
  `);
};

// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { AdvancedFrontendFrame } from '../../src/modules/authorFrontend/components/AdvancedFrontendFrame.jsx';
import { ApplicationFrontendController } from '../../src/modules/authorFrontend/components/ApplicationFrontendController.jsx';
import { NativeFrontendProvider } from '../../src/modules/authorFrontend/hooks/NativeFrontendContext.jsx';
import { useFrontendWorkspace } from '../../src/modules/authorFrontend/hooks/useFrontendWorkspace.js';
import * as compatibility from '@eleckoi/tavern-frontend';

const html = '<html><head><meta name="eleckoi-author-api" content="0.1.0"><script src="app.js"></script></head><body><img src="../assets/synthetic.png"><button>Confirm</button></body></html>';
const project = { id: 'synthetic-project', name: 'Synthetic project', entryFile: 'pages/main.html', files: ['pages/main.html'],
  scope: 'application', manifest: { manifestVersion: 1, sdkVersion: '0.1.0', scope: 'application', entryFile: 'pages/main.html',
    globalStyles: ['shared.css'], bindings: [{ target: 'root', view: 'main', entryFile: 'pages/main.html' }] } };
const workspace = revision => ({ scope: 'application', projects: [project], selectedProjectId: project.id, messageRendererEnabled: true, activeBindings: project.manifest.bindings, revision });
let container, root, runtime, connection, authorConnection, stop, request, service, listeners, liveRuntime;
const provider = children => <NativeFrontendProvider connection={connection} authorConnection={authorConnection}>{children}</NativeFrontendProvider>;
const render = async props => {
  await act(() => root.render(provider(<AdvancedFrontendFrame project={project} revision={1} request={request} context={{ view: 'main', binding: project.manifest.bindings[0] }} {...props} />)));
};
const load = async frame => act(() => frame.dispatchEvent(new Event('load')));
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  delete window.__ElecKoiHtmlResources;
  const getWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get;
  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockImplementation(function () {
    const page = getWindow.call(this);
    if (page && this.name?.startsWith('native-project:') && !page.__ElecKoiCompleteDocument) {
      page.__ElecKoiDocumentChannel = this.name; page.__ElecKoiCompleteDocument = vi.fn();
    }
    if (page && this.name?.startsWith('frontend:') && !page.__ElecKoiCompleteSharedDocument) {
      page.__ElecKoiDocumentChannel = this.name; page.__ElecKoiCompleteSharedDocument = vi.fn();
    }
    return page;
  });
  stop = vi.fn(); listeners = new Set();
  runtime = { mountProjectDocument: vi.fn(target => { target.ElecKoi = { api: { version: '0.1.0' } }; return stop; }) }; liveRuntime = runtime;
  request = vi.fn(async () => ({ content: html }));
  service = { watch: vi.fn((_owner, listener) => { listener(workspace(1)); return vi.fn(); }),
    projects: { readFile: vi.fn(async () => ({ ok: true, value: { content: html } })) } };
  connection = { getSnapshot: () => service, subscribe: () => () => {} };
  authorConnection = { getSnapshot: () => liveRuntime, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('production native project frame', () => {
  it('keeps a compatibility page alive after a reported operation error but still fails initialization', async () => {
    request.mockResolvedValue({ content: '<body>Compatibility page</body>' });
    const dispose = vi.fn(), onError = vi.fn();
    let diagnose, rejectReady;
    const ready = new Promise((_resolve, reject) => { rejectReady = reject; });
    vi.spyOn(compatibility, 'mountFrontendCompatibility').mockImplementation((_page, _mount, report) => {
      diagnose = report; return { dispose, ready };
    });
    await render({ onError, runtime: { assetsBaseUrl: '/synthetic/', sdk: { browserModuleImports: () => ({}), BROWSER_LIBRARY_STYLES: [], BROWSER_LIBRARY_SCRIPTS: [], BROWSER_LIBRARY_VERSIONS: {} } } });
    const frame = container.querySelector('iframe'); await load(frame);
    await act(() => diagnose(new Error('Synthetic rejected action')));
    expect(container.querySelector('iframe')).toBe(frame);
    expect(container.querySelector('details').textContent).toContain('Synthetic rejected action');
    expect(onError).not.toHaveBeenCalled(); expect(dispose).not.toHaveBeenCalled();
    await act(async () => { rejectReady(new Error('Synthetic initialization failure')); await Promise.resolve(); });
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[role=alert]').textContent).toContain('Synthetic initialization failure');
    expect(onError).toHaveBeenCalledOnce();
  });
  it.each(['native', 'compatibility'])('retains the %s document and runtime while exposing deduplicated diagnostics', async kind => {
    const onError = vi.fn();
    let dispose = stop;
    let props = { onError };
    if (kind === 'compatibility') {
      request.mockResolvedValue({ content: '<html><body>Compatibility document</body></html>' });
      dispose = vi.fn();
      vi.spyOn(compatibility, 'mountFrontendCompatibility').mockReturnValue({ dispose, ready: Promise.resolve() });
      props.runtime = { assetsBaseUrl: '/synthetic/', sdk: { browserModuleImports: () => ({}), BROWSER_LIBRARY_STYLES: [], BROWSER_LIBRARY_SCRIPTS: [], BROWSER_LIBRARY_VERSIONS: {} } };
    }
    await render(props); const frame = container.querySelector('iframe'); await load(frame);
    const message = 'ResizeObserver loop completed with undelivered notifications.';
    const send = (source, channel) => window.dispatchEvent(new MessageEvent('message', { source, data: { channel, type: 'eleckoi:frontend-diagnostic', message } }));
    await act(() => { send(window, frame.name); send(frame.contentWindow, 'other-channel'); });
    expect(container.querySelector('details')).toBeNull();
    await act(() => { send(frame.contentWindow, frame.name); send(frame.contentWindow, frame.name); });
    expect(container.querySelector('iframe')).toBe(frame);
    expect(container.querySelectorAll('details pre')).toHaveLength(1);
    expect(container.querySelector('details').textContent).toContain(message);
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(dispose).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
    await render({ ...props, revision: 2 });
    expect(dispose).toHaveBeenCalledOnce(); expect(container.querySelector('details')).toBeNull();
  });
  it('uses the native SDK with actual project identity and own relative resources, preserving the document across context updates', async () => {
    await render(); const frame = container.querySelector('iframe'); await load(frame);
    expect(runtime.mountProjectDocument).toHaveBeenCalledExactlyOnceWith(frame.contentWindow, { scope: 'application', projectId: project.id, entryFile: 'pages/main.html', view: 'main' });
    expect(frame.contentWindow.__ElecKoiCompleteDocument).toHaveBeenCalledWith(frame.contentWindow.ElecKoi);
    const doc = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
    expect(doc.querySelector('base').getAttribute('href')).toBe(new URL('/eleckoi/frontends/synthetic-project/pages/', document.baseURI).href);
    expect(doc.querySelector('link').getAttribute('href')).toBe('/eleckoi/frontends/synthetic-project/shared.css?revision=1');
    expect(frame.srcdoc).not.toMatch(/TavernHelper|SillyTavern|Mvu|__ElecKoiHtmlResources|\/eleckoi\/compat\//);
    await render({ context: { view: 'main', owner: { conversationId: 'synthetic-chat' }, binding: project.manifest.bindings[0] } });
    expect(container.querySelector('iframe')).toBe(frame);
    expect(frame.contentWindow.ElecKoiFrontendContext.owner.conversationId).toBe('synthetic-chat');
    expect(runtime.mountProjectDocument).toHaveBeenCalledOnce();
  });
  it('releases failed or withdrawn pages, ignores other frames, and uses a new realm when the service is replaced', async () => {
    await render(); const first = container.querySelector('iframe'); await load(first);
    await act(() => window.dispatchEvent(new MessageEvent('message', { source: window, data: { channel: first.name, type: 'eleckoi:frontend-error', message: 'Other frame' } })));
    expect(container.querySelector('[role=alert]')).toBeNull();
    const replacement = { mountProjectDocument: vi.fn(target => { target.ElecKoi = {}; return vi.fn(); }) };
    await act(() => { liveRuntime = replacement; listeners.forEach(listener => listener()); });
    const second = container.querySelector('iframe'); await load(second);
    expect(second).not.toBe(first); expect(stop).toHaveBeenCalledOnce(); expect(replacement.mountProjectDocument).toHaveBeenCalledOnce();
    await act(() => window.dispatchEvent(new MessageEvent('message', { source: second.contentWindow, data: { channel: second.name, type: 'eleckoi:frontend-error', message: 'Synthetic failure' } })));
    expect(container.textContent).toContain('Synthetic failure'); expect(container.querySelector('iframe')).toBeNull();
    await render({ revision: 2 }); const third = container.querySelector('iframe'); await load(third);
    expect(third).not.toBe(second);
    await act(() => { liveRuntime = null; listeners.forEach(listener => listener()); });
    expect(container.textContent).toContain('原生作者插件未启用'); expect(container.querySelector('iframe')).toBeNull();
  });
  it('measures slot height in both directions and never turns unknown versions into compatibility documents', async () => {
    await render({ context: { view: 'main', binding: { target: 'slot', slot: 'synthetic-slot', entryFile: 'pages/main.html' } } });
    const frame = container.querySelector('iframe'); await load(frame);
    for (const height of [450, 120]) {
      await act(() => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { channel: frame.name, type: 'eleckoi:rich-height', height } })));
      expect(frame.style.height).toBe(`${height}px`);
    }
    request.mockResolvedValue({ content: html.replace('0.1.0', '9.0.0') });
    await render({ revision: 2, runtime: { sdk: {} } });
    expect(container.textContent).toContain('不支持这个格式、版本或能力：原生作者 SDK 声明。');
    expect(container.querySelector('iframe')).toBeNull();
    expect(runtime.mountProjectDocument).toHaveBeenCalledOnce();
  });
})

describe('native project management in the existing UI', () => {
  it('does not withdraw the root project when another binding fails, while root failures retain fallback recovery', async () => {
    const slots = new SlotCore();
    const stopRoot = slots.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' }, 'synthetic.extension': { kind: 'single', scope: 'root' } } }, () => null);
    const register = vi.spyOn(slots, 'register');
    const bindings = [...project.manifest.bindings, { target: 'slot', slot: 'synthetic.extension', entryFile: 'extension.html' }];
    service.watch.mockImplementation((_owner, listener) => { listener({ ...workspace(1), projects: [{ ...project, manifest: { ...project.manifest, bindings } }] }); return vi.fn(); });
    await act(() => root.render(provider(<ApplicationFrontendController slots={slots} subscribeSlots={listener => slots.onMutate(listener)} navigation={{}}>{() => <div>Default application</div>}</ApplicationFrontendController>)));
    const frame = container.querySelector('iframe'); await load(frame);
    const contribution = register.mock.calls.find(([options]) => options.name === 'synthetic.extension')[1];
    await act(() => contribution({}).props.onError('Synthetic extension failure'));
    expect(container.textContent).toContain('Synthetic extension failure');
    expect(container.querySelector('iframe')).toBe(frame); expect(stop).not.toHaveBeenCalled();
    await act(() => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { channel: frame.name, type: 'eleckoi:frontend-error', message: 'Synthetic root failure' } })));
    expect(container.textContent).toContain('Default application');
    expect(container.textContent).toContain('Synthetic root failure');
    expect(stop).toHaveBeenCalledOnce();
    await act(() => root.render(null)); stopRoot();
  });
  it('loads the production application controller through native projects without a compatibility runtime', async () => {
    const slots = new SlotCore(), stopRoot = slots.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' } } }, () => null);
    await act(() => root.render(provider(<ApplicationFrontendController slots={slots} subscribeSlots={listener => slots.onMutate(listener)} navigation={{}}>
      {() => <div>Default application</div>}
    </ApplicationFrontendController>)));
    const frame = container.querySelector('iframe'); await load(frame);
    expect(service.watch).toHaveBeenCalledWith({ scope: 'application' }, expect.any(Function), expect.any(Function));
    expect(service.projects.readFile).toHaveBeenCalledExactlyOnceWith({ scope: 'application' }, project.id, { path: 'pages/main.html' });
    expect(runtime.mountProjectDocument).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-application-frontend]').dataset.applicationFrontend).toBe(project.id);
    expect(window.__ElecKoiHtmlResources).toBeUndefined();
    await act(() => root.render(null)); stopRoot();
    expect(document.head.querySelector('[data-eleckoi-application-style]')).toBeNull();
    expect(document.querySelector('[data-eleckoi-frontend-recovery]')).toBeNull();
  });
  it('binds page and plugin-defined slots using the live official declaration tree and removes contributions', async () => {
    const slots = new SlotCore(); const stopRoot = slots.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' }, 'synthetic.extension': { kind: 'single', scope: 'root' } } }, () => null);
    const original = slots.register({ name: 'main', key: 'synthetic-page', priority: 0 }, () => null);
    const bindings = [{ target: 'page', pageId: 'synthetic-page', entryFile: project.entryFile }, { target: 'slot', slot: 'synthetic.extension', entryFile: project.entryFile }];
    service.watch.mockImplementation((_owner, listener) => { listener({ ...workspace(1), projects: [{ ...project, manifest: { ...project.manifest, bindings } }] }); return vi.fn(); });
    await act(() => root.render(provider(<ApplicationFrontendController slots={slots} subscribeSlots={listener => slots.onMutate(listener)} navigation={{}}>{() => <div>Default application</div>}</ApplicationFrontendController>)));
    expect(slots.entriesOfSlot('main')[0].registrant).toBe('@eleckoi/application-frontend');
    expect(slots.entriesOfSlot('main')[0].options.key).toBe('synthetic-page');
    expect(slots.entriesOfSlot('synthetic.extension')).toHaveLength(1);
    await act(() => root.render(null));
    expect(slots.entriesOfSlot('main')).toHaveLength(1); expect(slots.entriesOfSlot('main')[0].options.key).toBe('synthetic-page');
    expect(slots.entriesOfSlot('synthetic.extension')).toHaveLength(0);
    original(); stopRoot();
  });
  it('isolates character workspace selection and does not let late saves overwrite a different owner', async () => {
    let read, finish;
    const subscriptions = [], stops = [];
    service.watch.mockImplementation((owner, listener) => { subscriptions.push({ owner, listener }); const stop = vi.fn(); stops.push(stop); return stop; });
    service.projects.select = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    function View({ id }) { const state = useFrontendWorkspace(id); read = state; return <output>{JSON.stringify(state.workspace)}</output>; }
    await act(() => root.render(provider(<View id="synthetic-character" />)));
    await act(() => subscriptions[0].listener({ ...workspace(1), scope: 'character', characterId: 'synthetic-character' }));
    let saved;
    await act(() => { saved = read.request('frontends.select', { projectId: null }); });
    await act(() => root.render(provider(<View id="synthetic-other" />)));
    expect(stops[0]).toHaveBeenCalledOnce(); expect(container.textContent).not.toContain('synthetic-project');
    await act(async () => { finish({ ok: true, value: { ...workspace(99), scope: 'character', characterId: 'synthetic-character' } }); await saved; });
    expect(container.textContent).not.toContain('synthetic-project');
    await act(() => subscriptions[1].listener({ ...workspace(2), scope: 'character', characterId: 'synthetic-other' }));
    expect(read.workspace.characterId).toBe('synthetic-other'); expect(read.workspace.revision).toBe(2);
  });
})

// @vitest-environment jsdom
import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeFrontendProvider } from '../../src/modules/authorFrontend/hooks/NativeFrontendContext.jsx';
import { CharacterFrontendPanel } from '../../src/modules/authorFrontend/components/CharacterFrontendPanel.jsx';
import { CharacterFrontendView } from '../../src/modules/authorFrontend/components/CharacterFrontendView.jsx';
import { characterFrontendEntry } from '../../src/modules/authorFrontend/model/characterFrontend.js';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MessagesPage } from '../../../../packages/client/features/dsh-client-conversations/src/page.jsx';
import { ImportIcon, ExportIcon } from '../../src/ui/icons/openSourceIcons.jsx';

const characterId = 'synthetic-character';
const html = '<!doctype html><meta name="eleckoi-author-api" content="0.1.0"><button>Confirm</button>';
const sample = () => ({ id: 'synthetic-role-project', name: 'Synthetic role project', scope: 'character', characterId,
  entryFile: 'pages/main.html', files: ['pages/main.html', 'assets/synthetic.bin'], updatedAt: 'synthetic-version-1',
  manifest: { manifestVersion: 1, sdkVersion: '0.1.0', scope: 'character', entryFile: 'pages/main.html',
    bindings: [{ target: 'root', view: 'chat', entryFile: 'pages/main.html' }] } });
let container, root, state, service, runtime, stopPage, files, watchers, stopWatch, dirty;
const value = () => structuredClone(state);
const provider = children => <NativeFrontendProvider connection={{ getSnapshot: () => service, subscribe: () => () => {} }}
  authorConnection={{ getSnapshot: () => runtime, subscribe: () => () => {} }}>{children}</NativeFrontendProvider>;
const render = async element => act(() => root.render(provider(element)));
const shadow = () => container.querySelector('.character-frontend-editor').shadowRoot;
const click = async (label, scope = shadow()) => {
  const button = [...scope.querySelectorAll('button')].find(item => item.textContent.trim() === label || item.getAttribute('aria-label') === label);
  expect(button).toBeTruthy(); await act(() => button.click());
};
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  files = new Map([['pages/main.html', html]]); watchers = new Set(); stopWatch = vi.fn(); stopPage = vi.fn(); dirty = vi.fn();
  state = { scope: 'character', characterId, projects: [sample()], selectedProjectId: null, activeBindings: [], messageRendererEnabled: true, revision: 1 };
  const owner = input => { expect(input).toEqual({ scope: 'character', characterId }); };
  const update = () => { state.revision++; watchers.forEach(listener => listener(value())); return { ok: true, value: value() }; };
  service = { watch: vi.fn((input, listener) => {
    if (input.characterId === characterId) { watchers.add(listener); listener(value()); }
    else listener({ ...value(), characterId: input.characterId, projects: [], selectedProjectId: null });
    return () => { stopWatch(); watchers.delete(listener); };
  }), projects: {
    readFile: vi.fn(async (input, id, query) => { owner(input); expect(state.projects.some(project => project.id === id)).toBe(true); return { ok: true, value: { content: files.get(query.path) } }; }),
    importProject: vi.fn(async (input, options) => {
      owner(input); const project = { ...sample(), id: 'synthetic-new-project', name: options.name, files: ['index.html'], entryFile: 'index.html', manifest: options.manifest };
      state.projects.push(project); files.set('index.html', options.files?.[0]?.content || html);
      if (options.select !== false) state.selectedProjectId = project.id;
      return update();
    }),
    select: vi.fn(async (input, id) => { owner(input); state.selectedProjectId = id; return update(); }),
    restoreDefault: vi.fn(async input => { owner(input); state.selectedProjectId = null; return update(); }),
    writeFile: vi.fn(async (input, id, file) => { owner(input); files.set(file.path, file.content); state.projects.find(project => project.id === id).updatedAt = `synthetic-version-${state.revision + 1}`; return update(); }),
  } };
  runtime = { mountProjectDocument: vi.fn(page => { page.ElecKoi = {}; return stopPage; }) };
  const getWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get;
  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockImplementation(function () {
    const page = getWindow.call(this);
    if (page && this.name?.startsWith('native-project:') && !page.__ElecKoiCompleteDocument) {
      page.__ElecKoiDocumentChannel = this.name; page.__ElecKoiCompleteDocument = vi.fn();
    }
    return page;
  });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('character frontend file management', () => {
  const rightClick = async element => act(() => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, clientX: 100, clientY: 100 })));
  const menuAction = async label => {
    const menu = shadow().querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    await act(() => [...menu.querySelectorAll('button')].find(button => button.textContent === label).click());
  };
  it('uses the established downward import and upward export icons', async () => {
    await render(<CharacterFrontendPanel characterId={characterId} />);
    for (const [label, Icon] of [['导入', ImportIcon], ['导出项目', ExportIcon]]) {
      const expected = document.createElement('div'); expected.innerHTML = renderToStaticMarkup(<Icon size={17} />);
      expect(shadow().querySelector(`[aria-label="${label}"] svg`).innerHTML).toBe(expected.querySelector('svg').innerHTML);
    }
  });
  it('keeps project commands inside the shadow menu and deletes the clicked project without clearing another project editor', async () => {
    vi.useFakeTimers();
    state.projects.push({ ...sample(), id: 'synthetic-other-project', name: 'Synthetic other project' });
    service.projects.delete = vi.fn(async (input, id) => { ownerCheck(input); state.projects = state.projects.filter(project => project.id !== id); state.revision++; watchers.forEach(listener => listener(value())); return { ok: true, value: value() }; });
    function ownerCheck(input) { expect(input).toEqual({ scope: 'character', characterId }); }
    await render(<CharacterFrontendPanel characterId={characterId} />); await click('pages/main.html');
    const editor = shadow().querySelector('textarea');
    const target = [...shadow().querySelectorAll('[aria-label="前端项目"] button')].find(button => button.textContent === 'Synthetic other project');
    await rightClick(target);
    expect(document.querySelector('[role="menu"][aria-label="项目操作"]')).toBeNull();
    expect(shadow().activeElement.textContent).toBe('编辑');
    await act(() => shadow().querySelector('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(shadow().activeElement).toBe(target); expect(shadow().querySelector('[role="menu"]')).toBeNull();
    await rightClick(target); await menuAction('删除');
    expect(shadow().querySelector('[role="dialog"]').textContent).toContain('Synthetic other project');
    await click('删除', shadow().querySelector('[role="dialog"]'));
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(service.projects.delete).toHaveBeenCalledWith({ scope: 'character', characterId }, 'synthetic-other-project');
    expect(shadow().querySelector('textarea')).toBe(editor); expect(editor.value).toBe(html);
  });
  it('deletes and replaces the clicked file rather than the open editor file, and protects the manifest', async () => {
    vi.useFakeTimers();
    service.projects.replaceFiles = vi.fn(async (input, id, options) => {
      expect(input).toEqual({ scope: 'character', characterId }); expect(id).toBe('synthetic-role-project');
      for (const path of options.deletePaths || []) state.projects[0].files = state.projects[0].files.filter(file => file !== path);
      state.revision++; watchers.forEach(listener => listener(value())); return { ok: true, value: value() };
    });
    await render(<CharacterFrontendPanel characterId={characterId} />); await click('pages/main.html');
    const editor = shadow().querySelector('textarea');
    await rightClick(shadow().querySelector('[title="assets/synthetic.bin"]')); await menuAction('替换文件');
    const input = shadow().querySelectorAll('input[type="file"]')[1];
    Object.defineProperty(input, 'files', { value: [{ name: 'synthetic-replacement.bin', arrayBuffer: async () => Uint8Array.of(1, 2, 3).buffer }] });
    await act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(service.projects.replaceFiles).toHaveBeenLastCalledWith({ scope: 'character', characterId }, 'synthetic-role-project',
      { files: [{ path: 'assets/synthetic.bin', content: 'AQID', encoding: 'base64' }] });
    expect(shadow().querySelector('textarea')).toBe(editor);
    await rightClick(shadow().querySelector('[title="eleckoi.frontend.json"]'));
    expect([...shadow().querySelectorAll('[role="menuitem"]')].map(button => button.textContent)).toEqual(['编辑']);
    await act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true })));
    expect(shadow().querySelector('[role="menu"]')).toBeNull();
    await rightClick(shadow().querySelector('[title="assets/synthetic.bin"]')); await menuAction('删除文件');
    await click('删除', shadow().querySelector('[role="dialog"]')); await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(service.projects.replaceFiles).toHaveBeenLastCalledWith({ scope: 'character', characterId }, 'synthetic-role-project', { files: [], deletePaths: ['assets/synthetic.bin'] });
    expect(shadow().querySelector('textarea')).toBe(editor); expect(editor.value).toBe(html);
  });
  it('creates and selects a role-owned native project without enabling an application replacement', async () => {
    await render(<CharacterFrontendPanel characterId={characterId} />);
    await click('新建');
    expect(state.selectedProjectId).toBeNull();
    await click('启用');
    expect(service.projects.importProject).toHaveBeenCalledWith({ scope: 'character', characterId }, expect.objectContaining({
      select: false,
      manifest: { manifestVersion: 1, sdkVersion: '0.1.0', scope: 'character', entryFile: 'index.html', bindings: [{ target: 'root', view: 'chat', entryFile: 'index.html' }] },
    }));
    expect(service.projects.importProject.mock.calls[0][1].files[0].content).toContain('eleckoi-author-api');
    expect(service.projects.select).toHaveBeenCalledWith({ scope: 'character', characterId }, 'synthetic-new-project');
    expect(state.selectedProjectId).toBe('synthetic-new-project');
  });
  it('imports a role page without replacing the project already in use', async () => {
    state.selectedProjectId = 'synthetic-role-project';
    await render(<CharacterFrontendPanel characterId={characterId} />);
    const input = shadow().querySelector('input[accept=".html,.htm,.zip"]');
    const bytes = new TextEncoder().encode(html);
    Object.defineProperty(input, 'files', { value: [{ name: 'synthetic-page.html', arrayBuffer: async () => bytes.buffer }] });
    await act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(service.projects.importProject).toHaveBeenCalledWith({ scope: 'character', characterId }, expect.objectContaining({ select: false }));
    expect(state.selectedProjectId).toBe('synthetic-role-project');
    expect(service.projects.select).not.toHaveBeenCalled();
  });
  it('retains a failed file edit, reports dirty state, and saves through the editor controller on retry', async () => {
    const controller = createRef(); await render(<CharacterFrontendPanel ref={controller} characterId={characterId} onDirtyChange={dirty} />);
    await click('pages/main.html'); const editor = shadow().querySelector('textarea');
    await act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, `${html}\n<p>Synthetic edit</p>`); editor.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(dirty).toHaveBeenLastCalledWith(true);
    service.projects.writeFile.mockResolvedValueOnce({ ok: false, error: { code: 'SYNTHETIC_WRITE_FAILED', message: 'Synthetic write failure' } });
    let saved; await act(async () => { saved = await controller.current.save(); });
    expect(saved).toBe(false); expect(shadow().textContent).toContain('Synthetic write failure');
    expect(editor.value).toContain('Synthetic edit'); expect(dirty).toHaveBeenLastCalledWith(true);
    await act(async () => { saved = await controller.current.save(); });
    expect(saved).toBe(true); expect(files.get('pages/main.html')).toContain('Synthetic edit'); expect(dirty).toHaveBeenLastCalledWith(false);
  });
  it('previews a saved entry using the role SDK, then returns to the file editor and releases the page', async () => {
    await render(<CharacterFrontendPanel characterId={characterId} />); await click('预览');
    const frame = shadow().querySelector('iframe'); await act(() => frame.dispatchEvent(new Event('load')));
    expect(runtime.mountProjectDocument).toHaveBeenCalledWith(frame.contentWindow, { scope: 'character', characterId,
      projectId: 'synthetic-role-project', entryFile: 'pages/main.html', view: 'chat' });
    expect(service.projects.readFile).toHaveBeenCalledWith({ scope: 'character', characterId }, 'synthetic-role-project', { path: 'pages/main.html' });
    await click('返回文件'); expect(stopPage).toHaveBeenCalledOnce(); expect(shadow().querySelector('iframe')).toBeNull();
    expect(shadow().querySelector('[aria-label="角色前端工作台"]')).toBeTruthy();
  });
  it('retains the explicitly chosen project and file across preview instead of selecting the first project on return', async () => {
    state.projects.push({ ...sample(), id: 'synthetic-other-project', name: 'Synthetic other project' });
    await render(<CharacterFrontendPanel characterId={characterId} />);
    await click('Synthetic other project'); await click('pages/main.html');
    const editor = shadow().querySelector('textarea');
    await click('预览'); await click('返回文件'); await click('启用');
    expect(service.projects.select).toHaveBeenCalledWith({ scope: 'character', characterId }, 'synthetic-other-project');
    expect(shadow().querySelector('textarea')).toBe(editor);
    expect(shadow().querySelector('textarea').value).toBe(html);
  });
});

describe('native role chat project', () => {
  const view = (id = characterId, conversationId = 'synthetic-chat') => <CharacterFrontendView characterId={id} conversationId={conversationId} fallback={<div>Default transcript</div>} />;
  it('uses only the explicit selection and releases the page when the owner deselects the project', async () => {
    await render(view()); expect(container.textContent).toBe('Default transcript'); expect(service.projects.readFile).not.toHaveBeenCalled();
    await act(() => { state.selectedProjectId = 'synthetic-role-project'; state.revision++; watchers.forEach(listener => listener(value())); });
    const first = container.querySelector('iframe'); await act(() => first.dispatchEvent(new Event('load')));
    expect(runtime.mountProjectDocument).toHaveBeenCalledWith(first.contentWindow, { scope: 'character', characterId,
      conversationId: 'synthetic-chat', projectId: 'synthetic-role-project', entryFile: 'pages/main.html', view: 'chat' });
    await render(view(characterId, 'synthetic-next-chat'));
    const second = container.querySelector('iframe'); await act(() => second.dispatchEvent(new Event('load')));
    expect(second).not.toBe(first); expect(stopPage).toHaveBeenCalledOnce();
    await act(() => service.projects.restoreDefault({ scope: 'character', characterId }));
    expect(container.textContent).toBe('Default transcript'); expect(state.projects).toHaveLength(1); expect(files.get('pages/main.html')).toBe(html);
    expect(stopPage).toHaveBeenCalledTimes(2);
  });
  it('unsubscribes when changing character and never displays a project selected by another owner', async () => {
    state.selectedProjectId = 'synthetic-role-project'; await render(view());
    await render(view('synthetic-other-character'));
    expect(stopWatch).toHaveBeenCalledOnce(); expect(container.textContent).toBe('Default transcript');
    expect(service.watch).toHaveBeenLastCalledWith({ scope: 'character', characterId: 'synthetic-other-character' }, expect.any(Function), expect.any(Function));
  });
  it('reports unsupported binding semantics and does not run an undeclared page through a different SDK', async () => {
    state.selectedProjectId = 'synthetic-role-project'; state.projects[0].manifest.bindings = [{ target: 'page', pageId: 'synthetic-page', entryFile: 'pages/main.html' }];
    await render(view()); expect(container.textContent).toContain('不支持这个格式、版本或能力：角色前端的挂载位置。'); expect(service.projects.readFile).not.toHaveBeenCalled();
    await act(() => { state.projects[0] = sample(); files.set('pages/main.html', '<html>Synthetic plain page</html>'); state.revision++; watchers.forEach(listener => listener(value())); });
    expect(container.textContent).toContain('数据格式不符合要求：页面里的原生作者 SDK 声明。'); expect(container.querySelector('iframe')).toBeNull(); expect(runtime.mountProjectDocument).not.toHaveBeenCalled();
  });
  it('does not infer an owner or an entry from project order, names, or available HTML files', () => {
    expect(() => characterFrontendEntry({ ...sample(), characterId: 'synthetic-other-character' }, characterId)).toThrow('不属于');
    expect(() => characterFrontendEntry({ ...sample(), files: ['other.html'] }, characterId)).toThrow('不存在');
    expect(characterFrontendEntry({ ...sample(), manifest: { ...sample().manifest, bindings: [] } }, characterId)).toBe('pages/main.html');
  });
  it('passes the actual conversation character through the main Messages page instead of the sidebar selection', () => {
    const roleplay = vi.fn(() => <div>Roleplay seat</div>);
    const main = { chat: { sessionId: 'synthetic-chat', chatCharacter: { character_id: characterId },
      characters: { active_character_id: 'synthetic-other-character', items: [] }, messages: [], filteredSessions: [], pinnedIds: [] },
      appearance: {}, renderLayout: ({ mainPanel }) => mainPanel, renderRoleplay: roleplay };
    renderToStaticMarkup(<MainPageContext.Provider value={main}><MessagesPage /></MainPageContext.Provider>);
    expect(roleplay.mock.calls[0][0].props).toMatchObject({ characterId, conversationId: 'synthetic-chat' });
  });
});

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
import { ExportIcon } from '../../src/ui/icons/openSourceIcons.jsx';

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
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight').get;
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () { return this.classList.contains('cf-directory') ? 480 : height.call(this); });
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

describe('character frontend package browser', () => {
  const menuAction = async label => {
    await click('前端包更多操作');
    const menu = document.querySelector('[role="menu"]');
    expect(menu).toBeTruthy(); await click(label, menu);
  };
  const choosePackage = async label => {
    await click('切换前端包'); await click(label, document.querySelector('[role="menu"]'));
  };
  it('browses nested package files without editing, copy controls or redundant status labels', async () => {
    const controller = createRef(); state.selectedProjectId = state.projects[0].id;
    await render(<CharacterFrontendPanel ref={controller} characterId={characterId} onDirtyChange={dirty} />);
    expect(shadow().textContent).toContain(html);
    expect(shadow().querySelector('textarea,[contenteditable=true]')).toBeNull();
    expect(shadow().textContent).not.toMatch(/只读|使用中|新建|添加资源|保存文件|复制/);
    expect(shadow().querySelectorAll('input[type=file]')).toHaveLength(1);
    expect(dirty).toHaveBeenLastCalledWith(false); expect(controller.current.save()).toBe(true);
    await click('assets'); await click('synthetic.bin');
    expect(shadow().querySelector('.cf-file-title').textContent).toContain('assets/synthetic.bin');
    expect(service.projects.writeFile).not.toHaveBeenCalled();
    await click('eleckoi.frontend.json');
    expect(shadow().querySelector('.cf-source').textContent).toContain('manifestVersion');
    expect(service.projects.readFile).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), {path:'eleckoi.frontend.json'});
  });
  it('imports a complete role page and immediately enables the newly imported package', async () => {
    state.selectedProjectId = 'synthetic-role-project';
    await render(<CharacterFrontendPanel characterId={characterId} />);
    const input = shadow().querySelector('input[accept=".html,.htm,.zip"]');
    const bytes = new TextEncoder().encode(html);
    Object.defineProperty(input, 'files', { value: [{ name: 'synthetic-page.html', arrayBuffer: async () => bytes.buffer }] });
    await act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(service.projects.importProject).toHaveBeenCalledWith({ scope: 'character', characterId }, expect.objectContaining({
      select:true, filename:'synthetic-page.html', data:btoa(html),
      manifest:{manifestVersion:1,sdkVersion:'0.1.0',scope:'character',entryFile:'index.html',bindings:[{target:'root',view:'chat',entryFile:'index.html'}]},
    }));
    expect(state.selectedProjectId).toBe('synthetic-new-project');
    expect(service.projects.select).not.toHaveBeenCalled();
    expect(shadow().querySelector('[aria-label="切换前端包"]').textContent).toBe('synthetic-page');
    expect([...shadow().querySelectorAll('button')].some(button => button.textContent === '使用此前端')).toBe(false);
    expect(service.projects.select).not.toHaveBeenCalled();
  });
  it('imports a ZIP as a package without imposing an HTML manifest or exposing file upload controls', async () => {
    await render(<CharacterFrontendPanel characterId={characterId} />);
    const input=shadow().querySelector('input[type=file]');
    Object.defineProperty(input,'files',{value:[{name:'synthetic-package.zip',arrayBuffer:async()=>Uint8Array.of(1,2,3).buffer}]});
    await act(()=>input.dispatchEvent(new Event('change',{bubbles:true})));
    expect(service.projects.importProject).toHaveBeenCalledWith({scope:'character',characterId},{select:true,filename:'synthetic-package.zip',name:'synthetic-package',data:'AQID'});
    expect(shadow().querySelectorAll('input[type=file]')).toHaveLength(1);
  });
  it('exports the browsed package using the upward export icon and preserves the active selection', async () => {
    state.projects.push({...sample(),id:'synthetic-other-project',name:'Synthetic other project'});
    state.selectedProjectId=state.projects[0].id;
    service.projects.exportProject=vi.fn(async(input,id)=>({ok:true,value:{filename:id+'.zip',data:'AQID'}}));
    const saveBytes=vi.fn(); vi.stubGlobal('ElecKoiPlatform',{saveBytes});
    await render(<CharacterFrontendPanel characterId={characterId}/>);
    await choosePackage('Synthetic other project');
    await click('前端包更多操作');
    const menu=document.querySelector('[role=menu]');
    const expected=document.createElement('div'); expected.innerHTML=renderToStaticMarkup(<ExportIcon size={16}/>);
    const button=[...menu.querySelectorAll('button')].find(button=>button.textContent==='导出前端包');
    expect(button.querySelector('svg').innerHTML).toBe(expected.querySelector('svg').innerHTML);
    await act(()=>button.click());
    expect(service.projects.exportProject).toHaveBeenCalledWith({scope:'character',characterId},'synthetic-other-project');
    expect(saveBytes).toHaveBeenCalledWith('synthetic-other-project.zip',Uint8Array.of(1,2,3),'application/zip');
    expect(state.selectedProjectId).toBe('synthetic-role-project');
  });
  it('renames and removes the chosen package, using a confirmation and keeping the other package', async () => {
    vi.useFakeTimers();
    state.projects.push({...sample(),id:'synthetic-other-project',name:'Synthetic other project'});
    service.projects.updateProject=vi.fn(async(input,id,patch)=>{Object.assign(state.projects.find(p=>p.id===id),patch);state.revision++;watchers.forEach(fn=>fn(value()));return {ok:true,value:value()};});
    service.projects.delete=vi.fn(async(input,id)=>{state.projects=state.projects.filter(p=>p.id!==id);state.revision++;watchers.forEach(fn=>fn(value()));return {ok:true,value:value()};});
    await render(<CharacterFrontendPanel characterId={characterId}/>);
    await choosePackage('Synthetic other project'); await menuAction('重命名');
    const input=shadow().querySelector('[role=dialog] input');
    await act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Synthetic renamed');input.dispatchEvent(new Event('input',{bubbles:true}));});
    await click('保存',shadow().querySelector('[role=dialog]')); await act(async()=>vi.advanceTimersByTimeAsync(180));
    expect(service.projects.updateProject).toHaveBeenCalledWith({scope:'character',characterId},'synthetic-other-project',{name:'Synthetic renamed'});
    await menuAction('移除前端包'); expect(service.projects.delete).not.toHaveBeenCalled();
    await click('移除',shadow().querySelector('[role=dialog]')); await act(async()=>vi.advanceTimersByTimeAsync(180));
    expect(service.projects.delete).toHaveBeenCalledWith({scope:'character',characterId},'synthetic-other-project');
    expect(state.projects.map(p=>p.id)).toEqual(['synthetic-role-project']);
  });
  it('retains the chosen package and file across preview, and releases the actual preview on return', async () => {
    state.projects.push({...sample(),id:'synthetic-other-project',name:'Synthetic other project'});
    await render(<CharacterFrontendPanel characterId={characterId}/>);
    await choosePackage('Synthetic other project'); await click('main.html'); await click('预览');
    const frame=shadow().querySelector('iframe'); expect(frame).toBeTruthy();
    await act(()=>frame.dispatchEvent(new Event('load')));
    expect(runtime.mountProjectDocument).toHaveBeenCalledWith(frame.contentWindow, expect.objectContaining({projectId:'synthetic-other-project',characterId,view:'chat'}));
    await click('文件'); expect(stopPage).toHaveBeenCalledOnce();
    expect(shadow().querySelector('.cf-file-title').textContent).toContain('pages/main.html');
    expect(shadow().querySelector('[aria-label="切换前端包"]').textContent).toBe('Synthetic other project');
    expect(shadow().querySelector('iframe')).toBeNull();
  });
  it('restores the default chat without removing imported packages', async () => {
    state.selectedProjectId=state.projects[0].id;
    await render(<CharacterFrontendPanel characterId={characterId}/>); await menuAction('使用默认界面');
    expect(service.projects.restoreDefault).toHaveBeenCalledWith({scope:'character',characterId});
    expect(state.selectedProjectId).toBeNull(); expect(state.projects).toHaveLength(1); expect(files.get('pages/main.html')).toBe(html);
  });
  it('ignores late file reads after switching packages and releases the old owner on character changes', async () => {
    let finish;
    service.projects.readFile.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    state.projects.push({...sample(),id:'synthetic-other-project',name:'Synthetic other project'});
    await render(<CharacterFrontendPanel characterId={characterId}/>); await choosePackage('Synthetic other project');
    await act(()=>finish({ok:true,value:{content:'obsolete package source'}}));
    expect(shadow().textContent).not.toContain('obsolete package source'); expect(shadow().textContent).toContain(html);
    await render(<CharacterFrontendPanel characterId="synthetic-next-character"/>);
    expect(stopWatch).toHaveBeenCalled(); expect(shadow().textContent).not.toContain(html);
    expect(shadow().querySelectorAll('[aria-label="导入前端包"]')).toHaveLength(1);
    expect(shadow().querySelector('[aria-label="切换前端包"]')).toBeNull();
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

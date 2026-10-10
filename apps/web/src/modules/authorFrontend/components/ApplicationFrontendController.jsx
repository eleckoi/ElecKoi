import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Code, ArrowCounterClockwise, X, PuzzlePiece } from '@phosphor-icons/react';
import { useApplicationFrontendWorkspace } from '../hooks/useApplicationFrontendWorkspace.js';
import { collectFrontendTargets, validateFrontendBindings, installFrontendBindings, frontendAssetUrl } from '../model/applicationFrontendTargets.js';
import { AdvancedFrontendFrame } from './AdvancedFrontendFrame.jsx';
import { ApplicationFrontendWorkbench } from './ApplicationFrontendWorkbench.jsx';
import { registerOverlayBack } from '../../../ui/hooks/overlayBack.js';
import { mountAuthoredMessageContent } from '../model/authoredMessageContent.js';
import workbenchStyles from '../styles/applicationFrontend.css?inline';

const ownerContext = owner => Object.fromEntries(Object.entries(owner || {}).filter(([key, value]) =>
  ['characterId', 'conversationId', 'projectId', 'section', 'pageId', 'messageId', 'presetId'].includes(key) && (value == null || ['string', 'number', 'boolean'].includes(typeof value))));
const resolvedTheme = () => ['light', 'dark'].includes(document.documentElement.dataset.theme)
  ? document.documentElement.dataset.theme : document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';

/** Stays inside the original DSH root while its selected UI subtree changes. */
export function ApplicationFrontendController({ slots, subscribeSlots, navigation, children }) {
  const workspaceState = useApplicationFrontendWorkspace();
  const { workspace, runtime, error, loaded, request } = workspaceState;
  const [targets, setTargets] = useState([]), [failure, setFailure] = useState(''), [open, setOpen] = useState(false);
  const [previewId, setPreviewId] = useState(null), [previewing, setPreviewing] = useState(false), [pluginsOpen, setPluginsOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [seat, setSeat] = useState(null), surface = useRef(null);
  const view = new URLSearchParams(window.location.search).get('view') || 'main';
  const selectedId = previewing ? previewId : workspace.selectedProjectId;
  const project = workspace.projects.find(item => item.id === selectedId);
  useEffect(() => {
    if (!runtime) return;
    const render = (view, container, options) => mountAuthoredMessageContent(runtime, view, container, options);
    runtime.renderMessageContent = render;
    return () => { if (runtime.renderMessageContent === render) runtime.renderMessageContent = null; };
  }, [runtime]);
  useEffect(() => {
    if (!slots) return;
    let signature = '', scheduled = false, active = true;
    const publish = () => {
      scheduled = false; if (!active) return;
      const next = collectFrontendTargets(slots), serialized = JSON.stringify(next);
      if (serialized !== signature) { signature = serialized; setTargets(next); runtime?.registerFrontendTargets(next); }
    };
    publish();
    const stop = subscribeSlots(() => { if (!scheduled) { scheduled = true; queueMicrotask(publish); } });
    return () => { active = false; stop(); };
  }, [slots, subscribeSlots, runtime]);
  const selection = useMemo(() => {
    try { return { bindings: validateFrontendBindings(project, targets, view), error: '' }; }
    catch (reason) { return { bindings: [], error: reason.message }; }
  }, [project, targets, view]);
  useEffect(() => { setFailure(''); }, [selectedId, workspace.revision]);
  useEffect(() => {
    if (!project || !slots || !runtime || selection.error) return;
    try {
      return installFrontendBindings(slots, selection.bindings, (binding, owner) => <AdvancedFrontendFrame
        project={project} runtime={runtime} request={request} entryFile={binding.entryFile} revision={workspace.revision}
        context={{ binding, view, owner: ownerContext(owner), preview: previewing }} onError={setFailure} />);
    } catch (reason) { setFailure(`${project.name}: ${reason.message}`); }
  }, [project, slots, runtime, selection, request, workspace.revision, view, previewing]);
  useEffect(() => {
    if (!project || selection.error) return;
    const links = (project.manifest?.globalStyles || []).map(path => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = frontendAssetUrl(project, path, workspace.revision);
      link.dataset.eleckoiApplicationStyle = project.id;
      link.onerror = () => setFailure(`${project.name} · ${path}: 全局样式加载失败`);
      document.head.append(link); return link;
    });
    return () => links.forEach(link => link.remove());
  }, [project, selection.error, workspace.revision]);
  useEffect(() => {
    if (!runtime) return;
    runtime.connectNavigation({ registerBackHandler: registerOverlayBack,
      back: () => window.dispatchEvent(new Event('eleckoi:platform-back', { cancelable: true })),
      openWindow: target => {
        const url = new URL(window.location.href); url.searchParams.set('view', target.view);
        if (target.characterId) url.searchParams.set('character', target.characterId);
        if (target.conversationId) url.searchParams.set('conversation', target.conversationId);
        window.open(url.toString(), `eleckoi-${target.view}`, 'width=1280,height=900');
      } });
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(probe);
    const update = () => {
      const rect = surface.current?.getBoundingClientRect(), computed = getComputedStyle(probe);
      runtime.setEnvironment({ view, viewport: { width: window.innerWidth, height: window.innerHeight },
        container: rect ? { width: rect.width, height: rect.height } : null,
        theme: resolvedTheme(),
        safeArea: { top: parseFloat(computed.paddingTop), right: parseFloat(computed.paddingRight), bottom: parseFloat(computed.paddingBottom), left: parseFloat(computed.paddingLeft) } });
    };
    const resize = new ResizeObserver(update); if (surface.current) resize.observe(surface.current);
    const theme = new MutationObserver(update); theme.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', update); update();
    return () => { resize.disconnect(); theme.disconnect(); probe.remove(); window.removeEventListener('resize', update); };
  }, [runtime, view]);
  useEffect(() => {
    const host = document.createElement('div'); host.dataset.eleckoiFrontendRecovery = '';
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;visibility:visible!important;opacity:1!important';
    const syncTheme = () => host.style.setProperty('color-scheme', resolvedTheme(), 'important');
    syncTheme();
    const theme = new MutationObserver(syncTheme);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    theme.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    const shadow = host.attachShadow({ mode: 'open' }); document.documentElement.append(host); setSeat(shadow);
    const show = () => setOpen(true);
    const shortcut = event => { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); setOpen(true); } };
    window.addEventListener('eleckoi:frontend-workbench', show); window.addEventListener('keydown', shortcut, true);
    return () => { theme.disconnect(); host.remove(); window.removeEventListener('eleckoi:frontend-workbench', show); window.removeEventListener('keydown', shortcut, true); };
  }, []);
  useEffect(() => open ? registerOverlayBack(() => { setOpen(false); return true; }, window, 1000) : undefined, [open]);
  const restore = async () => { try { await request('frontends.restoreDefault'); setPreviewing(false); setFailure(''); } catch (reason) { setFailure(reason.message); } };
  const root = selection.bindings.find(binding => binding.target === 'root');
  const problem = error || selection.error || failure;
  const pageIds = selection.bindings.filter(binding => binding.target === 'page' || binding.slot === 'main').map(binding => binding.pageId || binding.entryKey);
  return <><div ref={surface} style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }} data-application-frontend={project?.id || 'default'}>
    {problem && <div className="frontend-state" role="alert">{problem}</div>}
    {root && loaded && !problem ? <AdvancedFrontendFrame project={project} runtime={runtime} request={request} entryFile={root.entryFile} revision={workspace.revision} context={{ binding: root, view, preview: previewing }} onError={setFailure} />
      : children({ ...navigation, frontendPageIds: pageIds })}
  </div>{seat && createPortal(<><style>{workbenchStyles}</style><div className="af-host">
    {(project || problem || previewing) && <div className="af-recovery-edge" aria-label="应用前端控制">
      <button className="af-recovery-toggle" aria-label="前端快捷操作" title="应用前端控制" aria-expanded={recoveryOpen} onClick={() => { setRecoveryOpen(!recoveryOpen); setPluginsOpen(false); }}><Code size={20} /></button>
      {recoveryOpen && <div className="af-recovery">
      {previewing && <button onClick={() => { setPreviewing(false); setOpen(true); }}><X size={15} />退出预览</button>}
      {(project || problem) && <button onClick={restore}><ArrowCounterClockwise size={15} />恢复默认</button>}
      {root && <button aria-label="插件界面" onClick={() => setPluginsOpen(!pluginsOpen)}><PuzzlePiece size={17} /></button>}
      <button title="应用前端 · Ctrl+Shift+F" aria-label="应用前端工作台" onClick={() => { setOpen(true); setRecoveryOpen(false); }}><Code size={18} />工作台</button>
    </div>}</div>}
    {pluginsOpen && <div className="af-plugin-menu">{(workspaceState.status && runtime?.getSnapshot().uiEntries || []).map(entry => <button key={`${entry.pluginId}:${entry.id}`} onClick={() => runtime.openPanel(entry.pluginId, entry.id).catch(reason => setFailure(reason.message))}>{entry.title || entry.label || entry.id}</button>)}</div>}
    {open && <ApplicationFrontendWorkbench {...workspaceState} targets={targets} onClose={() => setOpen(false)} onRestore={restore}
      onPreview={id => { setPreviewId(id); setPreviewing(true); setOpen(false); }} />}
  </div></>, seat)}</>;
}

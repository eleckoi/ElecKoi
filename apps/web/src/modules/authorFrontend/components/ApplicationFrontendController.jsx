import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Code, ArrowCounterClockwise, X } from '@phosphor-icons/react';
import { useApplicationFrontendWorkspace } from '../hooks/useApplicationFrontendWorkspace.js';
import { collectFrontendTargets, validateFrontendBindings, installFrontendBindings, frontendAssetUrl } from '../model/applicationFrontendTargets.js';
import { AdvancedFrontendFrame } from './AdvancedFrontendFrame.jsx';
import { FrontendWorkbench } from './FrontendWorkbench.jsx';
import { registerOverlayBack } from '../../../ui/hooks/overlayBack.js';
import workbenchStyles from '../styles/applicationFrontend.css?inline';
import { useHtmlResources } from '../../../ui/hooks/useHtmlResources.js';
import { resolveFailure } from '../../../utils/failureText.js';

const ownerContext = owner => Object.fromEntries(Object.entries(owner || {}).filter(([key, value]) =>
  ['characterId', 'conversationId', 'projectId', 'section', 'pageId', 'messageId', 'presetId'].includes(key) && (value == null || ['string', 'number', 'boolean'].includes(typeof value))));
const resolvedTheme = () => ['light', 'dark'].includes(document.documentElement.dataset.theme)
  ? document.documentElement.dataset.theme : document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';

/** Stays inside the original DSH root while its selected UI subtree changes. */
export function ApplicationFrontendController({ slots, subscribeSlots, navigation, children }) {
  const tUi = useProductTranslation();
  const workspaceState = useApplicationFrontendWorkspace();
  const { workspace, error, loaded, request } = workspaceState;
  const { runtime } = useHtmlResources();
  const [targets, setTargets] = useState([]), [failure, setFailure] = useState(''), [open, setOpen] = useState(false);
  const [previewId, setPreviewId] = useState(null), [previewing, setPreviewing] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [seat, setSeat] = useState(null), surface = useRef(null);
  const view = new URLSearchParams(window.location.search).get('view') || 'main';
  const selectedId = previewing ? previewId : workspace.selectedProjectId;
  const project = workspace.projects.find(item => item.id === selectedId);
  useEffect(() => {
    if (!slots) return;
    let signature = '', scheduled = false, active = true;
    const publish = () => {
      scheduled = false; if (!active) return;
      const next = collectFrontendTargets(slots), serialized = JSON.stringify(next);
      if (serialized !== signature) { signature = serialized; setTargets(next); }
    };
    publish();
    const stop = subscribeSlots(() => { if (!scheduled) { scheduled = true; queueMicrotask(publish); } });
    return () => { active = false; stop(); };
  }, [slots, subscribeSlots]);
  const selection = useMemo(() => {
    try { return { bindings: validateFrontendBindings(project, targets, view), error: '' }; }
    catch (reason) { return { bindings: [], error: resolveFailure(reason, { fallback: tUi("前端绑定校验失败") }).text }; }
  }, [project, targets, view, tUi]);
  useEffect(() => { setFailure(''); }, [selectedId, workspace.revision]);
  useEffect(() => {
    if (!project || !slots || selection.error) return;
    try {
      return installFrontendBindings(slots, selection.bindings, (binding, owner) => <AdvancedFrontendFrame
        project={project} runtime={runtime} request={request} entryFile={binding.entryFile} revision={workspace.revision}
        context={{ binding, view, owner: ownerContext(owner), preview: previewing }} onError={setFailure} />);
    } catch (reason) { setFailure(`${project.name}: ${resolveFailure(reason, { fallback: tUi("前端页面加载失败") }).text}`); }
  }, [project, slots, runtime, selection, request, workspace.revision, view, previewing]);
  useEffect(() => {
    if (!project || selection.error) return;
    const links = (project.manifest?.globalStyles || []).map(path => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = frontendAssetUrl(project, path, workspace.revision);
      link.dataset.eleckoiApplicationStyle = project.id;
      link.onerror = () => setFailure(tUi("{value0} · {value1}: 全局样式加载失败", {value0: project.name, value1: path}));
      document.head.append(link); return link;
    });
    return () => links.forEach(link => link.remove());
  }, [project, selection.error, workspace.revision]);
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
  const restore = async () => { try { await request('frontends.restoreDefault'); setPreviewing(false); setFailure(''); } catch (reason) { setFailure(resolveFailure(reason, { fallback: tUi("恢复默认前端失败") }).text); } };
  const root = selection.bindings.find(binding => binding.target === 'root');
  const problem = error || selection.error || failure;
  const pageIds = selection.bindings.filter(binding => binding.target === 'page' || binding.slot === 'main').map(binding => binding.pageId || binding.entryKey);
  return <><div ref={surface} style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }} data-application-frontend={project?.id || 'default'}>
    {problem && <div className="frontend-state" role="alert">{problem}</div>}
    {root && loaded && !problem ? <AdvancedFrontendFrame project={project} runtime={runtime} request={request} entryFile={root.entryFile} revision={workspace.revision} context={{ binding: root, view, preview: previewing }} onError={setFailure} />
      : children({ ...navigation, frontendPageIds: pageIds })}
  </div>{seat && createPortal(<><style>{workbenchStyles}</style><div className="af-host">
    {(project || problem || previewing) && <div className="af-recovery-edge" aria-label={tUi("应用前端控制")}>
      <button className="af-recovery-toggle" aria-label={tUi("前端快捷操作")} title={tUi("应用前端控制")} aria-expanded={recoveryOpen} onClick={() => setRecoveryOpen(!recoveryOpen)}><Code size={20} /></button>
      {recoveryOpen && <div className="af-recovery">
      {previewing && <button onClick={() => { setPreviewing(false); setOpen(true); }}><X size={15} />{tUi("退出预览")}</button>}
      {(project || problem) && <button onClick={restore}><ArrowCounterClockwise size={15} />{tUi("恢复默认")}</button>}
      <button title={tUi("应用前端 · Ctrl+Shift+F")} aria-label={tUi("应用前端工作台")} onClick={() => { setOpen(true); setRecoveryOpen(false); }}><Code size={18} />{tUi("工作台")}</button>
    </div>}</div>}
    {open && <FrontendWorkbench {...workspaceState} targets={targets} onClose={() => setOpen(false)} onRestore={restore}
      onPreview={id => { setPreviewId(id); setPreviewing(true); setOpen(false); }} />}
  </div></>, seat)}</>;
}

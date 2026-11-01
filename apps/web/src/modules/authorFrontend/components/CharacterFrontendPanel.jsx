import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { useFrontendWorkspace } from '../hooks/useFrontendWorkspace.js';
import { characterFrontendEntry } from '../model/characterFrontend.js';
import { FrontendWorkbench } from './FrontendWorkbench.jsx';
import { AdvancedFrontendFrame } from './AdvancedFrontendFrame.jsx';
import workbenchStyles from '../styles/applicationFrontend.css?inline';
import '../styles/characterFrontend.css';
import { resolveFailure } from '../../../utils/failureText.js';

const targets = [{ target: 'root', view: 'chat' }];

export const CharacterFrontendPanel = forwardRef(function CharacterFrontendPanel({ characterId, onDirtyChange }, ref) {
  const state = useFrontendWorkspace(characterId), { workspace, status, request } = state;
  const host = useRef(null), workbench = useRef(null);
  const [seat, setSeat] = useState(null), [previewId, setPreviewId] = useState(null), [error, setError] = useState('');
  useImperativeHandle(ref, () => ({ save: () => workbench.current?.save() ?? true, discard: () => workbench.current?.discard() }));
  useEffect(() => {
    const shadow = host.current.shadowRoot || host.current.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = workbenchStyles; shadow.append(style); setSeat(shadow);
    return () => style.remove();
  }, []);
  const preview = workspace.projects.find(item => item.id === previewId);
  let previewEntry, previewError;
  if (preview) {
    try { previewEntry = characterFrontendEntry(preview, characterId); }
    catch (reason) { previewError = resolveFailure(reason, { fallback: '预览前端项目失败' }).text; }
  }
  const startPreview = id => {
    try { characterFrontendEntry(workspace.projects.find(item => item.id === id), characterId); setError(''); setPreviewId(id); }
    catch (reason) { setError(resolveFailure(reason, { fallback: '预览前端项目失败' }).text); }
  };
  const restore = async () => {
    try { await request('frontends.restoreDefault'); setError(''); }
    catch (reason) { setError(resolveFailure(reason, { fallback: '恢复默认前端失败' }).text); }
  };
  return <div ref={host} className="character-frontend-editor">{seat && createPortal(<div className="af-host af-inline-host">
    {status === 'unavailable' ? <div className="af-empty" role="alert">原生前端插件未启用</div>
      : status === 'loading' ? <div className="af-empty" role="status">正在读取前端项目…</div>
      : <><div className="af-inline-editor" hidden={Boolean(preview)}><FrontendWorkbench key={characterId} ref={workbench} {...state} embedded targets={targets} error={error || state.error}
        onDirtyChange={onDirtyChange} onPreview={startPreview} onRestore={restore} /></div>
      {preview && <section className="af-role-preview">
        <header><Button data-dsh-control variant="outline" onClick={() => setPreviewId(null)}><ArrowLeft size={18} />返回文件</Button><strong>{preview.name}</strong></header>
        {previewError ? <div role="alert">{previewError}</div> : <AdvancedFrontendFrame nativeOnly project={preview} request={request} entryFile={previewEntry} revision={workspace.revision}
          context={{ view: 'chat', preview: true, binding: { target: 'root' }, owner: { characterId } }} />}
      </section>}</>}
  </div>, seat)}</div>;
});

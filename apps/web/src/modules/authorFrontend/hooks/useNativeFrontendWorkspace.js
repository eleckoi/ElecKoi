import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNativeFrontendServices } from './NativeFrontendContext.jsx';
import { requestNativeFrontend } from '../model/nativeFrontendRequest.js';
import { resolveFailure } from '../../../utils/failureText.js';

export function useNativeFrontendWorkspace(scope, characterId) {
  const tUi = useProductTranslation();
  const { service, authorRuntime } = useNativeFrontendServices();
  const owner = useMemo(() => scope === 'application' ? { scope } : { scope, characterId }, [scope, characterId]);
  const empty = useMemo(() => ({ ...owner, projects: [], selectedProjectId: null, activeBindings: [], messageRendererEnabled: true, revision: 0 }), [owner]);
  const [snapshot, setSnapshot] = useState({ owner, service, workspace: empty, error: '', loaded: false });
  const identity = useRef(null);
  identity.current = { owner, service };
  const accepts = useCallback(() => identity.current?.owner === owner && identity.current?.service === service, [owner, service]);
  const publish = useCallback(workspace => {
    if (!accepts()) return;
    setSnapshot(current => current.owner === owner && current.service === service && current.workspace.revision > workspace.revision
      ? current : { owner, service, workspace, error: '', loaded: true });
  }, [owner, service, accepts]);
  const request = useCallback(async (method, params = {}) => {
    let result;
    try { result = await requestNativeFrontend(service, owner, method, params); }
    catch (reason) {
      if (accepts() && reason.code === 'FRONTEND_COMMITTED_CLEANUP_FAILED') publish(await requestNativeFrontend(service, owner, 'frontends.workspace'));
      throw reason;
    }
    if (result?.scope === owner.scope && Array.isArray(result.projects)) publish(result);
    return result;
  }, [owner, service, accepts, publish]);
  useEffect(() => {
    let mounted = true;
    identity.current = { owner, service };
    setSnapshot({ owner, service, workspace: empty, error: '', loaded: false });
    if (!service || scope === 'character' && !characterId) return;
    const fail = reason => { if (mounted && accepts()) setSnapshot(current => ({ ...current, error: resolveFailure(reason, { fallback: tUi("读取前端项目失败") }).text })); };
    const close = () => { mounted = false; if (accepts()) identity.current = null; };
    try { const stop = service.watch(owner, workspace => { if (mounted) publish(workspace); }, fail); return () => { close(); stop(); }; }
    catch (reason) { fail(reason); }
    return close;
  }, [owner, service, scope, characterId, empty, accepts, publish]);
  const current = snapshot.owner === owner && snapshot.service === service ? snapshot : { workspace: empty, error: '', loaded: false };
  return { ...current, authorRuntime, request, status: !service ? 'unavailable' : current.error ? 'error' : current.loaded ? 'ready' : 'loading' };
}

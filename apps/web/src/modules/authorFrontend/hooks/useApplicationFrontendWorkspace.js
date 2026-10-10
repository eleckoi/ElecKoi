import { useCallback, useEffect, useState } from 'react';
import { useSharedFrontendRuntime } from '../../../ui/hooks/useSharedFrontendRuntime.js';
const empty = { scope: 'application', projects: [], selectedProjectId: null, activeBindings: [], revision: 0 };

export function useApplicationFrontendWorkspace() {
  const { runtime, state } = useSharedFrontendRuntime();
  const [workspace, setWorkspace] = useState(empty), [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  const request = useCallback(async (method, params = {}) => {
    if (!runtime?.adapter) throw new Error('应用前端服务尚未连接');
    let result;
    try { result = await runtime.adapter.request(method, { ...params, scope: 'application' }); }
    catch (reason) {
      if (reason.code === 'FRONTEND_COMMITTED_CLEANUP_FAILED' || String(reason.message).includes('FRONTEND_COMMITTED_CLEANUP_FAILED')) {
        const fresh = await runtime.adapter.request('frontends.workspace', { scope: 'application' }); setWorkspace(fresh);
      }
      throw reason;
    }
    if (result?.scope === 'application' && Array.isArray(result.projects)) { setWorkspace(result); setLoaded(true); setError(''); }
    return result;
  }, [runtime]);
  useEffect(() => {
    if (!runtime?.adapter || !['ready', 'ready-global', 'waiting-for-chat'].includes(state.status)) return;
    let active = true;
    const stop = runtime.adapter.on('frontends.changed', payload => {
      if (active && payload.scope === 'application') { setWorkspace(current => current.revision > payload.workspace.revision ? current : payload.workspace); setLoaded(true); setError(''); }
    });
    runtime.adapter.request('frontends.workspace', { scope: 'application' }).then(value => {
      if (active) { setWorkspace(current => current.revision > value.revision ? current : value); setLoaded(true); setError(''); }
    }, failure => { if (active) setError(failure.message || String(failure)); });
    return () => { active = false; stop(); };
  }, [runtime, state.status]);
  return { workspace, runtime, status: state.status, error, loaded, request };
}

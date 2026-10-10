import { useCallback, useEffect, useState } from 'react';
import { useSharedFrontendRuntime } from '../../../ui/hooks/useSharedFrontendRuntime.js';

const empty = { projects: [], selectedProjectId: null, messageRendererEnabled: true };
export function useFrontendWorkspace(characterId) {
  const { runtime, state } = useSharedFrontendRuntime();
  const [workspace, setWorkspace] = useState(empty), [error, setError] = useState('');
  const request = useCallback(async (method, params = {}) => {
    if (!runtime?.adapter) throw new Error('共享前端服务尚未就绪');
    return runtime.adapter.request(method, { ...params, characterId });
  }, [characterId, runtime]);
  useEffect(() => {
    setWorkspace(empty); setError('');
  }, [characterId, runtime]);
  useEffect(() => {
    if (!characterId || state.status !== 'ready') return undefined;
    let mounted = true;
    request('frontends.workspace').then(result => { if (mounted) setWorkspace(result); })
      .catch(failure => { if (mounted) setError(failure.message || String(failure)); });
    const stop = runtime.adapter.on('frontends.changed', payload => {
      if (payload.characterId === characterId && mounted) setWorkspace(payload.workspace);
    });
    return () => { mounted = false; stop(); };
  }, [characterId, request, runtime, state.status]);
  return { workspace, error, runtime, request, status: state.status, uiEntries: state.uiEntries || [] };
}

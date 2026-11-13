import { DesktopError } from '@shared/foundation/DesktopError';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNativeFrontendServices } from '../authorFrontend/index.js';
import { resolveFailure } from '../../utils/failureText.js';
import { characterAssetBaseUrl } from '@shared/foundation/characterAssetReference';

export function useCharacterAssets(characterId) {
  const tUi = useProductTranslation();
  const { service } = useNativeFrontendServices();
  const [state, setState] = useState({ characterId, items: [], loading: true, error: '' });
  const [progress, setProgress] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [canReveal, setCanReveal] = useState(false);
  const lifetime = useRef(null), busy = useRef(false), uploadTicket = useRef(null);
  const publish = useCallback(catalog => {
    if (lifetime.current?.characterId !== characterId || lifetime.current?.service !== service) return;
    setState(old => old.characterId === characterId && old.revision > catalog.revision ? old : { ...catalog, loading: false, error: '' });
  }, [characterId, service]);
  useEffect(() => {
    const owner = { characterId, service }; lifetime.current = owner;
    setCanReveal(false);
    setState(old => old.characterId === characterId ? { ...old, loading: true, error: '' } : { characterId, items: [], loading: true, error: '' });
    if (!service?.assets) { setState({ characterId, items: [], loading: false, error: tUi('资产服务尚未就绪。') }); return; }
    const stop = service.watchAssets(characterId, publish, cause => {
      if (lifetime.current === owner) setState(old => ({ ...old, loading: false, error: resolveFailure(cause, { fallback: tUi('读取资产失败') }).text }));
    });
    void service.assets.canReveal().then(result => {
      if (lifetime.current !== owner) return;
      if (!result.ok) throw result.error;
      setCanReveal(result.value);
    }).catch(cause => {
      if (lifetime.current === owner) setState(old => ({ ...old, error: resolveFailure(cause).text }));
    });
    return () => {
      stop(); if (lifetime.current === owner) lifetime.current = null;
      const upload = uploadTicket.current;
      if (upload?.characterId === characterId) { upload.cancelled = true; void service.assets.cancelUpload(characterId, upload.id).then(result => { if (!result.ok) console.error(result.error); }, console.error); }
    };
  }, [characterId, service, publish, attempt]);
  async function request(method, ...args) {
    const result = await service.assets[method](characterId, ...args);
    if (!result.ok) throw result.error;
    if (result.value?.items) publish(result.value);
    return result.value;
  }
  async function run(operation) {
    if (busy.current) return false;
    busy.current = true;
    try { return await operation(); } finally { busy.current = false; }
  }
  async function upload(files, folderId = null) {
    return run(async () => {
      const active = lifetime.current;
      const encode = async blob => {
        const bytes = new Uint8Array(await blob.arrayBuffer()); let text = '';
        for (let offset = 0; offset < bytes.length; offset += 32768) text += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        return btoa(text);
      };
      try {
        for (const file of files) {
          if (lifetime.current !== active) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'Upload page was closed', { what: '资产上传页面' });
          const ticket = await request('beginUpload', { name: file.name, size: file.size, folderId });
          const current = { characterId, id: ticket.id, cancelled: false }; uploadTicket.current = current;
          try {
            let offset = 0;
            while (offset < file.size) {
              if (lifetime.current !== active || current.cancelled) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'Upload was cancelled', { what: '资产上传' });
              setProgress({ name: file.name, loaded: offset, total: file.size });
              const data = await encode(file.slice(offset, offset + 1024 * 1024));
              const next = await request('appendUpload', ticket.id, offset, data); offset = next.offset;
            }
            if (lifetime.current !== active || current.cancelled) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'Upload was cancelled', { what: '资产上传' });
            await request('finishUpload', ticket.id);
          } catch (error) { await request('cancelUpload', ticket.id); throw error; }
          finally { if (uploadTicket.current === current) uploadTicket.current = null; }
        }
      } finally { if (lifetime.current === active) setProgress(null); }
    });
  }
  return { ...state, items: state.characterId === characterId ? state.items.map(item => ({ ...item, src: characterAssetBaseUrl(characterId) + item.id })) : [], folders: state.characterId === characterId ? state.folders || [] : [], progress, canReveal,
    upload, run, request, retry: () => setAttempt(value => value + 1) };
}

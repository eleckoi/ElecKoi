import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFrontendWorkspace } from '../hooks/useFrontendWorkspace.js';
import { CharacterFrontendPackages } from './CharacterFrontendPackages.jsx';
import panelStyles from '../styles/characterFrontendPanel.css?inline';
import '../styles/characterFrontend.css';

/** Package operations commit independently; the browser has no source-editing draft. */
export const CharacterFrontendPanel = forwardRef(function CharacterFrontendPanel({ characterId, onDirtyChange }, ref) {
  const state = useFrontendWorkspace(characterId);
  const host = useRef(null);
  const [seat, setSeat] = useState(null);
  useImperativeHandle(ref, () => ({ save: () => true, discard: () => {} }), []);
  useEffect(() => { onDirtyChange?.(false); }, [characterId, onDirtyChange]);
  useEffect(() => {
    const shadow = host.current.shadowRoot || host.current.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = panelStyles; shadow.append(style); setSeat(shadow);
    return () => style.remove();
  }, []);
  return <div ref={host} className="character-frontend-editor">{seat && createPortal(
    <CharacterFrontendPackages key={characterId} characterId={characterId} {...state} />, seat)}</div>;
});

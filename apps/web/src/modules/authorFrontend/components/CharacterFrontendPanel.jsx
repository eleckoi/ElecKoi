import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { useFrontendWorkspace } from '../hooks/useFrontendWorkspace.js';
import { CharacterFrontendPackages } from './CharacterFrontendPackages.jsx';
import '../styles/characterFrontendPanel.css';
import '../styles/characterFrontend.css';

/** Package operations commit independently; the browser has no source-editing draft. */
export const CharacterFrontendPanel = forwardRef(function CharacterFrontendPanel({ characterId, onDirtyChange }, ref) {
  const state = useFrontendWorkspace(characterId);
  useImperativeHandle(ref, () => ({ save: () => true, discard: () => {} }), []);
  useEffect(() => { onDirtyChange?.(false); }, [characterId, onDirtyChange]);
  // Product controls and body portals share one tree for official anchors and focus.
  // Authored frontend documents remain isolated by AdvancedFrontendFrame.
  return <div className="character-frontend-editor">
    <CharacterFrontendPackages key={characterId} characterId={characterId} {...state} />
  </div>;
});

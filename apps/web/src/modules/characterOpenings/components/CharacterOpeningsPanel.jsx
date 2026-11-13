import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { OpeningWorkspace } from './OpeningWorkspace.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
import { ConfirmationDialog, SaveControl } from '../../settingLibraries/index.js';
import { deleteOpening } from '../model/openingEditing.js';
import { useCharacterConfigurationDraft } from '../../../ui/hooks/useCharacterConfigurationDraft.js';
import { resolveFailure } from '../../../utils/failureText.js';

export const CharacterOpeningsPanel = forwardRef(function CharacterOpeningsPanel({ characterId, openings, variables, onDirtyChange }, ref) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const { library, persisted, dirty, saving, error, saveNotice, changeLibrary, save, discard } = useCharacterConfigurationDraft({
    characterId, configuration: openings, onDirtyChange, label: tUi("开场白"),
  });
  const [variableSnapshot, setVariableSnapshot] = useState({ value: null, error: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [query, setQuery] = useState('');
  const openingEditorRef = useRef(null);
  const entry = library;

  useImperativeHandle(ref, () => ({ save, discard }), [library, persisted, saving]);
  useEffect(() => { setDeleteTarget(null); setQuery(''); }, [characterId]);
  useEffect(() => {
    let active = true;
    setVariableSnapshot({ value: null, error: '' });
    if (!variables) return undefined;
    const adopt = snapshot => { if (active) setVariableSnapshot(snapshot); };
    adopt(variables.getSnapshot(characterId));
    const stop = variables.subscribe((kind, id, snapshot) => {
      if (kind === 'configuration' && id === characterId) adopt(snapshot);
    });
    void variables.read(characterId).catch(cause => {
      if (active) setVariableSnapshot(current => ({ ...current, error: resolveFailure(cause, { fallback: tUi("读取变量版本失败") }).text }));
    });
    return () => { active = false; stop(); };
  }, [characterId, variables]);

  function updateEntry(next) {
    changeLibrary(next);
  }

  const requestDelete = message => setDeleteTarget({ messageId: message.id,
    title: tUi("删除“{value0}”？", { value0: message.title || tUi("未命名开场白") }), message: tUi("这条开场白会在保存后移除。") });
  const confirmation = <ConfirmationDialog target={deleteTarget} confirmLabel={tUi("删除")} tone="destructive"
    onCancel={() => setDeleteTarget(null)} onConfirm={() => {
      updateEntry(deleteOpening(entry, deleteTarget.messageId)); setDeleteTarget(null);
    }} />;
  return <section className={`character-openings-panel${compact ? ' is-mobile-opening-workspace' : ' is-opening-workspace'}`} aria-label={tUi("开场白")} aria-busy={!entry && !error}>
    {entry ? <OpeningWorkspace ref={openingEditorRef} key={characterId} entry={entry} query={query} onQueryChange={setQuery}
      variableVersions={variableSnapshot.value?.versions || []} variableVersionsError={variableSnapshot.error}
      onChange={updateEntry} onRequestDelete={requestDelete} busy={saving} dirty={dirty}
      save={<SaveControl workspace title={tUi("保存（Ctrl/Command + S）")} dirty={dirty} error={error} notice={saveNotice} saving={saving} onSave={save} />} />
      : error && <p className="setting-library-loading" role="alert">{error}</p>}
    {confirmation}
  </section>;

});

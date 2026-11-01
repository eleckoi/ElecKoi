import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { OpeningEditor } from './OpeningEditor.jsx';
import { ConfirmationDialog, SaveControl } from '../../settingLibraries/index.js';
import { deleteOpening } from '../model/openingEditing.js';
import { useCharacterConfigurationDraft } from '../../../ui/hooks/useCharacterConfigurationDraft.js';
import { resolveFailure } from '../../../utils/failureText.js';
import { Plus } from '../../../ui/icons/interfaceIcons.jsx';
import '../../../ui/ui/editor-collection-controls.css';
import '../../../ui/ui/editor-collection-material.css';

export const CharacterOpeningsPanel = forwardRef(function CharacterOpeningsPanel({ characterId, openings, variables, onDirtyChange }, ref) {
  const { library, persisted, dirty, saving, error, saveNotice, changeLibrary, save, discard } = useCharacterConfigurationDraft({
    characterId, configuration: openings, onDirtyChange, label: '开场白',
  });
  const [variableSnapshot, setVariableSnapshot] = useState({ value: null, error: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const openingEditorRef = useRef(null);
  const entry = library;

  useImperativeHandle(ref, () => ({ save, discard }), [library, persisted, saving]);
  useEffect(() => setDeleteTarget(null), [characterId]);
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
      if (active) setVariableSnapshot(current => ({ ...current, error: resolveFailure(cause, { fallback: '读取变量版本失败' }).text }));
    });
    return () => { active = false; stop(); };
  }, [characterId, variables]);

  function updateEntry(next) {
    changeLibrary(next);
  }

  return (
    <section className="character-openings-panel" aria-label="开场白">
      <header className="character-openings-toolbar editor-collection-toolbar" aria-label="开场白操作">
        <div className="character-openings-actions editor-collection-actions">
          <Button data-dsh-control variant="primary" type="button" className="editor-collection-action" aria-label="新建开场白" disabled={!entry || saving}
            onClick={() => openingEditorRef.current?.createBackup()}><Plus size={16} aria-hidden="true" />新建</Button>
          <SaveControl dirty={dirty} error={error} notice={saveNotice} saving={saving} onSave={save} />
          {entry && <label className="character-openings-enabled">
            <span>启用</span>
            <button type="button" className="setting-library-tree-switch" role="switch" aria-label="启用开场白"
              aria-checked={entry.enabled} disabled={saving} onClick={() => updateEntry({ ...entry, enabled: !entry.enabled })}>
              <span aria-hidden="true" />
            </button>
          </label>}
        </div>
      </header>
      <div className="character-openings-content">
        {entry ? <OpeningEditor ref={openingEditorRef} key={characterId} entry={entry}
          variableVersions={variableSnapshot.value?.versions || []} variableVersionsError={variableSnapshot.error}
          onChange={updateEntry} onRequestDelete={message => setDeleteTarget({ messageId: message.id,
            title: `删除“${message.title || '未命名开场白'}”？`, message: '这条开场白会在保存后移除。' })} />
          : <p className="setting-library-loading" role={error || library ? 'alert' : 'status'}>{error || (library ? '开场白数据缺失，无法编辑。' : '正在读取…')}</p>}
      </div>
      <ConfirmationDialog target={deleteTarget} confirmLabel="删除" tone="destructive"
        onCancel={() => setDeleteTarget(null)} onConfirm={() => {
          updateEntry(deleteOpening(entry, deleteTarget.messageId));
          setDeleteTarget(null);
        }} />
    </section>
  );
});

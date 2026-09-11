import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChatCircleDots,
  DotsSixVertical,
  DotsThree,
  NotePencil,
  Plus,
  PushPin,
  Trash,
  UserCircle,
  Wrench,
} from '@phosphor-icons/react';
import {
  createPositionDraft,
  moveCustomPosition,
  positionManagementRows,
  removeCustomPosition,
  savePositionDraft,
} from '../model/customPositions.js';
import '../styles/custom-positions.css';

const fixedIcons = {
  instructions: PushPin,
  history: ChatCircleDots,
  'latest-user-input': UserCircle,
  'tool-flow': Wrench,
};

function PositionNameDialog({ draft, existing, onChange, onCancel, onSave }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  return <div className="setting-position-dialog-backdrop" role="presentation" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
  }} onMouseDown={(event) => {
    if (event.target === event.currentTarget) onCancel();
  }}>
    <form className="setting-position-dialog" role="dialog" aria-modal="true" aria-labelledby="position-dialog-title" onSubmit={(event) => {
      event.preventDefault();
      try { onSave(); } catch (cause) { setError(cause.message); inputRef.current?.focus(); }
    }}>
      <h3 id="position-dialog-title">{existing ? '重命名位置' : '新建位置'}</h3>
      <label><span>名称</span><input ref={inputRef} value={draft.name} maxLength={60} placeholder="例如：世界状态" aria-invalid={error ? true : undefined} onChange={(event) => { onChange({ ...draft, name: event.target.value }); setError(''); }} /></label>
      {error ? <p role="alert">{error}</p> : null}
      <footer><button type="button" className="setting-position-button" onClick={onCancel}>取消</button><button type="submit" className="setting-position-button is-primary">保存</button></footer>
    </form>
  </div>;
}

function DeletePositionDialog({ position, affected, onCancel, onConfirm }) {
  return <div className="setting-position-dialog-backdrop" role="presentation" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
  }} onMouseDown={(event) => {
    if (event.target === event.currentTarget) onCancel();
  }}>
    <section className="setting-position-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-position-title">
      <h3 id="delete-position-title">删除“{position.name}”？</h3>
      {affected ? <p>{affected} 条提示词会回到相邻的固定位置，正文不会删除。</p> : null}
      <footer><button type="button" className="setting-position-button" onClick={onCancel}>取消</button><button type="button" className="setting-position-button is-danger" onClick={onConfirm}>删除</button></footer>
    </section>
  </div>;
}

export function CustomPositionManager({ entry, positions, entries, onChange, onBack }) {
  const [draft, setDraft] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [draggingId, setDraggingId] = useState('');
  const addRef = useRef(null);
  const rows = useMemo(() => positionManagementRows(positions), [positions]);

  function edit(position = null) {
    const currentAnchor = positions.find((item) => item.id === entry?.promptPositionId)?.anchor || entry?.position;
    setDraft(createPositionDraft(positions, position, currentAnchor));
    setDeleting(null);
  }

  function saveDraft() {
    const exists = positions.some((position) => position.id === draft.id);
    const next = savePositionDraft(positions, entries, draft, exists ? '' : entry?.id);
    onChange(next.positions, next.entries);
    setDraft(null);
    requestAnimationFrame(() => addRef.current?.focus());
  }

  function moveTo(targetKey) {
    if (!draggingId) return;
    const currentRows = positionManagementRows(positions);
    const fromIndex = currentRows.findIndex((row) => row.key === 'custom:' + draggingId);
    const targetIndex = currentRows.findIndex((row) => row.key === targetKey);
    if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return;
    const next = moveCustomPosition(positions, entries, draggingId, targetKey, fromIndex < targetIndex);
    if (next.positions !== positions) onChange(next.positions, next.entries);
  }

  function moveByKeyboard(positionId, offset) {
    const currentRows = positionManagementRows(positions);
    const fromIndex = currentRows.findIndex((row) => row.key === 'custom:' + positionId);
    const target = currentRows[fromIndex + offset];
    if (!target) return;
    const next = moveCustomPosition(positions, entries, positionId, target.key, offset > 0);
    if (next.positions !== positions) onChange(next.positions, next.entries);
  }

  const affected = deleting ? entries.filter((item) => item.promptPositionId === deleting.id).length : 0;

  return <section className="setting-position-manager" aria-label="自定义位置" onKeyDown={(event) => {
    if (event.key === 'Escape' && !draft && !deleting) { event.preventDefault(); onBack(); }
  }}>
    <header className="setting-position-manager-header">
      <button type="button" className="setting-position-back" aria-label="返回插入配置" title="返回" onClick={onBack}><ArrowLeft size={18} /></button>
      <h2>自定义位置</h2>
      <button ref={addRef} type="button" className="setting-position-button" onClick={() => edit()}><Plus size={16} />新建</button>
    </header>

    <div className="setting-position-guide" aria-label="位置顺序">
      {rows.map((row, index) => {
        const topConnected = index > 0;
        const bottomConnected = index < rows.length - 1;
        if (row.type === 'custom') {
          const selected = entry?.promptPositionId === row.position.id;
          const className = 'setting-position-guide-row is-custom'
            + (selected ? ' is-selected' : '')
            + (draggingId === row.position.id ? ' is-dragging' : '');
          return <article
            className={className}
            key={row.key}
            onDragEnter={(event) => { event.preventDefault(); moveTo(row.key); }}
            onDragOver={(event) => event.preventDefault()}
          >
            <span className="setting-position-guide-track" aria-hidden="true"><i className={topConnected ? 'is-connected' : ''} /><b /><i className={bottomConnected ? 'is-connected' : ''} /></span>
            <button
              type="button"
              className="setting-position-drag-handle"
              draggable
              aria-label={'拖动排序：' + row.position.name}
              title="拖动排序"
              onDragStart={(event) => { setDraggingId(row.position.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', row.position.id); }}
              onDragEnd={() => setDraggingId('')}
              onKeyDown={(event) => {
                if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault();
                moveByKeyboard(row.position.id, event.key === 'ArrowUp' ? -1 : 1);
              }}
            ><DotsSixVertical size={18} weight="bold" /></button>
            <button type="button" className="setting-position-guide-main" onClick={() => {
              if (!entry || selected) return;
              onChange(positions, entries.map((item) => item.id === entry.id ? { ...item, position: row.position.anchor, promptPositionId: row.position.id } : item));
            }}><strong>{row.position.name || '未命名位置'}</strong>{selected ? <span>当前</span> : null}</button>
            <details className="setting-position-more" name="custom-position-actions" onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
            }}>
              <summary aria-label={'管理位置：' + row.position.name} title="管理位置"><DotsThree size={20} weight="bold" /></summary>
              <div><button type="button" onClick={(event) => { event.currentTarget.closest('details').open = false; edit(row.position); }}><NotePencil size={16} />重命名</button><button type="button" className="is-danger" onClick={(event) => { event.currentTarget.closest('details').open = false; setDeleting(row.position); }}><Trash size={16} />删除</button></div>
            </details>
          </article>;
        }
        const key = row.key.split(':').pop();
        const Icon = fixedIcons[key] || PushPin;
        return <div
          className={'setting-position-guide-row is-fixed is-' + row.type}
          key={row.key}
          onDragEnter={(event) => { event.preventDefault(); moveTo(row.key); }}
          onDragOver={(event) => event.preventDefault()}
        >
          <span className="setting-position-guide-track" aria-hidden="true"><i className={topConnected ? 'is-connected' : ''} /><b /><i className={bottomConnected ? 'is-connected' : ''} /></span>
          <span className="setting-position-fixed-card"><Icon size={17} weight={row.type === 'instructions' ? 'fill' : 'regular'} /><strong>{row.label}</strong></span>
        </div>;
      })}
    </div>

    {draft ? <PositionNameDialog draft={draft} existing={positions.some((position) => position.id === draft.id)} onChange={setDraft} onCancel={() => setDraft(null)} onSave={saveDraft} /> : null}
    {deleting ? <DeletePositionDialog position={deleting} affected={affected} onCancel={() => setDeleting(null)} onConfirm={() => {
      const next = removeCustomPosition(positions, entries, deleting);
      onChange(next.positions, next.entries);
      setDeleting(null);
    }} /> : null}
  </section>;
}

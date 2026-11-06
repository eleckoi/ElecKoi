import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import { IconPinFillRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  ArrowLeft,
  ChatCircleDots,
  Database,
  DotsSixVertical,
  DotsThree,
  NotePencil,
  Plus,
  PushPin,
  Trash,
  UserCircle,
  Wrench,
} from '../../../ui/icons/interfaceIcons.jsx';
import {
  createPositionDraft,
  moveCustomPosition,
  positionManagementRows,
  removeCustomPosition,
  savePositionDraft,
} from '../model/customPositions.js';
import '../styles/custom-positions.css';
import { useEditorPresentation, useEditorSubpage } from '../../../ui/ui/EditorPresentationContext.jsx';
import { EditorContextMenu, useEditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';

const FIXED_POSITION_ICONS = {
  instructions: PushPin,
  cache: Database,
  history: ChatCircleDots,
  'latest-user-input': UserCircle,
  'tool-flow': Wrench,
};

export function FixedPositionIcon({ id, size = 17 }) {
  if (id === 'instructions') return <IconPinFillRegular size={size} />;
  const Icon = FIXED_POSITION_ICONS[id] || PushPin;
  return <Icon size={size} weight="regular" />;
}

const SORT_TRANSITION = { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const DROP_ANIMATION = { ...SORT_TRANSITION };
const DRAG_MODIFIERS = [({ transform }) => ({ ...transform, x: 0 })];
const DRAG_INSTRUCTIONS = {
  draggable: '按空格或回车开始排序，使用上下方向键移动，再按空格或回车确认，按 Escape 取消。也可以按 Alt 加上下方向键直接移动。',
};

function useReducedSortMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  return reduced;
}

function PositionTrack({ topConnected, bottomConnected }) {
  return <span className="setting-position-guide-track" aria-hidden="true"><i className={topConnected ? 'is-connected' : ''} /><b /><i className={bottomConnected ? 'is-connected' : ''} /></span>;
}

function PositionDragPreview({ position, selected }) {
  const tUi = useProductTranslation();
  return <div className={'setting-position-guide-row is-custom is-overlay' + (selected ? ' is-selected' : '')} aria-hidden="true">
    <span />
    <span className="setting-position-drag-handle"><DotsSixVertical size={20} /></span>
    <span className="setting-position-guide-main"><strong>{position.name || tUi("未命名位置")}</strong>{selected ? <span>{tUi("当前")}</span> : null}</span>
    <span className="setting-position-overlay-more"><DotsThree size={20} /></span>
  </div>;
}

function SortablePositionRow({ row, index, total, selected, reducedMotion, menuOpen, onSelect, onOpenMenu, onMoveByKeyboard }) {
  const tUi = useProductTranslation();
  const custom = row.type === 'custom';
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
    disabled: { draggable: !custom, droppable: row.type === 'instructions' },
    transition: reducedMotion ? null : SORT_TRANSITION,
  });
  const rowProps = {
    ref: setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    'data-position-key': row.key,
  };
  const track = <PositionTrack topConnected={index > 0} bottomConnected={index < total - 1} />;
  if (!custom) return <div {...rowProps} className={'setting-position-guide-row is-fixed is-' + row.type}>
    {track}
    <span className="setting-position-fixed-card"><FixedPositionIcon id={row.key.split(':').pop()} /><strong>{tUi(row.label)}</strong></span>
  </div>;

  return <article {...rowProps} className={'setting-position-guide-row is-custom' + (selected ? ' is-selected' : '') + (isDragging ? ' is-dragging' : '')}>
    {track}
    <button
      ref={setActivatorNodeRef}
      type="button"
      className="setting-position-drag-handle"
      {...attributes}
      {...listeners}
      aria-label={tUi("拖动排序：") + row.position.name}
      title={tUi("拖动排序")}
      onKeyDown={(event) => {
        if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          onMoveByKeyboard(row.position.id, event.key === 'ArrowUp' ? -1 : 1);
        } else listeners?.onKeyDown?.(event);
      }}
    ><DotsSixVertical size={20} /></button>
    <button type="button" className="setting-position-guide-main" onClick={onSelect}><strong>{row.position.name || tUi("未命名位置")}</strong>{selected ? <span>{tUi("当前")}</span> : null}</button>
    <button type="button" className="setting-position-more" aria-label={tUi("管理位置：") + row.position.name}
      title={tUi("管理位置")} aria-haspopup="menu" aria-expanded={menuOpen} onClick={onOpenMenu}><DotsThree size={20} weight="bold" /></button>
  </article>;
}

function PositionNameDialog({ draft, existing, onChange, onCancel, onSave }) {
  const tUi = useProductTranslation();
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  return <div className="setting-position-dialog-backdrop" role="presentation" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
  }} onMouseDown={(event) => {
    if (event.target === event.currentTarget) onCancel();
  }}>
    <form className="setting-position-dialog" role="dialog" aria-modal="true" aria-labelledby="position-dialog-title" onSubmit={(event) => {
      event.preventDefault();
      try { onSave(); } catch (cause) { setError(cause); inputRef.current?.focus(); }
    }}>
      <h3 id="position-dialog-title">{existing ? tUi("重命名位置") : tUi("新建位置")}</h3>
      <label><span>{tUi("名称")}</span><input ref={inputRef} value={draft.name} placeholder={tUi("例如：世界状态")} aria-invalid={error ? true : undefined} onChange={(event) => { onChange({ ...draft, name: event.target.value }); setError(null); }} /></label>
      <FailureAlert failure={error} />
      <footer><Button data-dsh-control variant="outline" type="button" className="setting-position-button" onClick={onCancel}>{tUi("取消")}</Button><Button data-dsh-control variant="primary" type="submit" className="setting-position-button is-primary">{tUi("保存")}</Button></footer>
    </form>
  </div>;
}

function DeletePositionDialog({ position, affected, onCancel, onConfirm }) {
  const tUi = useProductTranslation();
  return <div className="setting-position-dialog-backdrop" role="presentation" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
  }} onMouseDown={(event) => {
    if (event.target === event.currentTarget) onCancel();
  }}>
    <section className="setting-position-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-position-title">
      <h3 id="delete-position-title">{tUi("删除“")}{position.name}”？</h3>
      {affected ? <p>{affected}{tUi(" 条提示词会回到相邻的固定位置，正文不会删除。")}</p> : null}
      <footer><Button data-dsh-control variant="outline" type="button" className="setting-position-button" onClick={onCancel}>{tUi("取消")}</Button><Button data-dsh-control variant="outline" type="button" className="setting-position-button is-danger" onClick={onConfirm}>{tUi("删除")}</Button></footer>
    </section>
  </div>;
}

export function CustomPositionManager({ entry, positions, entries, onChange, onBack }) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const pageRef = useRef(null);
  useEffect(() => { if (compact) pageRef.current?.focus({ preventScroll: true }); }, [compact]);
  const [draft, setDraft] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [activeKey, setActiveKey] = useState('');
  const context = useEditorContextMenu();
  const addRef = useRef(null);
  const guideRef = useRef(null);
  const reducedMotion = useReducedSortMotion();
  const rows = useMemo(() => positionManagementRows(positions), [positions]);
  const rowKeys = useMemo(() => rows.map((row) => row.key), [rows]);
  const activeRow = rows.find((row) => row.key === activeKey);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const announcements = {
    onDragStart: ({ active }) => tUi("开始移动{value0}。", {value0: rows.find((row) => row.key === active.id)?.position?.name || ''}),
    onDragOver: ({ active, over }) => {
      if (!over || over.id === active.id) return;
      const fromIndex = rowKeys.indexOf(active.id);
      const targetIndex = rowKeys.indexOf(over.id);
      const target = rows[targetIndex];
      return tUi("移到{value0}{value1}。", {value0: target?.position?.name || target?.label || '', value1: fromIndex < targetIndex ? tUi("之后") : tUi("之前")});
    },
    onDragEnd: ({ over }) => over ? tUi("位置排序已确认。") : tUi("未放入位置列表，保留原来的顺序。"),
    onDragCancel: () => tUi("已取消移动，保留原来的顺序。"),
  };

  const edit = useCallback((position = null) => {
    const currentAnchor = positions.find((item) => item.id === entry?.promptPositionId)?.anchor || entry?.position;
    setDraft(createPositionDraft(positions, position, currentAnchor));
    setDeleting(null);
  }, [positions, entry?.promptPositionId, entry?.position]);
  const headerActions = useMemo(() => <button ref={addRef} type="button" onClick={() => edit()}>{tUi("新建")}</button>, [edit, tUi]);
  useEditorSubpage(true, tUi("自定义位置"), onBack, headerActions);

  function saveDraft() {
    const exists = positions.some((position) => position.id === draft.id);
    const next = savePositionDraft(positions, entries, draft, exists ? '' : entry?.id);
    onChange(next.positions, next.entries);
    setDraft(null);
    requestAnimationFrame(() => addRef.current?.focus());
  }

  function finishDrag({ active, over }) {
    setActiveKey('');
    if (!over || active.id === over.id) return;
    const fromIndex = rowKeys.indexOf(active.id);
    const targetIndex = rowKeys.indexOf(over.id);
    const moving = rows[fromIndex];
    if (moving?.type !== 'custom' || targetIndex < 0) return;
    const next = moveCustomPosition(positions, entries, moving.position.id, over.id, fromIndex < targetIndex);
    if (next.positions !== positions) onChange(next.positions, next.entries);
  }

  function detectPositionCollision(args) {
    const bounds = guideRef.current?.getBoundingClientRect();
    const pointer = args.pointerCoordinates;
    if (bounds && pointer && (pointer.x < bounds.left || pointer.x > bounds.right || pointer.y < bounds.top || pointer.y > bounds.bottom)) return [];
    return closestCenter(args);
  }

  function moveByKeyboard(positionId, offset) {
    if (activeKey) return;
    const currentRows = positionManagementRows(positions);
    const fromIndex = currentRows.findIndex((row) => row.key === 'custom:' + positionId);
    const target = currentRows[fromIndex + offset];
    if (!target) return;
    const next = moveCustomPosition(positions, entries, positionId, target.key, offset > 0);
    if (next.positions !== positions) onChange(next.positions, next.entries);
  }

  const affected = deleting ? entries.filter((item) => item.promptPositionId === deleting.id).length : 0;
  const overlay = <DragOverlay modifiers={DRAG_MODIFIERS} dropAnimation={reducedMotion ? null : DROP_ANIMATION} zIndex={1000}>
    {activeRow?.type === 'custom' ? <PositionDragPreview position={activeRow.position} selected={entry?.promptPositionId === activeRow.position.id} /> : null}
  </DragOverlay>;

  return <section ref={pageRef} tabIndex={compact ? -1 : undefined} className="setting-position-manager" aria-label={tUi("自定义位置")} onKeyDown={(event) => {
    if (event.key === 'Escape' && !draft && !deleting && !activeKey) { event.preventDefault(); onBack(); }
  }}>
    {!compact && <header className="setting-position-manager-header">
      <button type="button" className="setting-position-back" aria-label={tUi("返回插入配置")} title={tUi("返回")} onClick={onBack}><ArrowLeft size={18} /></button>
      <h2>{tUi("自定义位置")}</h2>
      <Button data-dsh-control variant="outline" ref={addRef} type="button" className="setting-position-button" onClick={() => edit()}><Plus size={16} />{tUi("新建")}</Button>
    </header>}

    <DndContext
      sensors={sensors}
      collisionDetection={detectPositionCollision}
      modifiers={DRAG_MODIFIERS}
      autoScroll={{ canScroll: (element) => element === guideRef.current, threshold: { x: 0, y: 0.12 }, acceleration: 6, interval: 10 }}
      accessibility={{ screenReaderInstructions: localizeUiCopy(DRAG_INSTRUCTIONS, tUi), announcements }}
      onDragStart={({ active }) => { context.close(); setActiveKey(active.id); }}
      onDragEnd={finishDrag}
      onDragCancel={() => setActiveKey('')}
    >
      <div ref={guideRef} className={'setting-position-guide' + (activeKey ? ' is-sorting' : '')} aria-label={tUi("位置顺序")}>
        <SortableContext items={rowKeys} strategy={verticalListSortingStrategy}>
          {rows.map((row, index) => <SortablePositionRow
            key={row.key}
            row={row}
            index={index}
            total={rows.length}
            selected={row.type === 'custom' && entry?.promptPositionId === row.position.id}
            reducedMotion={reducedMotion}
            onSelect={() => {
              if (!entry || entry.promptPositionId === row.position.id) return;
              onChange(positions, entries.map((item) => item.id === entry.id ? { ...item, position: row.position.anchor, promptPositionId: row.position.id } : item));
            }}
            menuOpen={context.menu?.target.id === row.position?.id}
            onOpenMenu={(event) => context.open(event, row.position)}
            onMoveByKeyboard={moveByKeyboard}
          />)}
        </SortableContext>
      </div>
      {typeof document === 'undefined' ? overlay : createPortal(overlay, document.getElementById('eleckoi-root') || document.body)}
    </DndContext>

    {context.menu ? <EditorContextMenu menu={context.menu} label={tUi("位置操作")} onClose={context.close} actions={[
      { label: tUi("重命名"), icon: NotePencil, run: () => edit(context.menu.target) },
      { label: tUi("删除"), icon: Trash, danger: true, run: () => setDeleting(context.menu.target) },
    ]} /> : null}

    {draft ? <PositionNameDialog draft={draft} existing={positions.some((position) => position.id === draft.id)} onChange={setDraft} onCancel={() => setDraft(null)} onSave={saveDraft} /> : null}
    {deleting ? <DeletePositionDialog position={deleting} affected={affected} onCancel={() => setDeleting(null)} onConfirm={() => {
      const next = removeCustomPosition(positions, entries, deleting);
      onChange(next.positions, next.entries);
      setDeleting(null);
    }} /> : null}
  </section>;
}

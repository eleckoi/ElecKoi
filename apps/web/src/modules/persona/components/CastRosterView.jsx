import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  Camera,
  Check,
  Crop,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import { characterAssetBaseUrl } from '@shared/foundation/characterAssetReference';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useCharacterAssets } from '../../characterAssets/index.js';
import { resolveFailure } from '../../../utils/failureText.js';
import { AvatarCropModal } from '../../../ui/ui/AvatarCropModal.jsx';
import { EditorContextMenu, useEditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { EditorSearchInput } from '../../../ui/ui/EditorDirectorySearch.jsx';
import { useEditorPresentation, useEditorSaveFeedback, useEditorSubpage } from '../../../ui/ui/EditorPresentationContext.jsx';
import { CastPortrait, CROP_SIZE } from './CastPortrait.jsx';

export function CastRosterView({
  characterId,
  roles,
  setRoles,
  dirty,
  saving,
  saveError,
  onSave,
}) {
  const { compact } = useEditorPresentation();
  const [roleId, setRoleId] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const context = useEditorContextMenu();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [cropEditor, setCropEditor] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);
  const uploadRole = useRef(null);
  const addTrigger = useRef(null);
  const galleryRef = useRef(null);
  const returnToList = useRef(null);
  const assets = useCharacterAssets(characterId);
  const [cropLoading, setCropLoading] = useState(false);
  const [error, setError] = useState('');

  const keyword = query.trim().toLowerCase();
  const matchingRoles = roles.filter(role => (role.name || '未命名角色').toLowerCase().includes(keyword));
  const selected = roles.find(role => role.id === roleId) || roles[0] || null;
  const contextRole = roles.find(role => role.id === context.menu?.target);
  const portraitCrop = cropEditor?.kind === 'portrait';
  const deleteDisabled = roles.length <= 1 || saving || uploading;
  const detailVisible = compact && detailOpen && Boolean(selected);
  const errorInHeader = useEditorSaveFeedback(saveError);
  const detailError = error || (!errorInHeader ? saveError : '');
  useEditorSubpage(detailVisible, selected?.name || '未命名角色', () => setDetailOpen(false));

  useLayoutEffect(() => {
    if (detailVisible || !returnToList.current) return;
    // The editor shell restores the navigation rail before the gallery can settle at its list width.
    const frame = requestAnimationFrame(() => {
      const { trigger, scrollTop } = returnToList.current;
      const gallery = galleryRef.current;
      gallery.scrollTop = scrollTop;
      const target = trigger?.isConnected ? trigger : gallery.querySelector('button') ?? gallery.parentElement.querySelector('input[type="search"]');
      target?.focus({ preventScroll: true });
      returnToList.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [detailVisible]);

  const images = id => id ? characterAssetBaseUrl(characterId) + id : undefined;
  const patchRole = (patch, id = selected?.id) => {
    setRoles(current => current.map(item => (item.id === id ? { ...item, ...patch } : item)));
  };

  function selectRole(role, trigger) {
    setRoleId(role.id);
    if (compact) {
      returnToList.current = { trigger, scrollTop: galleryRef.current.scrollTop };
      setDetailOpen(true);
    }
  }

  function openAddRole(event) {
    addTrigger.current = event.currentTarget;
    setNewName('');
    setAddOpen(true);
  }

  function pickPortrait() {
    if (!selected || saving || uploading || cropLoading) return;
    uploadRole.current = selected.id;
    inputRef.current?.click();
  }

  function selectPortrait(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const target = uploadRole.current;
    uploadRole.current = null;
    if (!file || !target) return;
    setError('');
    setCropEditor({ kind: 'portrait', id: target, file });
  }

  async function savePortrait(file) {
    const target = cropEditor.id;
    setUploading(true);
    try {
      const uploaded = await assets.upload([file]);
      if (!uploaded?.[0]) throw new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, '上传图片未完成，请重试。', { operation: 'write' });
      patchRole({ portraitAssetId: uploaded[0], circleAssetId: null, squareAssetId: null, crop: null }, target);
      setCropEditor(null);
    } finally {
      setUploading(false);
    }
  }

  async function openCropper() {
    if (!selected || saving || uploading || cropLoading) return;
    if (!selected.portraitAssetId) {
      pickPortrait();
      return;
    }
    setCropLoading(true);
    setError('');
    try {
      const response = await fetch(images(selected.portraitAssetId));
      if (!response.ok) throw new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, `读取图片失败，HTTP ${response.status}`, { operation: 'read' });
      const blob = await response.blob();
      setCropEditor({
        kind: 'circle',
        id: selected.id,
        portraitAssetId: selected.portraitAssetId,
        crop: selected.crop,
        file: new File([blob], selected.name || 'avatar', { type: blob.type || 'image/png' }),
      });
    } catch (cause) {
      setError(resolveFailure(cause, { fallback: '读取照片失败，请重试。' }).text);
    } finally {
      setCropLoading(false);
    }
  }

  function handleAddRole(event) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const created = { id: crypto.randomUUID(), name: trimmed, portraitAssetId: null, circleAssetId: null, squareAssetId: null, crop: null };
    setRoles(current => [...current, created]);
    setQuery('');
    selectRole(created, addTrigger.current);
    setAddOpen(false);
    setNewName('');
  }

  function confirmDeleteRole() {
    if (!deleteTarget || deleteDisabled) return;
    const remaining = roles.filter(role => role.id !== deleteTarget.id);
    setRoles(current => current.filter(role => role.id !== deleteTarget.id));
    if (roleId === deleteTarget.id) setRoleId(remaining[0]?.id || '');
    if (detailVisible && selected.id === deleteTarget.id) setDetailOpen(false);
    setDeleteTarget(null);
  }

  const deleteAction = selected && <Button data-dsh-control variant="outline" className="character-cast-pill-btn character-cast-delete"
    disabled={deleteDisabled} onClick={() => setDeleteTarget(selected)}>{compact ? '删除角色' : '删除'}</Button>;

  return (
    <div className={`character-cast-studio${compact ? ' is-mobile-cast editor-heading-surface' : ''}`} aria-busy={saving || uploading || undefined}>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={selectPortrait} />
      <div className="character-cast-left-col" hidden={detailVisible}>
        <header className="character-cast-topbar">
          {!compact && <h2>登场角色</h2>}

          <div className="character-cast-topbar-right">
            <EditorSearchInput className="character-cast-search" label="搜索角色" query={query} onQueryChange={setQuery} />
            {!compact && <Button
              data-dsh-control
              variant="outline"
              className="character-cast-pill-btn"
              icon={<Plus size={15} />}
              onClick={openAddRole}
            >
              新建角色
            </Button>}
          </div>
        </header>

        <section ref={galleryRef} className="character-cast-gallery-pane" aria-label="角色立绘画廊">
          {matchingRoles.length || !keyword ? (
            <div className="character-cast-grid" role="group" aria-label="登场角色列表">
              {matchingRoles.map(role => {
                const isSelected = !compact && selected?.id === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    aria-label={compact ? role.name || '未命名角色' : undefined}
                    aria-pressed={compact ? undefined : isSelected}
                    aria-haspopup={compact ? undefined : 'menu'}
                    className={`character-cast-card${isSelected ? ' is-selected' : ''}`}
                    onClick={event => selectRole(role, event.currentTarget)}
                    onContextMenu={event => context.open(event, role.id)}
                    onKeyDown={event => {
                      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) context.open(event, role.id);
                    }}
                  >
                    <div className="character-cast-card-frame">
                      <CastPortrait
                        src={images(role.portraitAssetId)}
                        name={role.name}
                        className="character-cast-card-art"
                        iconSize={28}
                      />
                      {isSelected && (
                        <span className="character-cast-card-check" aria-hidden="true">
                          <Check size={12} weight="bold" />
                        </span>
                      )}
                      {!compact && <span className="character-cast-card-circle-wrap" aria-hidden="true">
                        <CastPortrait
                          src={images(role.circleAssetId ?? role.portraitAssetId)}
                          crop={role.crop}
                          className="character-cast-circle character-cast-card-circle"
                          iconSize={11}
                        />
                      </span>}
                    </div>
                    <span className="character-cast-card-name">{role.name || '未命名角色'}</span>
                  </button>
                );
              })}

              {!keyword && (
                <button
                  type="button"
                  className="character-cast-add-card"
                  onClick={openAddRole}
                >
                  <span className="character-cast-add-icon"><Plus size={22} /></span>
                  <span>新建角色</span>
                </button>
              )}
            </div>
          ) : (
            <div className="character-cast-empty-center">
              <p>没有找到匹配「{query}」的角色</p>
            </div>
          )}
        </section>
      </div>

      <aside className="character-cast-inspector" aria-label="角色详情编辑" hidden={compact && !detailVisible}>
        {!compact && <header className="character-cast-inspector-topbar">
          {selected ? (
            <div className="character-cast-inspector-title-wrap">
              <CastPortrait
                src={images(selected.circleAssetId ?? selected.portraitAssetId)}
                crop={selected.crop}
                className="character-cast-circle character-cast-inspector-head-av"
                iconSize={11}
              />
              <h3 title={selected.name || undefined}>{selected.name || '未命名角色'}</h3>
            </div>
          ) : (
            <div className="character-cast-inspector-title-wrap">
              <h3>角色详情</h3>
            </div>
          )}

          <div className="character-cast-inspector-head-actions">
            <Button
              data-dsh-control
              variant="primary"
              className="character-cast-pill-btn"
              disabled={!dirty || saving || uploading}
              onClick={onSave}
            >
              保存更改
            </Button>
            {deleteAction}
          </div>
        </header>}

        {selected ? (
          <div className="character-cast-inspector-scroll" key={selected.id}>
            <div className="character-cast-inspector-block">
              <span className="character-cast-field-label">竖版头像</span>
              <div className="character-cast-inspector-portrait-slot">
                <button
                  type="button"
                  className="character-cast-inspector-portrait-btn"
                  onClick={pickPortrait}
                  disabled={saving || uploading || cropLoading}
                  aria-label="更换竖版头像"
                >
                  <CastPortrait
                    src={images(selected.portraitAssetId)}
                    name={selected.name}
                    className="character-cast-inspector-portrait-art"
                    iconSize={34}
                  />
                  <span className="character-cast-hover-pill">
                    <Camera size={14} weight="bold" aria-hidden="true" />
                    <span>{selected.portraitAssetId ? '更换图片' : '上传图片'}</span>
                  </span>
                </button>
              </div>
            </div>

            <label className="character-cast-field">
              <span className="character-cast-field-label">角色名称</span>
              <Input
                data-dsh-control
                className="character-cast-role-name-input"
                value={selected.name}
                disabled={saving}
                placeholder="输入角色名称"
                onChange={event => patchRole({ name: event.target.value })}
              />
            </label>

            <div className="character-cast-field">
              <span className="character-cast-field-label">圆形头像</span>
              <div className="character-cast-circle-card">
                <button
                  type="button"
                  className="character-cast-circle-thumb-btn"
                  disabled={cropLoading || saving || uploading}
                  aria-label={selected.portraitAssetId ? '调整圆形头像' : '上传图片'}
                  onClick={openCropper}
                >
                  <CastPortrait
                    src={images(selected.circleAssetId ?? selected.portraitAssetId)}
                    crop={selected.crop}
                    className="character-cast-circle character-cast-circle-56"
                    iconSize={18}
                  />
                </button>
                <div className="character-cast-circle-card-meta">
                  <span>{selected.portraitAssetId ? '与竖版共用原图' : '暂未上传原图'}</span>
                  {(selected.crop || selected.circleAssetId) && (
                    <button
                      type="button"
                      className="character-cast-text-link"
                      onClick={() => patchRole({ crop: null, circleAssetId: null })}
                    >
                      恢复默认取景
                    </button>
                  )}
                </div>
                <Button
                  data-dsh-control
                  variant="outline"
                  size="sm"
                  className="character-cast-crop-action-btn"
                  disabled={cropLoading || saving || uploading}
                  icon={selected.portraitAssetId ? <Crop size={14} /> : <Camera size={14} />}
                  onClick={openCropper}
                >
                  {selected.portraitAssetId ? '裁剪' : '上传'}
                </Button>
              </div>
            </div>

            {compact && <div className="character-cast-inspector-footer">{deleteAction}</div>}
            {detailError && <p className="product-dialog-error" role="alert">{detailError}</p>}
          </div>
        ) : (
          <div className="character-cast-empty-center">
            <p>选择或新建一位角色</p>
          </div>
        )}
      </aside>

      {addOpen && (
        <Modal
          open
          title="新建角色"
          closeLabel="关闭"
          onClose={() => setAddOpen(false)}
          className="product-dialog character-cast-modal"
          contentClassName="product-dialog-content"
          footer={
            <div className="product-dialog-actions">
              <Button variant="outline" onClick={() => setAddOpen(false)}>取消</Button>
              <Button variant="primary" type="submit" form="character-cast-new-role-form" disabled={!newName.trim()}>新建</Button>
            </div>
          }
        >
          <form id="character-cast-new-role-form" className="character-cast-modal-form" onSubmit={handleAddRole}>
            <label htmlFor="character-cast-new-role-name">角色名称</label>
            <Input
              id="character-cast-new-role-name"
              value={newName}
              placeholder="输入角色名称"
              data-modal-autofocus
              onChange={event => setNewName(event.target.value)}
            />
          </form>
        </Modal>
      )}

      {contextRole && <EditorContextMenu menu={context.menu} label="角色操作" onClose={context.close}
        actions={[{ label: '删除', icon: Trash, danger: true, disabled: deleteDisabled, run: () => setDeleteTarget(contextRole) }]} />}

      {deleteTarget && (
        <Modal
          open
          title={`删除「${deleteTarget.name || '未命名角色'}」？`}
          closeLabel="关闭"
          onClose={() => setDeleteTarget(null)}
          className="product-dialog character-cast-modal"
          contentClassName="product-dialog-content"
          footer={
            <div className="product-dialog-actions">
              <Button variant="outline" data-modal-autofocus onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button variant="primary" disabled={deleteDisabled} onClick={confirmDeleteRole}>删除</Button>
            </div>
          }
        >
          <p>删除后角色会从登场名单中移除，图片保留在资产库。</p>
        </Modal>
      )}

      <AvatarCropModal
        file={cropEditor?.file ?? null}
        title={portraitCrop ? '裁剪竖版头像' : '调整圆形头像'}
        cropWidth={portraitCrop ? 210 : CROP_SIZE}
        cropHeight={portraitCrop ? 280 : CROP_SIZE}
        cropRadius={portraitCrop ? '12px' : '8px'}
        showCircleGuide={!portraitCrop}
        outputShape={portraitCrop ? 'portrait' : undefined}
        outputWidth={portraitCrop ? 900 : undefined}
        initialTransform={cropEditor?.crop}
        onCancel={() => setCropEditor(null)}
        onSave={portraitCrop ? savePortrait : undefined}
        onSaveTransform={portraitCrop ? undefined : crop => {
          setRoles(current => current.map(role => role.id === cropEditor.id && role.portraitAssetId === cropEditor.portraitAssetId
            ? { ...role, crop, circleAssetId: null } : role));
          setCropEditor(null);
        }}
      />
    </div>
  );
}

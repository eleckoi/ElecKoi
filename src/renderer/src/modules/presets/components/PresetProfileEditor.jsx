import { useRef, useState } from 'react';
import { ArrowLeft, Camera } from '@phosphor-icons/react';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { AvatarCropModal } from '../../../ui/ui/AvatarCropModal.jsx';
import defaultPresetAvatar from '../../../assets/eleckoi-app-icon.png';

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function PresetProfileEditor({ preset, dirty, saving, error, onChange, onCancel, onSave }) {
  const inputRef = useRef(null);
  const [cropFile, setCropFile] = useState(null);
  const [imageError, setImageError] = useState('');
  const [modelTagText, setModelTagText] = useState(() => preset.modelTags.map((tag) => tag.label).join('，'));
  const profile = preset.profile;

  function updateProfile(patch) {
    onChange({ ...preset, profile: { ...profile, ...patch } });
  }

  function updateModelTags(value) {
    setModelTagText(value);
    const labels = [...new Set(value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean))].slice(0, 8);
    const existing = new Map(preset.modelTags.map((tag) => [tag.label, tag]));
    onChange({
      ...preset,
      modelTags: labels.map((label, index) => {
        const slug = label.toLocaleLowerCase().replace(/[^a-z0-9\p{L}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 28) || 'tag';
        return existing.get(label) || { id: `custom-${index}-${slug}`, label, providerId: '' };
      }),
    });
  }

  function receiveFile(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setImageError('图片不能超过 8 MB');
      return;
    }
    setImageError('');
    setCropFile(file);
  }

  async function saveAvatar(croppedFile) {
    const value = await readImage(croppedFile);
    if (!value) return;
    updateProfile({ authorAvatarPath: value });
    setCropFile(null);
  }

  return <div className="preset-profile-editor-page">
    <header>
      <button type="button" aria-label="返回预设资料" onClick={onCancel}><ArrowLeft size={19} /></button>
      <h1>编辑预设资料</h1>
    </header>
    <div className="preset-profile-editor-layout">
      <form onSubmit={(event) => { event.preventDefault(); if (dirty && !saving) void onSave(); }}>
        <label><span>名称</span><input value={preset.name} maxLength={60} onChange={(event) => onChange({ ...preset, name: event.target.value })} /></label>
        <label><span>作者</span><input value={profile.authorName} maxLength={40} placeholder="未填写作者" onChange={(event) => updateProfile({ authorName: event.target.value })} /></label>
        <label><span>模型标签</span><input value={modelTagText} maxLength={160} placeholder="用逗号分隔" onChange={(event) => updateModelTags(event.target.value)} /></label>
        {error || imageError ? <p className="preset-profile-editor-error">{error || imageError}</p> : null}
        <div className="preset-profile-editor-actions">
          <button type="submit" className="is-primary" disabled={!dirty || saving}>{saving ? '保存中…' : '保存'}</button>
          <button type="button" onClick={onCancel}>取消</button>
        </div>
      </form>

      <div className="preset-profile-editor-avatar">
        <button type="button" aria-label="修改作者头像" onClick={() => inputRef.current?.click()}>
          <Avatar src={profile.authorAvatarPath || defaultPresetAvatar} name={profile.authorName || preset.name} />
          <span aria-hidden="true"><Camera size={18} weight="fill" /></span>
        </button>
        <small>作者头像</small>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={receiveFile} />
      </div>
    </div>

    <AvatarCropModal
      file={cropFile}
      title="裁剪作者头像"
      cropWidth={250}
      cropHeight={250}
      cropRadius="18px"
      outputShape="square"
      outputWidth={420}
      onCancel={() => setCropFile(null)}
      onSave={saveAvatar}
    />
  </div>;
}

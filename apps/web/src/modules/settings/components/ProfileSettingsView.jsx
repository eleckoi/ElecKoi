import { PencilSimple } from '../../../ui/icons/interfaceIcons.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import '../styles/settings-design.css';

export function ProfileSettingsView({ name, avatars, saving, message, onNameChange, onNameBlur, onManageAvatars, onSave, onRetry }) {
  return <form className="settings-design sd-profile-page" onSubmit={onSave}>
    <header className="app-settings-heading"><h1>用户资料</h1></header>
    <button type="button" className="sd-profile-avatar sd-avatar-circle" aria-label="管理头像"
      onClick={() => onManageAvatars('circle')}>
      <Avatar src={avatars.circle || avatars.square} name={name.trim() || '你'} />
      <span className="sd-avatar-edit" aria-hidden="true"><PencilSimple /></span>
    </button>
    <label className="sd-name-field"><span>名字</span><input type="text" aria-label="名字" value={name}
      onChange={event => onNameChange(event.target.value, event.nativeEvent.isComposing)}
      onCompositionEnd={event => onNameChange(event.currentTarget.value, false)} onBlur={onNameBlur} /></label>
    {saving && <p className="sd-save-status" role="status">保存中…</p>}
    {message && <p className="sd-error" role="alert">{message} <button type="button" onClick={onRetry}>重试</button></p>}
  </form>;
}

import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { PencilSimple } from '../../../ui/icons/interfaceIcons.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import '../styles/settings-design.css';

export function ProfileSettingsView({ name, avatars, saving, message, onNameChange, onNameBlur, onManageAvatars, onSave, onRetry }) {
  const tUi = useProductTranslation();
  return <form className="settings-design sd-profile-page" onSubmit={onSave}>
    <header className="app-settings-heading"><h1>{tUi("用户资料")}</h1></header>
    <button type="button" className="sd-profile-avatar sd-avatar-circle" aria-label={tUi("管理头像")}
      onClick={() => onManageAvatars('circle')}>
      <Avatar src={avatars.circle || avatars.square} name={name.trim() || tUi("你")} />
      <span className="sd-avatar-edit" aria-hidden="true"><PencilSimple /></span>
    </button>
    <label className="sd-name-field"><span>{tUi("名字")}</span><input type="text" aria-label={tUi("名字")} value={name}
      onChange={event => onNameChange(event.target.value, event.nativeEvent.isComposing)}
      onCompositionEnd={event => onNameChange(event.currentTarget.value, false)} onBlur={onNameBlur} /></label>
    {saving && <p className="sd-save-status" role="status">{tUi("保存中…")}</p>}
    {message && message !== "saved" && <p className="sd-error" role="alert">{message} <button type="button" onClick={onRetry}>{tUi("重试")}</button></p>}
  </form>;
}

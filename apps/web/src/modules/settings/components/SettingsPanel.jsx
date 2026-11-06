import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useState } from "react";
import { ChatText, Info, SlidersHorizontal, Swatches } from "../../../ui/icons/interfaceIcons.jsx";
import { ProfileIcon } from "../../../ui/icons/index.jsx";
import { avatarSetFromPersona, AvatarManagerEditor } from "../../../ui/ui/AvatarSlotsEditor.jsx";
import { ProfileSettingsView } from './ProfileSettingsView.jsx';
import { ProfileAvatarDialog } from './ProfileAvatarDialog.jsx';
import { ThemeSettings } from './ThemeSettings.jsx';
import { ChatDisplaySettings } from "./ChatDisplaySettings.jsx";
export { ChatDisplayPreview } from "./ChatDisplaySettings.jsx";
import { AboutSettings } from "./AboutSettings.jsx";
import { LOG_ACTIONS, runLoggedAction } from "../../../utils/logAction.js";
import { useProfileAutosave } from '../model/useProfileAutosave.js';

const pages = [
  { id: "profile", label: "用户资料", icon: ProfileIcon },
  { id: "theme", label: "主题风格", icon: Swatches },
  { id: "chat", label: "聊天显示", icon: ChatText },
  { id: "about", label: "关于 ElecKoi", icon: Info },
];

export function UserProfileSettings({ persona, onUpdateUserProfile, renderUserProfileEditor, renderProfile, renderAvatarManager, autoSave = false }) {
  const tUi = useProductTranslation();
  const displayName = persona?.user_name || tUi("你");
  const [name, setName] = useState(displayName);
  const [avatars, setAvatars] = useState(() => avatarSetFromPersona(persona, "user"));
  const [editingAvatars, setEditingAvatars] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const savedAvatars = avatarSetFromPersona(persona, "user");
  const dirty = name !== displayName || Object.keys(savedAvatars).some(kind => avatars[kind] !== savedAvatars[kind]);
  const autosave = useProfileAutosave({ enabled: autoSave, profile: { name, avatars },
    persist: persistProfile,
    onSaved: saved => {
      setName(saved.user_name || '你');
      setAvatars(avatarSetFromPersona(saved, 'user'));
      setMessage('');
    },
    onError: error => setMessage(error?.message || tUi("保存失败，请稍后再试。")),
  });

  useEffect(() => {
    if (autoSave && autosave.hasPendingChanges()) return;
    setName(persona?.user_name || "你");
    setAvatars(avatarSetFromPersona(persona, "user"));
  }, [persona?.user_avatar, persona?.user_name, persona?.user_portrait, persona?.user_square, autoSave, autosave.hasPendingChanges]);

  function persistProfile(candidate) {
    const nextName = candidate.name?.trim() || tUi("你");
    const nextAvatars = candidate.avatars || avatars;
    return runLoggedAction(LOG_ACTIONS.settingsSave, () => onUpdateUserProfile({ name: nextName, avatars: nextAvatars }));
  }

  async function commitProfile(candidate = { name, avatars }) {
    if (autoSave) {
      setMessage('');
      autosave.stage(candidate, { delay: 0 });
      return autosave.flush();
    }
    setSaving(true);
    setMessage("");
    try {
      const saved = await persistProfile(candidate);
      setName(saved.user_name || "你");
      setAvatars(avatarSetFromPersona(saved, "user"));
      setMessage("saved");
      return true;
    } catch (error) {
      setMessage(error?.message || tUi("保存失败，请稍后再试。"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    await commitProfile();
  }

  function changeAvatars(nextAvatars) {
    setMessage("");
    setAvatars(nextAvatars);
    autosave.stage({ avatars: nextAvatars }, { delay: 0 });
  }

  if (editingAvatars && renderAvatarManager) {
    const editor = (
      <AvatarManagerEditor
        value={avatars}
        name={name || displayName}
        saving={saving}
        onBack={() => setEditingAvatars(null)}
        onChange={changeAvatars}
      />
    );
    return renderAvatarManager({ onBack: () => setEditingAvatars(null), saving }, editor);
  }

  const fallback = (
    <ProfileSettingsView name={name} avatars={avatars} saving={autoSave ? autosave.saving : saving} message={message}
      onSave={saveProfile} onManageAvatars={setEditingAvatars}
      onRetry={() => autosave.flush()} onNameBlur={() => autoSave && autosave.flush()}
      onNameChange={(next, composing = false) => { setName(next); setMessage(''); autosave.stage({ name: next }, { composing }); }} />
  );
  const owner = {
    persona,
    profile: { name, avatars },
    dirty,
    saving,
    message,
    onChange: (patch) => {
      setMessage("");
      if (Object.hasOwn(patch, "name")) setName(patch.name ?? "");
      if (patch.avatars) setAvatars(patch.avatars);
      autosave.stage(patch);
    },
    onSave: commitProfile,
    onManageAvatars: () => setEditingAvatars('circle'),
  };
  const presentation = renderProfile?.(owner) ?? fallback;
  return <>{renderUserProfileEditor?.(owner, presentation) ?? presentation}
    {editingAvatars && <ProfileAvatarDialog avatars={avatars} name={name || displayName} saving={saving}
      saveError={autoSave ? message : ''} onRetry={() => autosave.flush()}
      initialSlot={editingAvatars} onChange={changeAvatars} onClose={() => setEditingAvatars(null)} />}
  </>;
}

export function SettingsPanel({
  activePage,
  onPageChange,
  persona,
  onUpdateUserProfile,
  renderUserProfileEditor,
  chatDisplay,
  onChatDisplayChange,
  appearanceMode,
  onAppearanceModeChange,
  sidebarCharacterArtwork,
  onSidebarCharacterArtworkChange,
  appUpdates,
  settingsSections = [],
  renderSettingsSection,
  renderLanguageSettings,
  onClosePluginSection,
  renderLayout,
}) {
  const tUi = useProductTranslation();
  const requestedPluginSection = activePage.startsWith("dsh:")
    ? settingsSections.find((section) => `dsh:${section.id}` === activePage) || settingsSections[0]
    : null;
  const page = requestedPluginSection ? `dsh:${requestedPluginSection.id}` : activePage;
  const navigationPages = [
    ...localizeUiCopy(pages, tUi),
    ...settingsSections.map((section) => ({ id: `dsh:${section.id}`, label: section.label, icon: SlidersHorizontal })),
  ];

  const sidePanel = (
    <aside className="app-settings-sidebar">
      <header><h2>{tUi("设置")}</h2></header>
      <nav aria-label={tUi("设置分类")}>
        {navigationPages.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" className={page === item.id ? "active" : ""} onClick={() => onPageChange(item.id)}>
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );

  const mainPanel = (
    <section className="app-settings-content">
      {page === "profile" ? (
        <UserProfileSettings autoSave persona={persona} onUpdateUserProfile={onUpdateUserProfile} renderUserProfileEditor={renderUserProfileEditor} />
      ) : page === "chat" ? (
        <ChatDisplaySettings
          renderLanguageSettings={renderLanguageSettings}
          persona={persona}
          chatDisplay={chatDisplay}
          onChatDisplayChange={onChatDisplayChange}
        />
      ) : page === "about" ? (
        <AboutSettings updates={appUpdates} />
      ) : requestedPluginSection ? (
        <div className="dsh-settings-section">
          {renderSettingsSection?.(requestedPluginSection, onClosePluginSection)}
        </div>
      ) : page === "theme" ? (
        <ThemeSettings persona={persona} appearanceMode={appearanceMode} onAppearanceModeChange={onAppearanceModeChange}
          sidebarCharacterArtwork={sidebarCharacterArtwork} onSidebarCharacterArtworkChange={onSidebarCharacterArtworkChange} />
      ) : null}
    </section>
  );

  return renderLayout({ sidePanel, mainPanel });
}

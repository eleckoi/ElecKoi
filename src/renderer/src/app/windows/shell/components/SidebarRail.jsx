import { CommunityNavIcon, MessageNavIcon, ModelNavIcon, PersonNavIcon, PresetNavIcon, SettingsIcon } from "../../../../ui/icons/index.jsx";
import { Avatar } from "../../../../ui/ui/Avatar.jsx";
import logoIcon from "../../../../assets/eleckoi-app-icon.png";

function RailIconButton({ label, active, onClick, icon: Icon }) {
  function handleClick() {
    Promise.resolve(onClick?.()).catch((error) => {
      console.error(`Rail action failed: ${label}`, error);
    });
  }

  return (
    <button
      className={`rail-nav-button ${active ? "active" : ""}`}
      type="button"
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={handleClick}
    >
      <span className="rail-icon-layer base">
        <Icon />
      </span>
      <span className="rail-icon-layer active-fill" aria-hidden="true">
        <Icon />
      </span>
    </button>
  );
}

function RailProfileButton({ persona, active, onOpenProfile }) {
  const displayName = persona?.user_name || "你";
  const avatar = persona?.user_avatar || "";

  return (
    <div className="rail-profile-zone">
      <button
        className={`rail-user-trigger ${active ? "active" : ""}`}
        type="button"
        title="用户资料"
        aria-label="打开用户资料设置"
        onClick={onOpenProfile}
      >
        <Avatar src={avatar} name={displayName} className="rail-user-avatar" />
      </button>
    </div>
  );
}

function RailSettingsButton({ active, onOpenSettings }) {
  return (
    <button
      className={`rail-settings-trigger ${active ? "active" : ""}`}
      type="button"
      title="设置"
      aria-label="打开设置"
      aria-current={active ? "page" : undefined}
      onClick={onOpenSettings}
    >
      <SettingsIcon />
    </button>
  );
}

export function SidebarRail({ activeSection, profileActive, onSectionChange, persona, onOpenCommunity, onOpenProfile, onOpenSettings }) {
  return (
    <aside className="qq-rail" aria-label="侧边功能栏">
      <img className="rail-brand-logo" src={logoIcon} alt="" aria-hidden="true" draggable="false" />
      <div className="rail-nav-group">
        <RailIconButton label="消息" active={activeSection === "messages"} onClick={() => onSectionChange("messages")} icon={MessageNavIcon} />
        <RailIconButton label="角色列表" active={activeSection === "character"} onClick={() => onSectionChange("character")} icon={PersonNavIcon} />
        <RailIconButton label="预设" active={activeSection === "presets"} onClick={() => onSectionChange("presets")} icon={PresetNavIcon} />
        <RailIconButton label="社区" active={false} onClick={onOpenCommunity} icon={CommunityNavIcon} />
        <RailIconButton label="模型配置" active={activeSection === "model"} onClick={() => onSectionChange("model")} icon={ModelNavIcon} />
      </div>
      <div className="rail-bottom-zone">
        <RailProfileButton persona={persona} active={profileActive} onOpenProfile={onOpenProfile} />
        <RailSettingsButton active={activeSection === "settings" && !profileActive} onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}

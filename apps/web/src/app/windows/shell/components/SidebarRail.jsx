import { Suspense } from "react";
import { PluginNavIcon, SettingsIcon } from "../../../../ui/icons/index.jsx";
import { Avatar } from "../../../../ui/ui/Avatar.jsx";
import logoIcon from "../../../../assets/eleckoi-app-icon.png";
import { DshPanelLeftIcon } from "../../../../ui/icons/dshComposerIcons.jsx";
import { ElecKoiWordmark } from "../../../../ui/icons/ElecKoiWordmark.jsx";
import { DshEntryActionsMenu } from '../../../../ui/ui/DshEntryActionsMenu.jsx';

function RailIconButton({ id, label, active, action, onClick, icon, productIcon, expanded }) {
  function handleClick() {
    Promise.resolve(onClick?.()).catch((error) => {
      console.error(`Rail action failed: ${label}`, error);
    });
  }

  return (
    <button
      className={`rail-nav-button is-${productIcon ? "product" : "plugin"}-icon ${active ? "active" : ""}`}
      type="button"
      title={label}
      data-navigation-id={id}
      aria-label={label}
      aria-current={!action && active ? "page" : undefined}
      aria-expanded={action ? active : undefined}
      onClick={handleClick}
    >
      <span className="rail-icon-layer base">
        <Suspense fallback={<PluginNavIcon />}>{icon}</Suspense>
      </span>
      <span className="rail-icon-layer active-fill" aria-hidden="true">
        <Suspense fallback={<PluginNavIcon />}>{icon}</Suspense>
      </span>
      {expanded && <span className="rail-navigation-label">{label}</span>}
    </button>
  );
}

function RailProfileButton({ persona, active, onOpenProfile, expanded }) {
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
        {expanded && <span>{displayName}</span>}
      </button>
    </div>
  );
}

function RailSettingsButton({ active, onOpenSettings, expanded }) {
  return (
    <button
      className={`rail-settings-trigger ${active ? "active" : ""}`}
      type="button"
      title="设置"
      aria-label={expanded ? "设置" : "打开设置"}
      aria-current={active ? "page" : undefined}
      onClick={onOpenSettings}
    >
      <span className="rail-icon-layer base"><SettingsIcon /></span>
      <span className="rail-icon-layer active-fill" aria-hidden="true"><SettingsIcon /></span>
      {expanded && <span>设置</span>}
    </button>
  );
}

export function SidebarRail({ activeSection, navigationItems = [], renderEntryActions, renderSidebarSlot, profileActive, onSectionChange, onNavigationAction, persona, onOpenProfile, onOpenSettings, expanded = false, compactAccount = false, onCollapse, footerActions }) {
  const brand = <span className="rail-brand-seat" aria-hidden="true">
    {renderSidebarSlot?.("sidebar.brand.mark", { size: 30, content: <img src={logoIcon} alt="" draggable="false" /> }) || <img src={logoIcon} alt="" draggable="false" />}
    {renderSidebarSlot?.("sidebar.toggle.badge", {})}
  </span>;
  const renderItem = ({ id, label, action, productIcon }) => (
    <RailIconButton
      key={id}
      id={id}
      label={label}
      active={activeSection === id}
      action={action}
      onClick={() => action ? onNavigationAction?.(id) : onSectionChange(id)}
      icon={renderSidebarSlot?.("sidebar.panellist", { size: 24, active: activeSection === id }, { only: id }) || <PluginNavIcon />}
      productIcon={productIcon}
      expanded={expanded}
    />
  );
  const profile = <RailProfileButton persona={persona} active={profileActive} onOpenProfile={onOpenProfile} expanded={expanded} />;
  const settings = renderSidebarSlot?.("sidebar.settings", {
    wide: expanded && !compactAccount,
    content: <RailSettingsButton active={activeSection === "settings" && !profileActive} onOpenSettings={onOpenSettings} expanded={expanded && !compactAccount} />,
  }) || <RailSettingsButton active={activeSection === "settings" && !profileActive} onOpenSettings={onOpenSettings} expanded={expanded && !compactAccount} />;
  return (
    <aside className={`qq-rail${expanded ? " expanded" : ""}`} aria-label="侧边功能栏">
      {expanded && <header className="rail-expanded-header">
        {brand}
        {renderSidebarSlot?.("sidebar.brand.name", { content: <ElecKoiWordmark /> }) || <ElecKoiWordmark />}
        <button type="button" aria-label="收起侧边栏" onClick={onCollapse}><DshPanelLeftIcon size={20} /></button>
      </header>}
      {!expanded && brand}
      <div className="rail-nav-group">
        {navigationItems.map(renderItem)}
        {renderEntryActions ? <DshEntryActionsMenu region="sidebar" className="rail-nav-button is-plugin-icon" showLabel={expanded} renderActions={renderEntryActions} /> : null}
      </div>
      <div className="rail-bottom-zone">
        {footerActions && <div className="rail-footer-actions" aria-label="侧边栏插件操作">{footerActions}</div>}
        {compactAccount ? <div className="rail-account-row">{profile}<div className="rail-settings-seat">{settings}</div></div> : <>{profile}{settings}</>}
      </div>
    </aside>
  );
}

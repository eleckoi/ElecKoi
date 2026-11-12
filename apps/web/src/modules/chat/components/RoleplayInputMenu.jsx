import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { DshNewChatIcon, DshRefreshIcon } from "../../../ui/icons/dshComposerIcons.jsx";
import { ChatHistoryIcon, MenuIcon, PlugIcon } from "../../../ui/icons/openSourceIcons.jsx";
import { TrashIcon } from "../../../ui/icons/index.jsx";
import { BookOpenText, CaretLeft, CaretRight, Code, Database, DotsThree, TextAlignLeft } from "../../../ui/icons/interfaceIcons.jsx";
import { UserCircle } from '@phosphor-icons/react';
import { MainPageContext } from '../../../app/windows/MainPageContext.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { registerOverlayBack } from '../../../ui/hooks/overlayBack.js';
import defaultPresetAvatar from '../../../assets/eleckoi-app-icon.png';
import { GlobalSettingLibrariesQuickDialog } from '../../settingLibraries/index.js';
import { ConversationPresetDialog } from './ConversationPresetDialog.jsx';

const noSubscription = () => () => {};
const noCatalog = () => null;

/** Shared conversation actions placed immediately after the native DSH plus button. */
export function RoleplayInputMenu({
  isSending,
  onCreateChat,
  onOpenHistory,
  onOpenTools,
  onOpenVariables,
  onOpenRequestPreview,
  onEnterDeleteMode,
  canDeleteMessages = false,
  onRegenerate,
  regenerateTargetMessageId,
  scriptButtons = [],
  scriptsReady = false,
  onRunScriptButton,
  purpose = 'roleplay',
  onSelectCharacter,
  presetCatalog,
}) {
  const tUi = useProductTranslation();
  const view = useContext(MainPageContext);
  const catalog = presetCatalog ?? view?.presets;
  const globalLibraries = view?.characterConfiguration?.globalSettingLibraries;
  const presetState = useSyncExternalStore(catalog?.subscribe ?? noSubscription, catalog?.getSnapshot ?? noCatalog, noCatalog);
  const activePreset = presetState?.catalog?.presets.find(preset => preset.id === presetState.catalog.activePresetIds[purpose]);
  const creator = purpose === 'creator';
  const menuLabel = creator ? tUi("工作室菜单") : tUi("扮演菜单");
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [dialog, setDialog] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    return registerOverlayBack(() => {
      if (more) setMore(false);
      else { setOpen(false); rootRef.current?.querySelector('button')?.focus(); }
    });
  }, [open, more]);

  function run(action) {
    setOpen(false);
    rootRef.current?.querySelector("button")?.focus();
    action?.();
  }

  function openDialog(kind) { setOpen(false); setMore(false); setDialog(kind); }
  function returnToMenu() { setDialog(null); setOpen(true); }

  return (
    <div className="composer-more-anchor" ref={rootRef}>
      <Menu key={more ? 'more' : 'main'} open={open} portal compact autoFocus side="top" align="start"
        listClassName={`composer-more-menu ${more ? 'is-more' : 'is-main'}`} onClose={() => setOpen(false)} anchor={<button
        className={`roleplay-menu-trigger composer-more-trigger ${open ? "active" : ""}`}
        type="button"
        aria-label={open ? tUi("收起{value0}", {value0: menuLabel}) : menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={menuLabel}
        onClick={() => { setMore(false); setOpen((value) => !value); }}
      >
        <MenuIcon size={17} weight="bold" />
      </button>}>
          {more ? <>
            <button type="button" className="composer-menu-back" role="menuitem" onClick={() => setMore(false)}><CaretLeft size={18} /><span>{tUi('更多')}</span></button>
            <i aria-hidden="true" />
            {onOpenRequestPreview && <button type="button" role="menuitem" onClick={() => run(onOpenRequestPreview)}><TextAlignLeft size={18} /><span>{tUi('请求上下文预览')}</span></button>}
            {onOpenVariables && <button type="button" role="menuitem" onClick={() => run(onOpenVariables)}><Database size={18} /><span>{tUi('变量查看与管理')}</span></button>}
            <>
              <i aria-hidden="true" /><p className="composer-menu-section">{tUi('脚本提供')}</p>
              <div className="composer-menu-script-list" role="group" aria-label={tUi('脚本按钮')}>
              {scriptButtons.length ? scriptButtons.map(button => <div key={button.key}>
                <button type="button" role="menuitem" className="composer-menu-script" title={`${button.scriptName} · ${button.label}`}
                  disabled={!scriptsReady || button.busy} aria-busy={button.busy} onClick={() => run(() => onRunScriptButton?.(button.key))}>
                  <Code size={18} /><span>{button.label}<small>{button.scope === 'character' ? tUi('角色脚本') : button.scope === 'preset' ? tUi('预设脚本') : tUi('全局脚本')} · {button.scriptName}</small></span>
                </button>
                {button.error && <p role="alert" className="composer-menu-script-error">{button.error}</p>}
              </div>) : <p role="status" className="composer-menu-section">{tUi('暂无可用按钮')}</p>}
              </div>
            </>
          </> : <>
          {creator && <button type="button" role="menuitem" onClick={() => run(onSelectCharacter)}><UserCircle size={18} /><span>{tUi("选择角色")}</span></button>}
          {!creator &&
          <button type="button" role="menuitem" onClick={() => run(onOpenHistory)}>
            <ChatHistoryIcon size={18} /><span>{tUi("聊天记录")}</span>
          </button>}
          <button type="button" role="menuitem" onClick={() => run(onOpenTools)}>
            <PlugIcon size={18} /><span>{tUi("工具")}</span>
          </button>
          <button type="button" role="menuitem" disabled={!catalog} aria-haspopup="dialog" onClick={() => openDialog('preset')}>
            <Avatar src={activePreset?.profile.authorAvatarPath || defaultPresetAvatar} name={activePreset?.profile.authorName || activePreset?.name} className="composer-menu-preset-avatar" /><span>{tUi('切换预设')}</span>
          </button>
          {!creator && <button type="button" role="menuitem" disabled={!globalLibraries} aria-haspopup="dialog" onClick={() => openDialog('global')}>
            <BookOpenText size={18} /><span>{tUi('全局设定库')}</span>
          </button>}
          <button className="composer-new-chat-item" type="button" role="menuitem" onClick={() => run(onCreateChat)}>
            <DshNewChatIcon size={18} /><span>{tUi("新建对话")}</span>
          </button>
          <button type="button" role="menuitem" disabled={isSending || !canDeleteMessages}
            onClick={() => run(onEnterDeleteMode)}>
            <TrashIcon size={18} /><span>{tUi("删除消息")}</span>
          </button>
          <button type="button" role="menuitem" disabled={!regenerateTargetMessageId || isSending}
            onClick={() => run(() => onRegenerate?.({ targetMessageId: regenerateTargetMessageId }))}>
            <DshRefreshIcon size={18} /><span>{tUi("重新生成")}</span>
          </button>
          <i aria-hidden="true" />
          <button type="button" role="menuitem" className="composer-menu-next" onClick={() => setMore(true)}><DotsThree size={18} /><span>{tUi('更多')}</span><CaretRight size={14} /></button>
          </>}
      </Menu>
      {dialog === 'preset' && <ConversationPresetDialog catalog={catalog} purpose={purpose} onClose={returnToMenu} />}
      {!creator && dialog === 'global' && <GlobalSettingLibrariesQuickDialog model={globalLibraries} onClose={returnToMenu} />}
    </div>
  );
}

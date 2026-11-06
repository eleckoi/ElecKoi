import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretRight, MinusCircle, X } from '../../../ui/icons/interfaceIcons.jsx';
import { normalizeRoleplayPlanDraft } from '@shared/contracts/presets/roleplayPlan';
import { AgentToolGroupIcon } from '../../../ui/icons/index.jsx';
import { RoleplayPlanEditor, SubagentSettingsLink, WebSearchSettings, pluginToolSections } from '../../agentTools/index.js';
import { PresetContextMenu, usePresetContextMenu } from './PresetContextMenu.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
import { MobileConversationOverlay } from '../../../mobile/MobileConversationOverlay.jsx';
import { PresetPluginToolsDialog } from './PresetPluginToolsDialog.jsx';
import { PresetToolManagerDialog } from './PresetToolManagerDialog.jsx';
import { EditorCollectionToolbar } from '../../../ui/ui/EditorCollectionControls.jsx';
import '../../../mobile/mobile-preset-editor.css';

export function PresetToolsEditor({
  preset,
  onChange,
  onNotify,
  onBeforeOpenSubagentSettings,
  savePromptOpen = false,
  saveAction,
}) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const [query, setQuery] = useState('');
  const [configGroupId, setConfigGroupId] = useState('');
  const [pluginId, setPluginId] = useState('');
  const [managerOpen, setManagerOpen] = useState(false);
  const context = usePresetContextMenu();
  const selectedGroups = useMemo(() => preset.toolGroups.filter((group) => group.included), [preset.toolGroups]);
  const extraGroups = useMemo(() => {
    const names = new Set(selectedGroups.flatMap(group => group.members.map(member => member.name)));
    return (preset.extraToolGroups || []).filter(group => !group.members.some(member => names.has(member.name)));
  }, [preset.extraToolGroups, selectedGroups]);
  const sections = useMemo(() => pluginToolSections(preset.toolGroups, extraGroups), [preset.toolGroups, extraGroups]);
  const plugin = [...sections.preset, ...sections.extra].find(group => group.id === pluginId && group.isPlugin);
  const toolSources = [
    { id: 'built_in', name: tUi("内置工具"), tools: preset.toolGroups.filter(group => group.source === 'built_in') },
    ...preset.toolGroups.filter(group => group.source === 'mcp').map(group => ({ id: group.id, name: group.name, tools: [group] })),
    ...[...sections.preset, ...sections.extra].filter(group => group.isPlugin),
  ].filter(source => source.tools.length);
  const matches = group => {
    const key = query.trim().toLocaleLowerCase();
    return !key || `${group.name} ${group.description} ${group.members.map(member => member.name).join(' ')} ${group.tools?.map(tool => `${tool.name} ${tool.description}`).join(' ') || ''}`.toLocaleLowerCase().includes(key);
  };

  function updateGroup(groupId, patch) {
    onChange({
      ...preset,
      toolGroups: preset.toolGroups.map((group) => group.id === groupId ? { ...group, ...patch } : group),
    });
  }

  function applyMembership(changes) {
    const edits = new Map(changes.map(change => [change.tool.id, change]));
    const currentGroups = new Map(preset.toolGroups.map(group => [group.id, group]));
    const groups = preset.toolGroups.flatMap(group => {
      const change = edits.get(group.id);
      if (!change) return [group];
      if (change.included) return [{ ...group, included: true, enabled: change.tool.enabled }];
      return group.source === 'extension' ? [] : [{ ...group, included: false, enabled: false }];
    });
    const ids = new Set(groups.map(group => group.id));
    const extras = new Map(extraGroups.map(group => [group.id, group]));
    for (const { tool, included } of changes) {
      if (included) {
        if (!ids.has(tool.id)) { groups.push({ ...tool, included: true }); ids.add(tool.id); }
        extras.delete(tool.id);
      } else if (tool.source === 'extension') {
        const current = currentGroups.get(tool.id) || tool;
        if (current.available === true) extras.set(tool.id, { ...current, included: false, enabled: true });
      }
    }
    onChange({ ...preset, toolGroups: groups, extraToolGroups: [...extras.values()] });
  }

  const menuGroup = context.menu?.target;
  const configGroup = selectedGroups.find((group) => group.id === configGroupId) || extraGroups.find(group => group.id === configGroupId);
  const configIsExtra = extraGroups.some(group => group.id === configGroupId);

  function removeGroup(group) {
    applyMembership([{ tool: group, included: false }]);
  }

  function closeConfig() {
    if (configGroupId === 'builtin:roleplay-workflow') {
      const roleplayPlan = normalizeRoleplayPlanDraft(preset.roleplayPlan);
      if (JSON.stringify(roleplayPlan) !== JSON.stringify(preset.roleplayPlan)) {
        onChange({ ...preset, roleplayPlan });
      }
    }
    setConfigGroupId('');
  }

  return (
    <section className="preset-tools-editor" aria-label={tUi("工具")}>
      <EditorCollectionToolbar className="preset-tools-toolbar" query={query} onQueryChange={setQuery} placeholder={tUi("搜索工具")}
        onManage={() => { setPluginId(''); setManagerOpen(true); }} manageLabel={tUi("管理预设工具")} disabled={savePromptOpen} save={saveAction} />

      <div className="preset-tools-list" tabIndex={0} aria-label={tUi("当前预设工具列表")} onContextMenu={(event) => { setManagerOpen(false); context.open(event); }}>
        {[{ id: 'preset', label: tUi("预设工具"), groups: sections.preset.filter(matches) }, { id: 'extra', label: tUi("额外工具"), groups: sections.extra.filter(matches) }].map(section => {
          const extra = section.id === 'extra';
          const groups = section.groups;
          return groups.length ? <div className="preset-tools-source" key={section.id}>
            <div className="preset-tools-section-heading"><strong>{section.label}</strong></div>
            {groups.map((group) => <section className={`preset-tool-row${group.isPlugin ? ' is-plugin' : ''}${extra ? ' is-extra' : ''}${group.enabled ? '' : ' is-disabled'}`} key={group.id} onContextMenu={(event) => { setManagerOpen(false); if (!group.isPlugin) context.open(event, group); else event.preventDefault(); }}>
              <button type="button" className="preset-tool-summary" aria-haspopup="dialog" onClick={() => { setManagerOpen(false); if (group.isPlugin) setPluginId(group.id); else setConfigGroupId(group.id); }}>
                <span className="preset-tool-icon"><AgentToolGroupIcon groupId={group.id} size={17} /></span>
                <span><strong>{group.name}</strong><small>{group.available === false ? tUi("缺少插件或工具未加载") : group.description}</small></span>
                <span className="preset-tool-count" title={group.isPlugin ? tUi("{value0} 项已加入预设，共 {value1} 个工具", {value0: group.includedCount, value1: group.tools.length}) : undefined}>{group.isPlugin && group.included ? `${group.includedCount}/${group.tools.length}` : group.members.length}</span>
                <CaretRight size={15} aria-hidden="true" />
              </button>
              {group.isPlugin ? null : <button
                type="button"
                className="preset-tool-toggle"
                role="switch"
                aria-checked={group.enabled}
                aria-label={`${group.enabled ? tUi("关闭") : tUi("开启")}${group.name}`}
                onClick={() => updateGroup(group.id, { enabled: !group.enabled })}
              ><i /></button>}
            </section>)}
          </div> : null;
        })}
        {!sections.preset.some(matches) && !sections.extra.some(matches) ? <p className="setting-library-empty">{query ? tUi("没有匹配的工具") : tUi("还没有添加工具")}</p> : null}
      </div>

      {managerOpen ? <PresetToolManagerDialog sources={toolSources} includedIds={new Set(selectedGroups.map(group => group.id))} compact={compact} closeBlocked={savePromptOpen}
        onClose={() => setManagerOpen(false)} onMembershipChange={(tool, included) => applyMembership([{ tool, included }])} /> : null}

      {plugin ? <PresetPluginToolsDialog plugin={plugin} compact={compact} nested={Boolean(configGroupId)} closeBlocked={savePromptOpen}
        onClose={() => setPluginId('')} onOpenTool={setConfigGroupId} /> : null}

      {context.menu && menuGroup ? <PresetContextMenu menu={context.menu} onClose={context.close} actions={[
        { label: tUi("从预设移除"), icon: MinusCircle, run: () => removeGroup(menuGroup) },
      ]} /> : null}
      {configGroup ? <PresetToolConfigDialog
        compact={compact}
        group={configGroup}
        extra={configIsExtra}
        roleplayPlan={preset.roleplayPlan}
        closeBlocked={savePromptOpen}
        onClose={closeConfig}
        onEnabledChange={(enabled) => updateGroup(configGroup.id, { enabled })}
        onNameChange={(name) => updateGroup(configGroup.id, { name })}
        onRemove={() => { removeGroup(configGroup); setConfigGroupId(''); }}
        onNotify={onNotify}
        onBeforeOpenSubagentSettings={onBeforeOpenSubagentSettings}
        onRoleplayPlanChange={(roleplayPlan) => onChange({ ...preset, roleplayPlan })}
      /> : null}
    </section>
  );
}

function PresetToolConfigDialog({
  compact,
  group,
  extra = false,
  roleplayPlan,
  closeBlocked,
  onClose,
  onEnabledChange,
  onNameChange,
  onRemove,
  onNotify,
  onBeforeOpenSubagentSettings,
  onRoleplayPlanChange,
}) {
  const tUi = useProductTranslation();
  useEffect(() => {
    if (compact) return undefined;
    function closeOnEscape(event) {
      if (!event.defaultPrevented && event.key === 'Escape' && !closeBlocked) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [compact, closeBlocked, onClose]);

  const body = <div className="preset-tool-config-body">
    {!extra && <section className="preset-tool-config-card preset-tool-config-switch-row">
      <strong>{tUi("启用此工具组")}</strong>
      <button
        type="button"
        className="preset-tool-toggle"
        role="switch"
        aria-checked={group.enabled}
        aria-label={`${group.enabled ? tUi("关闭") : tUi("开启")}${group.name}`}
        onClick={() => onEnabledChange(!group.enabled)}
      ><i /></button>
    </section>}
    {group.available === false ? <p className="preset-tool-config-description">{tUi("缺少插件或工具未加载，仍可正常聊天。")}</p> : null}
    {!extra && group.source === 'extension' ? <label className="preset-tool-config-name">{tUi("显示名称")}<input aria-label={tUi("工具显示名称")} value={group.name} onChange={event => onNameChange(event.target.value)} /></label> : null}
    {group.description ? <p className="preset-tool-config-description">{group.description}</p> : null}
    {group.id === 'builtin:collaboration' ? <SubagentSettingsLink
      onBeforeOpen={onBeforeOpenSubagentSettings}
      onOpen={onClose}
      onNotify={onNotify}
    /> : null}
    {group.id === 'builtin:web' ? <div className="preset-tool-web-config"><WebSearchSettings onBeforeOpenPluginSettings={onBeforeOpenSubagentSettings} onOpenPluginSettings={onClose} /></div> : <>
      {group.id === 'builtin:roleplay-workflow' ? <RoleplayPlanEditor
        value={roleplayPlan}
        onChange={onRoleplayPlanChange}
      /> : <>
        <h3>{group.members.length ? tUi("包含 {value0} 个工具", {value0: group.members.length}) : tUi("工具")}</h3>
        <section className="preset-tool-config-card preset-tool-config-members">
          {group.members.length ? group.members.map((member) => <div key={member.name}>
            <code>{member.name}</code>
            {member.description ? <small>{member.description}</small> : null}
          </div>) : <p>{tUi("此工具组没有独立调用项")}</p>}
        </section>

        <h3>{tUi("来源")}</h3>
        <section className="preset-tool-config-card preset-tool-config-source">
          <span className="preset-tool-icon"><AgentToolGroupIcon groupId={group.id} size={17} /></span>
          <span>{group.source === 'built_in' ? tUi("ElecKoi 内置") : group.source === 'mcp' ? tUi("MCP 服务器") : group.plugin?.name || tUi("插件来源未声明")}</span>
        </section>
      </>}
    </>}
    {!extra && <button type="button" className="mobile-preset-tool-remove" onClick={onRemove}><MinusCircle size={18} />{tUi("从预设移除")}</button>}
  </div>;
  if (compact) return <MobileConversationOverlay title={extra ? group.name : tUi("{value0}配置", {value0: group.name})} kind="page" className="mobile-preset-tool-config" busy={closeBlocked} onClose={onClose}>{body}</MobileConversationOverlay>;
  return createPortal(<SystemBarOverlay className="preset-tool-config-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="preset-tool-config-dialog" role="dialog" aria-modal="true" aria-label={tUi("{value0}配置", {value0: group.name})} onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <span className="preset-tool-config-title-icon"><AgentToolGroupIcon groupId={group.id} size={18} /></span>
        <h2>{group.name}</h2>
        <button type="button" aria-label={tUi("关闭")} onClick={onClose}><X size={19} /></button>
      </header>
      {body}
    </section>
  </SystemBarOverlay>, document.body);
}

import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, CaretRight, X } from '../../../ui/icons/interfaceIcons.jsx';
import { AgentToolGroupIcon } from '../../../ui/icons/index.jsx';
import { RoleplayPlanEditor, SubagentSettingsLink, WebSearchSettings, pluginToolSections } from '../../agentTools/index.js';
import { loadAgentTools, setAgentToolGroupEnabled, setRoleplayPlanSettings } from '../api/agentToolsApi.js';
import { MobileConversationOverlay, MobileOverlayScroll, isMobilePresentation } from '../../../mobile/MobileConversationOverlay.jsx';

export function AgentToolsDialog({
  presetCatalog,
  onClose,
  onManage,
  onNotify,
  purpose = 'roleplay',
}) {
  const tUi = useProductTranslation();
  const mobile = isMobilePresentation();
  const scrollPositions = useRef(new Map()).current;
  const [catalog, setCatalog] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState('');
  const [savingRoleplayPlan, setSavingRoleplayPlan] = useState(false);
  const selected = catalog?.groups.find((item) => item.id === selectedId) || catalog?.extraGroups?.find(item => item.id === selectedId);
  const selectedIsExtra = Boolean(catalog?.extraGroups?.some(item => item.id === selectedId));
  const sections = pluginToolSections(catalog?.groups || [], catalog?.extraGroups || []);
  const selectedPlugin = [...sections.preset, ...sections.extra].find(group => group.isPlugin && group.id === selectedId);
  function goBack() {
    const parent = selected && [...sections.preset, ...sections.extra].find(group => group.isPlugin && group.tools.some(tool => tool.id === selected.id));
    setSelectedId(parent?.id || '');
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadAgentTools(presetCatalog, purpose)
      .then((value) => { if (active) setCatalog(value); })
      .catch(() => { if (active) onNotify?.('error', tUi("读取工具失败")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onNotify, presetCatalog, purpose]);

  useEffect(() => {
    if (mobile) return undefined;
    const closeOnEscape = (event) => {
      if (event.defaultPrevented || event.key !== 'Escape') return;
      if (selectedId) goBack();
      else onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, selectedId, mobile]);

  async function changeEnabled(group, enabled) {
    if (changingId) return;
    setChangingId(group.id);
    setCatalog((current) => current ? {
      ...current,
      groups: current.groups.map((item) => item.id === group.id ? { ...item, enabled } : item),
    } : current);
    try {
      setCatalog(await setAgentToolGroupEnabled(presetCatalog, group.id, enabled, purpose));
    } catch {
      setCatalog((current) => current ? {
        ...current,
        groups: current.groups.map((item) => item.id === group.id ? { ...item, enabled: group.enabled } : item),
      } : current);
      onNotify?.('error', tUi("保存工具设置失败"));
    } finally {
      setChangingId('');
    }
  }

  function changeRoleplayPlan(roleplayPlan) {
    setCatalog((current) => current ? { ...current, roleplayPlan } : current);
  }

  async function saveRoleplayPlan(roleplayPlan) {
    if (savingRoleplayPlan) return;
    setSavingRoleplayPlan(true);
    try {
      setCatalog(await setRoleplayPlanSettings(presetCatalog, roleplayPlan));
      onNotify?.('success', tUi("角色扮演计划已保存"));
    } catch {
      onNotify?.('error', tUi("保存角色扮演计划失败"));
    } finally {
      setSavingRoleplayPlan(false);
    }
  }

  const content = <div className="agent-tools-content">
        {selected ? <ToolDetail
          group={selected}
          extra={selectedIsExtra}
          changing={changingId === selected.id}
          roleplayPlan={catalog?.roleplayPlan}
          savingRoleplayPlan={savingRoleplayPlan}
          onChange={(enabled) => changeEnabled(selected, enabled)}
          onNotify={onNotify}
          onOpenSubagentSettings={onClose}
          onRoleplayPlanChange={changeRoleplayPlan}
          onRoleplayPlanSave={saveRoleplayPlan}
        /> : selectedPlugin ? <div className="agent-tools-list">
          {selectedPlugin.tools.map(tool => <ToolRow key={tool.id} group={tool} extra={!tool.included} changing={changingId === tool.id} onOpen={() => setSelectedId(tool.id)} onChange={enabled => changeEnabled(tool, enabled)} />)}
        </div> : (
          <div className="agent-tools-list">
            {loading ? <p className="agent-tools-state">{tUi("正在读取工具")}</p> : [
              { id: 'preset', label: tUi("预设工具"), groups: sections.preset },
              { id: 'extra', label: tUi("额外工具"), groups: sections.extra },
            ].map(section => section.groups.length ? <section className="agent-tools-membership" key={section.id}>
              <h3>{section.label}</h3>
              {section.groups.map(group => <ToolRow key={group.id} group={group} extra={section.id === 'extra'} changing={changingId === group.id} onOpen={() => setSelectedId(group.id)} onChange={enabled => changeEnabled(group, enabled)} />)}
            </section> : null)}
            {!loading && !catalog?.groups.length && !catalog?.extraGroups?.length ? <p className="agent-tools-state">{tUi("当前预设还没有添加工具")}</p> : null}
          </div>
        )}
      </div>;
  const manage = <button type="button" className="agent-tools-manage" onClick={() => { onClose(); onManage?.(); }}>{tUi("管理预设工具 ")}<ArrowRight aria-hidden="true" /></button>;
  if (mobile) return <MobileConversationOverlay title={selected?.name || selectedPlugin?.name || tUi("工具")} className="mobile-agent-tools" onClose={onClose}
    onBack={selectedId ? goBack : undefined} footer={manage}>
    <MobileOverlayScroll key={selectedId || 'list'} scrollKey={selectedId || 'list'} positions={scrollPositions} direction={selectedId ? 'forward' : 'back'}>{content}</MobileOverlayScroll>
  </MobileConversationOverlay>;
  return createPortal(<SystemBarOverlay className="agent-tools-backdrop" role="presentation" onMouseDown={onClose}>
    <section className={`agent-tools-dialog`} role="dialog" aria-modal="true" aria-label={tUi("预设工具")} onMouseDown={(event) => event.stopPropagation()}>
      <header>
        {selectedId ? <button type="button" onClick={goBack} aria-label={tUi("返回工具列表")}><ArrowLeft /></button> : <span />}
        <h2>{selectedPlugin?.name || selected?.name || tUi("预设工具")}</h2>
        <button type="button" onClick={onClose} aria-label={tUi("关闭")}><X /></button>
      </header>
      {content}
      <footer>
        <button type="button" className="agent-tools-manage" onClick={() => { onClose(); onManage?.(); }}>
          {tUi("管理预设工具 ")}<ArrowRight aria-hidden="true" />
        </button>
      </footer>
    </section>
  </SystemBarOverlay>, document.body);
}

function ToolRow({ group, extra = false, changing, onOpen, onChange }) {
  const tUi = useProductTranslation();
  return <div className={`agent-tool-row${group.enabled ? ' enabled' : ''}`}>
    <button type="button" className="agent-tool-open" onClick={onOpen}>
      <span className="agent-tool-icon"><AgentToolGroupIcon groupId={group.id} /></span>
      <strong>{group.name}{group.available === false && <small>{tUi("缺少插件或工具未加载")}</small>}</strong>
      <CaretRight className="agent-tool-caret" />
    </button>
    {group.isPlugin ? <span className="agent-tool-extra-state">{group.included ? `${group.includedCount}/${group.tools.length}` : group.tools.length}</span> : extra ? <span className="agent-tool-extra-state">{tUi("已启用")}</span> : <ToolSwitch name={group.name} checked={group.enabled} disabled={changing} onChange={onChange} />}
  </div>;
}

function ToolDetail({
  group,
  extra = false,
  changing,
  roleplayPlan,
  savingRoleplayPlan,
  onChange,
  onNotify,
  onOpenSubagentSettings,
  onRoleplayPlanChange,
  onRoleplayPlanSave,
}) {
  const tUi = useProductTranslation();
  return <div className="agent-tool-detail">
    {group.available === false && <p className="agent-tool-detail-description">{tUi("缺少插件或工具未加载，仍可正常聊天。")}</p>}
    {!extra && <div className="agent-tool-detail-switch">
      <strong>{tUi("启用此工具组")}</strong>
      <ToolSwitch name={group.name} checked={group.enabled} disabled={changing} onChange={onChange} />
    </div>}
    {group.description ? <p className="agent-tool-detail-description">{group.description}</p> : null}
    {group.id === 'builtin:collaboration' ? <SubagentSettingsLink
      onOpen={onOpenSubagentSettings}
      onNotify={onNotify}
    /> : null}
    {group.id === 'builtin:web' ? <div className="agent-tool-web-config"><WebSearchSettings onOpenPluginSettings={onOpenSubagentSettings} /></div> : <>
      {group.id === 'builtin:roleplay-workflow' ? <RoleplayPlanEditor
        value={roleplayPlan}
        saving={savingRoleplayPlan}
        onChange={onRoleplayPlanChange}
        onSave={onRoleplayPlanSave}
      /> : <>
        <h3>{group.members.length ? tUi("包含 {value0} 个工具", {value0: group.members.length}) : tUi("工具")}</h3>
        <div className="agent-tool-members">
          {group.members.length ? group.members.map((member) => <div key={member.name}>
            <code>{member.name}</code>
            {member.description ? <small>{member.description}</small> : null}
          </div>) : <p>{tUi("此工具组没有独立调用项")}</p>}
        </div>
        <h3>{tUi("来源")}</h3>
        <div className="agent-tool-source">
          <span className="agent-tool-icon"><AgentToolGroupIcon groupId={group.id} /></span>
          <span>{group.source === 'built_in' ? tUi("ElecKoi 内置") : group.source === 'mcp' ? tUi("MCP 服务器") : group.plugin?.name || tUi("插件来源未声明")}</span>
        </div>
      </>}
    </>}
  </div>;
}

function ToolSwitch({ name, checked, disabled, onChange }) {
  const tUi = useProductTranslation();
  return <button
    type="button"
    className="agent-tool-switch"
    role="switch"
    aria-checked={checked}
    aria-label={tUi("{value0}工具开关", {value0: name})}
    disabled={disabled}
    onClick={() => onChange(!checked)}
  ><span /></button>;
}

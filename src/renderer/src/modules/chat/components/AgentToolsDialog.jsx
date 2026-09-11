import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, CaretRight, X } from '@phosphor-icons/react';
import { AgentToolGroupIcon } from '../../../ui/icons/index.jsx';
import { RoleplayPlanEditor, SubagentModelSelect, WebSearchSettings } from '../../agentTools/index.js';
import { loadAgentTools, setAgentToolGroupEnabled, setRoleplayPlanSettings, setSubagentModelSelection } from '../api/agentToolsApi.js';

export function AgentToolsDialog({
  modelConfigs = [],
  modelOptionsByKey,
  onLoadModels,
  onSaveModelConfig,
  onClose,
  onManage,
  onNotify,
}) {
  const [catalog, setCatalog] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState('');
  const [savingSubagentModel, setSavingSubagentModel] = useState(false);
  const [savingRoleplayPlan, setSavingRoleplayPlan] = useState(false);
  const selected = catalog?.groups.find((item) => item.id === selectedId);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadAgentTools()
      .then((value) => { if (active) setCatalog(value); })
      .catch(() => { if (active) onNotify?.('error', '读取工具失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onNotify]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (selectedId) setSelectedId('');
      else onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, selectedId]);

  async function changeEnabled(group, enabled) {
    if (changingId) return;
    setChangingId(group.id);
    setCatalog((current) => current ? {
      ...current,
      groups: current.groups.map((item) => item.id === group.id ? { ...item, enabled } : item),
    } : current);
    try {
      setCatalog(await setAgentToolGroupEnabled(group.id, enabled));
    } catch {
      setCatalog((current) => current ? {
        ...current,
        groups: current.groups.map((item) => item.id === group.id ? { ...item, enabled: group.enabled } : item),
      } : current);
      onNotify?.('error', '保存工具设置失败');
    } finally {
      setChangingId('');
    }
  }

  async function changeSubagentModel(selection) {
    if (savingSubagentModel) return;
    setSavingSubagentModel(true);
    const previous = catalog?.subagentModelSelection;
    setCatalog((current) => current ? { ...current, subagentModelSelection: selection } : current);
    try {
      setCatalog(await setSubagentModelSelection(selection));
    } catch {
      setCatalog((current) => current ? { ...current, subagentModelSelection: previous } : current);
      onNotify?.('error', '保存子 Agent 模型失败');
    } finally {
      setSavingSubagentModel(false);
    }
  }

  function changeRoleplayPlan(roleplayPlan) {
    setCatalog((current) => current ? { ...current, roleplayPlan } : current);
  }

  async function saveRoleplayPlan(roleplayPlan) {
    if (savingRoleplayPlan) return;
    setSavingRoleplayPlan(true);
    try {
      setCatalog(await setRoleplayPlanSettings(roleplayPlan));
      onNotify?.('success', '角色扮演计划已保存');
    } catch {
      onNotify?.('error', '保存角色扮演计划失败');
    } finally {
      setSavingRoleplayPlan(false);
    }
  }

  return createPortal(<div className="agent-tools-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="agent-tools-dialog" role="dialog" aria-modal="true" aria-label="预设工具" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        {selected ? <button type="button" onClick={() => setSelectedId('')} aria-label="返回工具列表"><ArrowLeft /></button> : <span />}
        <h2>预设工具</h2>
        <button type="button" onClick={onClose} aria-label="关闭"><X /></button>
      </header>
      <div className="agent-tools-content">
        {selected ? <ToolDetail
          group={selected}
          changing={changingId === selected.id}
          modelConfigs={modelConfigs.length ? modelConfigs : catalog?.modelConfigs || []}
          modelOptionsByKey={modelOptionsByKey}
          subagentModelSelection={catalog?.subagentModelSelection || { configId: '', model: '' }}
          savingSubagentModel={savingSubagentModel}
          roleplayPlan={catalog?.roleplayPlan}
          savingRoleplayPlan={savingRoleplayPlan}
          onChange={(enabled) => changeEnabled(selected, enabled)}
          onLoadModels={onLoadModels}
          onSaveModelConfig={onSaveModelConfig}
          onNotify={onNotify}
          onSubagentModelChange={changeSubagentModel}
          onRoleplayPlanChange={changeRoleplayPlan}
          onRoleplayPlanSave={saveRoleplayPlan}
        /> : (
          <div className="agent-tools-list">
            {loading ? <p className="agent-tools-state">正在读取工具</p> : catalog?.groups.map((group) => (
              <ToolRow key={group.id} group={group} changing={changingId === group.id} onOpen={() => setSelectedId(group.id)} onChange={(enabled) => changeEnabled(group, enabled)} />
            ))}
            {!loading && !catalog?.groups.length ? <p className="agent-tools-state">当前预设还没有添加工具</p> : null}
          </div>
        )}
      </div>
      <footer>
        <button type="button" className="agent-tools-manage" onClick={() => { onClose(); onManage?.(); }}>
          管理预设工具 <ArrowRight aria-hidden="true" />
        </button>
      </footer>
    </section>
  </div>, document.body);
}

function ToolRow({ group, changing, onOpen, onChange }) {
  return <div className={`agent-tool-row${group.enabled ? ' enabled' : ''}`}>
    <button type="button" className="agent-tool-open" onClick={onOpen}>
      <span className="agent-tool-icon"><AgentToolGroupIcon groupId={group.id} /></span>
      <strong>{group.name}</strong>
      <CaretRight className="agent-tool-caret" />
    </button>
    <ToolSwitch name={group.name} checked={group.enabled} disabled={changing} onChange={onChange} />
  </div>;
}

function ToolDetail({
  group,
  changing,
  modelConfigs,
  modelOptionsByKey,
  subagentModelSelection,
  savingSubagentModel,
  roleplayPlan,
  savingRoleplayPlan,
  onChange,
  onLoadModels,
  onSaveModelConfig,
  onNotify,
  onSubagentModelChange,
  onRoleplayPlanChange,
  onRoleplayPlanSave,
}) {
  return <div className="agent-tool-detail">
    <div className="agent-tool-detail-switch">
      <strong>启用此工具组</strong>
      <ToolSwitch name={group.name} checked={group.enabled} disabled={changing} onChange={onChange} />
    </div>
    {group.description ? <p className="agent-tool-detail-description">{group.description}</p> : null}
    {group.id === 'builtin:collaboration' ? <SubagentModelSelect
      configs={modelConfigs}
      selection={subagentModelSelection}
      modelOptionsByKey={modelOptionsByKey}
      disabled={savingSubagentModel}
      onChange={onSubagentModelChange}
      onLoadModels={onLoadModels}
      onSaveModelConfig={onSaveModelConfig}
      onNotify={onNotify}
    /> : null}
    {group.id === 'builtin:web' ? <div className="agent-tool-web-config"><WebSearchSettings /></div> : <>
      {group.id === 'builtin:roleplay-workflow' ? <RoleplayPlanEditor
        value={roleplayPlan}
        saving={savingRoleplayPlan}
        onChange={onRoleplayPlanChange}
        onSave={onRoleplayPlanSave}
      /> : <>
        <h3>{group.members.length ? `包含 ${group.members.length} 个工具` : '工具'}</h3>
        <div className="agent-tool-members">
          {group.members.length ? group.members.map((member) => <div key={member.name}>
            <code>{member.name}</code>
            {member.description ? <small>{member.description}</small> : null}
          </div>) : <p>此工具组没有独立调用项</p>}
        </div>
        <h3>来源</h3>
        <div className="agent-tool-source">
          <span className="agent-tool-icon"><AgentToolGroupIcon groupId={group.id} /></span>
          <span>{group.source === 'built_in' ? 'ElecKoi 内置' : group.source === 'mcp' ? 'MCP 服务器' : '扩展'}</span>
        </div>
      </>}
    </>}
  </div>;
}

function ToolSwitch({ name, checked, disabled, onChange }) {
  return <button
    type="button"
    className="agent-tool-switch"
    role="switch"
    aria-checked={checked}
    aria-label={`${name}工具开关`}
    disabled={disabled}
    onClick={() => onChange(!checked)}
  ><span /></button>;
}

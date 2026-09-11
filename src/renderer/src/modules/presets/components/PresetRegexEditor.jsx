import { useMemo, useState } from 'react';
import { Copy, FileCode, MagnifyingGlass, NotePencil, Plus } from '@phosphor-icons/react';
import { TrashIcon } from '../../../ui/icons/index.jsx';
import { RegexRuleInspector, newRegexId } from '../../regex/index.js';
import { PresetContextMenu, usePresetContextMenu } from './PresetContextMenu.jsx';

export function PresetRegexEditor({ preset, onChange, saveAction }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const context = usePresetContextMenu();
  const visible = useMemo(() => {
    const key = query.trim().toLocaleLowerCase();
    return preset.regexRules.filter((rule) => !key || `${rule.name} ${rule.pattern} ${rule.replacement}`.toLocaleLowerCase().includes(key));
  }, [preset.regexRules, query]);
  const selected = preset.regexRules.find((rule) => rule.id === selectedId);

  function addRule() {
    const rule = {
      id: newRegexId(), name: '未命名规则', pattern: '', replacement: '', targets: ['AiOutput'],
      enabled: true, displayOnly: false, promptOnly: false, runOnEdit: false, order: 0,
    };
    onChange({ ...preset, regexRules: [rule, ...preset.regexRules].map((item, order) => ({ ...item, order })) });
    setSelectedId(rule.id);
    setQuery('');
  }

  function updateRule(patch) {
    onChange({ ...preset, regexRules: preset.regexRules.map((rule) => rule.id === selectedId ? { ...rule, ...patch } : rule) });
  }

  function deleteRule(id) {
    onChange({ ...preset, regexRules: preset.regexRules.filter((rule) => rule.id !== id).map((rule, order) => ({ ...rule, order })) });
    if (selectedId === id) setSelectedId('');
  }

  function duplicateRule(rule) {
    const copy = { ...rule, id: newRegexId(), name: `${rule.name || '未命名规则'} 副本` };
    const index = preset.regexRules.findIndex((item) => item.id === rule.id);
    const rules = [...preset.regexRules];
    rules.splice(index + 1, 0, copy);
    onChange({ ...preset, regexRules: rules.map((item, order) => ({ ...item, order })) });
    setSelectedId(copy.id);
    setQuery('');
  }

  return (
    <section className="preset-regex-editor" aria-label="预设正则">
      <div className="preset-regex-browser">
        <div className="preset-subtoolbar">
          <label><MagnifyingGlass size={15} /><input value={query} placeholder="搜索正则" aria-label="搜索正则" onChange={(event) => setQuery(event.target.value)} /></label>
          <button type="button" onClick={addRule}><Plus size={16} />新建</button>
          {saveAction}
        </div>
        <div className="preset-regex-list" tabIndex={0} aria-label="预设正则列表" onContextMenu={(event) => context.open(event)}>
          {visible.map((rule) => <div className={`preset-regex-row${selectedId === rule.id ? ' is-selected' : ''}${rule.enabled ? '' : ' is-disabled'}`} key={rule.id} onContextMenu={(event) => context.open(event, rule)}>
            <button type="button" className="preset-regex-open" onClick={() => setSelectedId(rule.id)}>
              <FileCode size={18} aria-hidden="true" /><span>{rule.name || '未命名规则'}</span>
            </button>
            <button type="button" className="preset-regex-enabled" role="switch" aria-checked={rule.enabled} aria-label={`${rule.name}启用状态`} onClick={(event) => { event.stopPropagation(); updateRuleForId(preset, onChange, rule.id, { enabled: !rule.enabled }); }}><i /></button>
          </div>)}
          {!visible.length ? <p className="setting-library-empty">{query ? '没有匹配的规则' : '还没有预设正则'}</p> : null}
        </div>
      </div>
      {selected ? <RegexRuleInspector
        scope="AgentPreset"
        scopeLocked
        rule={selected}
        onChange={updateRule}
        onMoveScope={() => {}}
        onClose={() => setSelectedId('')}
        onDuplicate={() => duplicateRule(selected)}
        onDelete={() => deleteRule(selected.id)}
      /> : null}
      {context.menu ? <PresetContextMenu menu={context.menu} onClose={context.close} actions={context.menu.target ? [
        { label: '编辑', icon: NotePencil, run: () => setSelectedId(context.menu.target.id) },
        { label: '复制', icon: Copy, run: () => duplicateRule(context.menu.target) },
        { label: '删除', icon: TrashIcon, danger: true, run: () => deleteRule(context.menu.target.id) },
      ] : [{ label: '新建正则', icon: Plus, run: addRule }]} /> : null}
    </section>
  );
}

function updateRuleForId(preset, onChange, id, patch) {
  onChange({ ...preset, regexRules: preset.regexRules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule) });
}

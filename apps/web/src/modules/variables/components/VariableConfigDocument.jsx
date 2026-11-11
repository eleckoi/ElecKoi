import { useState } from 'react';
import { Button, Input, Menu, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretDown, Copy, DotsThree, Trash } from '../../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import { MarkdownTextareaField } from '../../settingLibraries/index.js';
import { generatedInitialStatePreviewJson, generatedObjectStateJson } from '../../../../../../packages/shared/src/foundation/variables/initialState.ts';
import { VariableEntryIcon, VariableGroupIcon, VARIABLE_INITIALIZATION_OBJECT_ID } from './VariableConfigTree.jsx';
import { variablePointerPath } from '../model/variableConfigEditing.js';
import { reportFailure } from '../../../utils/failureText.js';

const TYPES = [
  { value: 'number', label: '数值', description: '整数或小数，例如 20、3.5。' },
  { value: 'string', label: '文字', description: '保存文字状态或描述，例如「平静」。' },
  { value: 'boolean', label: '布尔值', description: '只有「是 / 否」两种状态。' },
  { value: 'object', label: '对象', description: '包含多个子变量，会转换为变量组。' },
  { value: 'array', label: '数组', description: '按顺序保存多个值，例如随身物品清单。' },
  { value: 'null', label: '空值', description: '明确表示没有值。' },
];

function Field({ label, children, top = false, className = '' }) {
  return <div className={`vv-field${top ? ' is-top' : ''} ${className}`}><span className="vv-label">{label}</span><div className="vv-control">{children}</div></div>;
}

function WritingInput({ label, value, onChange, placeholder, code = false, className = '', status, disabled }) {
  const tUi = useProductTranslation();
  const [immersionHost, setImmersionHost] = useState(null);
  const count = tUi('{value0} 字符', { value0: value.length });
  return <div className={`vv-long-input ${className}`} role="group" aria-label={tUi('{value0}输入区', { value0: label })}>
    <MarkdownTextareaField label={label} value={value} onChange={onChange} placeholder={placeholder} code={code} preview={false} immersiveHost={immersionHost} disabled={disabled} />
    <footer className="vv-input-footer"><span>{status || count}</span><div className="setting-footer-tools">{status && <span>{count}</span>}<div className="setting-immersive-host" ref={setImmersionHost} /></div></footer>
  </div>;
}

export function VariableConfigDocument({ config, selected, nameInputRef, onChange, onReplaceContents, onConvert, onDelete, onCopy, dirty, saving }) {
  const tUi = useProductTranslation();
  const current = selected.value, fixed = current.id === VARIABLE_INITIALIZATION_OBJECT_ID, group = selected.kind === 'object';
  const [view, setView] = useState(fixed ? 'preview' : 'properties'), [typeOpen, setTypeOpen] = useState(false), [moreOpen, setMoreOpen] = useState(false);
  const [json, setJson] = useState(() => group && !fixed ? generatedObjectStateJson(current.id, config.objects, config.variables) : ''), [jsonError, setJsonError] = useState(null);
  const title = fixed ? tUi('变量运行配置') : group ? current.name : current.title, path = variablePointerPath(config, selected);
  const tabs = fixed ? [{ value: 'preview', label: tUi('初始状态') }, { value: 'schema', label: tUi('校验规则') }] : [{ value: 'properties', label: tUi('基本信息') }, { value: 'json', label: tUi('对象内容') }];
  const selectedType = TYPES.find(type => type.value === current.type), isText = view !== 'properties';
  const raw = view === 'preview' ? generatedInitialStatePreviewJson(config.objects, config.variables) : view === 'schema' ? config.schemaCode : json;
  const update = patch => !saving && onChange({ ...config, [group ? 'objects' : 'variables']: config[group ? 'objects' : 'variables'].map(item => item.id === current.id ? { ...item, ...patch } : item) });
  return <>
    <header className="setting-entry-heading"><div className="setting-document-heading">
      <div className="setting-document-title">{group ? <VariableGroupIcon initialization={fixed} size={21} /> : <VariableEntryIcon type={current.type} size={21} />}
        <input ref={nameInputRef} aria-label={tUi('当前变量名称')} value={title} readOnly={fixed} disabled={saving} onChange={event => update(group ? { name: event.target.value } : { title: event.target.value })} /></div>
      <div className="setting-document-actions">{!fixed && <Menu portal dense open={moreOpen} onClose={() => setMoreOpen(false)} anchor={<Button data-dsh-control variant="outline" className="setting-folder-more" icon={<DotsThree size={18} />} aria-label={tUi('当前变量操作')} aria-haspopup="menu" aria-expanded={moreOpen} disabled={saving} onClick={() => setMoreOpen(!moreOpen)} />}
        items={[{ id: 'copy', label: group ? tUi('复制变量组') : tUi('复制变量'), icon: <Copy size={15} /> }, { id: 'delete', label: group ? tUi('删除变量组') : tUi('删除变量'), icon: <Trash size={15} />, danger: true }]}
        onSelect={id => { setMoreOpen(false); id === 'delete' ? onDelete() : onCopy(); }} />}</div>
    </div>{group && <div className="setting-editor-tools" role="toolbar" aria-label={tUi('变量编辑操作')}>
      <SegmentedTabs size="sm" label={tUi('变量编辑视图')} value={view} onChange={next => { setView(next); setJsonError(null); }} items={tabs} />
      <div className="vv-tools">{view === 'json' && <Button data-dsh-control variant="outline" disabled={saving} onClick={() => { try { onReplaceContents(current.id, json); setJsonError(null); } catch (cause) { setJsonError(cause); } }}>{tUi('应用结构')}</Button>}</div>
    </div>}</header>
    {!isText ? <div className="setting-settings-board vv-properties"><h2>{tUi('基本信息')}</h2><div className={`vv-fields${group ? ' is-group' : ' is-variable'}`}>
      <Field label={tUi('名称')}><Input data-dsh-control className="vv-input" aria-label={group ? tUi('变量组名称') : tUi('变量名称')} value={title} disabled={saving} onChange={event => update(group ? { name: event.target.value } : { title: event.target.value })} /></Field>
      <Field label={tUi('路径')}><div className="vv-path"><code title={path}>{path}</code><Button data-dsh-control variant="ghost" icon={<Copy size={14} />} title={tUi('复制路径')} aria-label={tUi('复制路径')} onClick={() => { void navigator.clipboard?.writeText(path).catch(cause => reportFailure(cause, '复制变量路径')); }} /></div></Field>
      {!group && <>
        <Field label={tUi('数据结构')} top><Menu portal dense listClassName="vv-type-menu" open={typeOpen} selectedId={current.type} onClose={() => setTypeOpen(false)} anchor={<Button data-dsh-control variant="outline" className="vv-type" aria-label={tUi('数据结构')} aria-haspopup="menu" aria-expanded={typeOpen} disabled={saving} onClick={() => setTypeOpen(!typeOpen)}><VariableEntryIcon type={current.type} size={16} /><span>{tUi(selectedType?.label || '选择类型')}</span><CaretDown size={13} /></Button>}
          items={TYPES.map(type => ({ id: type.value, label: <span className="vv-type-option" data-variable-type={type.value}><span>{tUi(type.label)}<code>{type.value}</code></span><small>{tUi(type.description)}</small></span>, icon: <VariableEntryIcon type={type.value} size={16} /> }))}
          onSelect={type => { setTypeOpen(false); if (!saving) type === 'object' ? onConvert(current.id) : update({ type, ...(type === 'null' ? { defaultValue: 'null' } : {}) }); }} /><p className="vv-field-hint">{tUi(selectedType?.description || '选择这个变量要保存的内容类型。')}</p></Field>
        <Field label={tUi('默认值')} top={current.type === 'array'}>{current.type === 'boolean' ? <SegmentedTabs size="sm" className="vv-short-tabs" label={tUi('默认值')} value={current.defaultValue || 'false'} onChange={value => update({ defaultValue: value })} items={[{ value: 'false', label: tUi('否') }, { value: 'true', label: tUi('是') }]} /> : current.type === 'array' ? <WritingInput className="vv-array-input" label={tUi('默认值')} value={current.defaultValue} onChange={defaultValue => update({ defaultValue })} code disabled={saving} /> : <Input data-dsh-control className={`vv-input${current.type === 'number' || current.type === 'null' ? ' is-short' : ''}`} aria-label={tUi('默认值')} type={current.type === 'number' ? 'number' : 'text'} readOnly={current.type === 'null'} value={current.type === 'null' ? 'null' : current.defaultValue} disabled={saving} onChange={event => update({ defaultValue: event.target.value })} />}</Field>
        <Field label={tUi('读取方式')}><SegmentedTabs size="sm" className="vv-read-mode" label={tUi('读取方式')} value={current.readMode} onChange={readMode => update({ readMode })} items={[{ value: 'required', label: tUi('必读') }, { value: 'on_demand', label: tUi('按需读取') }]} /></Field>
      </>}
      <Field label={tUi('说明')} top className="vv-long-field is-description"><WritingInput label={tUi('说明')} placeholder={group ? tUi('这个变量组保存什么信息') : tUi('这个变量表示什么')} value={current.description} onChange={description => update({ description })} disabled={saving} /></Field>
      <Field label={tUi('更新规则')} top className="vv-long-field is-rule"><WritingInput label={tUi('更新规则')} placeholder={group ? tUi('描述什么时候更新，以及怎样调整这个变量组。') : tUi('描述什么时候更新，以及怎样调整这个变量。')} value={current.updateRule} onChange={updateRule => update({ updateRule })} disabled={saving} /></Field>
    </div></div> : <div className="setting-writing-board vv-writing-board is-code">
      <FailureAlert failure={jsonError} className="vv-error" />
      {view === 'schema' && <p className="vv-code-hint">{tUi('使用 z.object(...) 定义结构和取值限制，无需 import。')}</p>}
      {view === 'preview' ? <><textarea aria-label={tUi('生成的初始状态')} className="vv-code-editor" value={raw} readOnly spellCheck={false} /><footer className="setting-editor-status"><span>{tUi('根据当前定义生成，只读预览')}</span><span>{tUi('{value0} 字符', { value0: raw.length })}</span></footer></> :
        <WritingInput className="vv-code-input" label={view === 'schema' ? tUi('变量总校验') : tUi('对象内容')} code value={raw} status={view === 'json' ? tUi('应用结构后加入待保存修改') : saving ? tUi('保存中…') : dirty ? tUi('未保存') : tUi('已保存')} disabled={saving} onChange={value => view === 'schema' ? onChange({ ...config, schemaCode: value }) : setJson(value)} />}
    </div>}
  </>;
}

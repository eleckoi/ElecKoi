import { useEffect, useRef, useState } from 'react';
import { Button, Input, Menu, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import { Copy, DotsThree, FileCode, Play, Trash } from '../../../ui/icons/interfaceIcons.jsx';
import { REGEX_TARGETS } from '../model/regexRulesEditing.js';
import { EditorField as Field, EditorSwitch as Switch } from '../../../ui/ui/EditorLibraryFields.jsx';
import { EditorWritingBoard as WritingBoard } from '../../settingLibraries/index.js';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';

export function RegexDocument({ item, onChange, onDuplicate, onDelete, dirty, busy, nameInputRef, scopes, scope, onMoveScope, onTest }) {
  const tUi = useProductTranslation();
  const [view, setView] = useState('edit'), [more, setMore] = useState(false);
  const [input, setInput] = useState('');
  const [target, setTarget] = useState('AiOutput'), [surface, setSurface] = useState('Display'), [variables, setVariables] = useState('null');
  const [output, setOutput] = useState(''), [error, setError] = useState(''), [tested, setTested] = useState(false);
  const [testing, setTesting] = useState(false), request = useRef(null);
  useEffect(() => () => request.current?.abort(), [item.id, item.pattern, item.replacement, item.targets, item.enabled, item.displayOnly, item.promptOnly, input, target, surface, variables, view]);
  async function run() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setTesting(true); setError('');
    try {
      const parsed = JSON.parse(variables);
      if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) throw Error(tUi("测试变量需要是 JSON 对象或 null。"));
      const result = await onTest(input, item, target, { surface, variablesJson: JSON.stringify(parsed) }, controller.signal);
      if (controller.signal.aborted) return;
      setOutput(result.output); setError(result.validationMessage || ''); setTested(true);
    } catch (cause) { if (!controller.signal.aborted) { setError(cause.message); setTested(false); } }
    finally { if (request.current === controller) setTesting(false); }
  }
  useEffect(() => { if (item.runOnEdit && input && view === 'test') { const timer = setTimeout(run, 220); return () => clearTimeout(timer); } }, [item.pattern, item.replacement, item.targets, item.enabled, item.displayOnly, item.promptOnly, item.runOnEdit, input, target, surface, variables, view]);
  return <>
    <header className="setting-entry-heading"><div className="setting-document-heading"><div className="setting-document-title"><FileCode size={21} /><input ref={nameInputRef} disabled={busy} aria-label={tUi("规则名称")} value={item.name} onChange={event => onChange({ name: event.target.value })} /></div>
      <Menu portal dense open={more} onClose={() => setMore(false)} anchor={<Button disabled={busy} data-dsh-control variant="outline" className="setting-folder-more" aria-label={tUi("当前规则操作")} icon={<DotsThree size={18} />} aria-haspopup="menu" aria-expanded={more} onClick={() => setMore(!more)} />} items={[{ id: 'copy', label: tUi("复制规则"), icon: <Copy size={15} /> }, ...(scopes || []).filter(value => value.id !== scope).map(value => ({ id: value.id, label: tUi('移至{value0}', { value0: value.label }) })), { id: 'delete', label: tUi("删除规则"), icon: <Trash size={15} />, danger: true }]} onSelect={id => { setMore(false); id === 'copy' ? onDuplicate() : id === 'delete' ? onDelete() : onMoveScope(id); }} />
    </div><div className="setting-editor-tools"><SegmentedTabs size="sm" className="rs-view-tabs" label={tUi("正则编辑视图")} value={view} onChange={setView} items={[{ value: 'edit', label: tUi("编辑") }, { value: 'test', label: tUi("测试") }]} />
      {view === 'test' && <Button disabled={testing || busy} data-dsh-control variant="outline" className="rs-run" icon={<Play size={14} />} onClick={run}>{testing ? tUi('运行中…') : tUi("运行测试")}</Button>}
    </div></header>
    {view === 'edit' ? <div className="rs-regex-edit">
      <div className="setting-settings-board rs-properties rs-regex-options"><h2>{tUi("基本信息")}</h2><div className="rs-fields">
        <Field label={tUi("名称")}><Input disabled={busy} data-dsh-control className="rs-input" aria-label={tUi("规则名称设置")} value={item.name} onChange={event => onChange({ name: event.target.value })} /></Field>
        <Field label={tUi("应用于")} top><div className="rs-check-grid">{REGEX_TARGETS.map(option => <label key={option.id}><input disabled={busy} type="checkbox" checked={item.targets.includes(option.id)} onChange={() => { const targets = new Set(item.targets); if (targets.has(option.id) && targets.size > 1) targets.delete(option.id); else targets.add(option.id); onChange({ targets: [...targets] }); }} />{tUi(option.label)}</label>)}</div></Field>
        <Field label={tUi("处理范围")} top><div className="rs-range-options"><label><Switch disabled={busy} label={tUi("修改界面显示")} checked={item.displayOnly} onChange={displayOnly => onChange({ displayOnly })} /><span>{tUi("修改界面显示")}</span></label><label><Switch disabled={busy} label={tUi("修改发送给 AI 的提示词")} checked={item.promptOnly} onChange={promptOnly => onChange({ promptOnly })} /><span>{tUi("修改发送给 AI 的提示词")}</span></label></div></Field>
      </div></div>
      <WritingBoard disabled={busy} label={tUi("匹配表达式")} value={item.pattern} placeholder="/pattern/g" onChange={pattern => onChange({ pattern })} mode={tUi("正则")} />
      <WritingBoard disabled={busy} label={tUi("替换内容")} value={item.replacement} placeholder={tUi("文字、HTML 或 EJS")} onChange={replacement => onChange({ replacement })} mode={tUi("文字 · HTML · EJS")} status={dirty ? tUi("未保存") : tUi("已保存")} />
    </div> : <div className="rs-test">
      <div className="rs-test-controls"><label>{tUi("测试对象")}<select disabled={busy} aria-label={tUi("测试对象")} value={target} onChange={event => setTarget(event.target.value)}>{REGEX_TARGETS.map(option => <option key={option.id} value={option.id}>{tUi(option.label)}</option>)}</select></label><label>{tUi("测试范围")}<select disabled={busy} aria-label={tUi("测试范围")} value={surface} onChange={event => setSurface(event.target.value)}><option value="Display">{tUi("界面显示")}</option><option value="Prompt">{tUi("发送给 AI 的提示词")}</option><option value="Stored">{tUi("保存内容")}</option></select></label><label className="rs-check"><input disabled={busy} type="checkbox" checked={item.runOnEdit} onChange={event => onChange({ runOnEdit: event.target.checked })} />{tUi("自动测试")}</label></div>
      <details className="rs-test-variables"><summary>{tUi("测试变量 JSON")}</summary><textarea aria-label={tUi("测试变量 JSON")} value={variables} onChange={event => setVariables(event.target.value)} spellCheck={false} /></details>
      {error && <p className="rs-error" role="alert">{error}</p>}
      <WritingBoard disabled={busy} label={tUi("测试输入")} value={input} onChange={setInput} code={false} />
      <WritingBoard disabled={busy} label={tUi("测试结果")} value={output} readOnly code={false} status={tested ? tUi("测试完成") : tUi("运行后查看替换结果")} />
    </div>}
  </>;
}

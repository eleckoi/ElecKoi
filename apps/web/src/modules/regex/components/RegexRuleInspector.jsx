import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { useEffect, useRef, useState } from "react";
import { Copy, Play, Trash, X } from "../../../ui/icons/interfaceIcons.jsx";
import { REGEX_SCOPES, REGEX_TARGETS } from "../model/regexRulesEditing.js";
import { MarkdownTextareaField } from '../../settingLibraries/index.js';
import { resolveFailure } from "../../../utils/failureText.js";

function Switch({ checked, onChange, label }) {
  return (
    <label className="regex-inline-switch">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

export function RegexRuleInspector({ scope, rule, scopes = REGEX_SCOPES, scopeLocked = false, onChange, onMoveScope, onClose, onDuplicate, onDelete, onTest }) {
  const [testInput, setTestInput] = useState("");
  const [testTarget, setTestTarget] = useState('AiOutput');
  const [testSurface, setTestSurface] = useState('Display');
  const [testVariables, setTestVariables] = useState('null');
  const [testOutput, setTestOutput] = useState("");
  const [testError, setTestError] = useState("");
  const [testing, setTesting] = useState(false);
  const testRequest = useRef(null);

  useEffect(() => () => testRequest.current?.abort(), [rule.id, rule.pattern, rule.replacement, rule.targets,
    rule.enabled, rule.displayOnly, rule.promptOnly, testInput, testTarget, testSurface, testVariables]);

  useEffect(() => {
    setTestInput("");
    setTestOutput("");
    setTestError("");
  }, [rule.id]);

  async function runTest() {
    testRequest.current?.abort();
    const controller = new AbortController(); testRequest.current = controller;
    setTesting(true);
    setTestError("");
    try {
      if (typeof onTest !== "function") throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "正则测试服务尚未就绪", { what: "正则测试服务" });
      const variables = JSON.parse(testVariables);
      if (variables !== null && (typeof variables !== 'object' || Array.isArray(variables))) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '测试变量必须是 JSON 对象或 null', { field: '测试变量' });
      const result = await onTest(testInput, rule, testTarget, { surface: testSurface, variablesJson: JSON.stringify(variables) }, controller.signal);
      if (controller.signal.aborted) return;
      setTestOutput(result.output);
      setTestError(result.validationMessage || "");
    } catch (error) {
      if (!controller.signal.aborted) setTestError(error?.message || "测试失败");
    } finally {
      if (testRequest.current === controller) setTesting(false);
    }
  }

  useEffect(() => {
    if (!rule.runOnEdit || !testInput) return undefined;
    const timeout = window.setTimeout(runTest, 220);
    return () => window.clearTimeout(timeout);
  }, [rule.pattern, rule.replacement, rule.targets, rule.enabled, rule.displayOnly, rule.promptOnly, rule.runOnEdit, testInput, testTarget, testSurface, testVariables]);

  function toggleTarget(target) {
    const selected = new Set(rule.targets);
    if (selected.has(target) && selected.size > 1) selected.delete(target);
    else selected.add(target);
    onChange({ targets: [...selected] });
  }

  return (
    <aside className="regex-inspector" aria-label="正则详情">
      <header className="regex-inspector-header">
        <strong>{rule.name.trim() || "未命名规则"}</strong>
        <button type="button" aria-label="关闭详情" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="regex-inspector-scroll">
        <label className="regex-field">
          <span>名称</span>
          <input value={rule.name} onChange={(event) => onChange({ name: event.target.value })} />
        </label>
        {!scopeLocked ? <label className="regex-field">
          <span>分类</span>
          <select value={scope} onChange={(event) => onMoveScope(event.target.value)}>
            {scopes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label> : null}
        <label className="regex-field">
          <span>匹配表达式</span>
          <textarea className="is-code" value={rule.pattern} spellCheck="false" placeholder="/pattern/g" onChange={(event) => onChange({ pattern: event.target.value })} />
        </label>
        <MarkdownTextareaField label="替换为" value={rule.replacement} preview={false} code
          placeholder="文字、HTML 或 EJS" onChange={replacement => onChange({ replacement })} />

        <fieldset className="regex-targets">
          <legend>应用于</legend>
          <div>
            {REGEX_TARGETS.map((target) => (
              <label key={target.id}>
                <input type="checkbox" checked={rule.targets.includes(target.id)} onChange={() => toggleTarget(target.id)} />
                <span>{target.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="regex-behavior">
          <Switch checked={rule.displayOnly} label="仅修改显示内容" onChange={(checked) => onChange({ displayOnly: checked })} />
          <Switch checked={rule.promptOnly} label="仅修改提示词内容" onChange={(checked) => onChange({ promptOnly: checked })} />
          <Switch checked={rule.runOnEdit} label="编辑测试时自动运行" onChange={(checked) => onChange({ runOnEdit: checked })} />
        </div>

        <section className="regex-test" aria-label="测试正则">
          <div className="regex-test-heading">
            <strong>测试</strong>
            <Button data-dsh-control variant="primary" type="button" onClick={runTest} disabled={testing}><Play size={14} weight="fill" />{testing ? "运行中…" : "运行"}</Button>
          </div>
          <label className="regex-field"><span>测试对象</span><select value={testTarget} onChange={event => setTestTarget(event.target.value)}>
            {REGEX_TARGETS.map(target => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select></label>
          <label className="regex-field"><span>测试范围</span><select value={testSurface} onChange={event => setTestSurface(event.target.value)}>
            <option value="Display">显示内容</option><option value="Prompt">提示词内容</option><option value="Stored">保存内容</option>
          </select></label>
          <label className="regex-field"><span>输入</span><textarea value={testInput} onChange={(event) => setTestInput(event.target.value)} /></label>
          <label className="regex-field"><span>测试变量 JSON</span><textarea className="is-code" spellCheck="false" value={testVariables} onChange={event => setTestVariables(event.target.value)} /></label>
          <label className="regex-field"><span>结果</span><textarea value={testOutput} readOnly /></label>
          {testError ? <p className="regex-test-error" role="alert">{testError}</p> : null}
        </section>
      </div>
      <footer className="regex-inspector-footer">
        <Button data-dsh-control variant="outline" type="button" onClick={onDuplicate}><Copy size={15} />复制规则</Button>
        <Button data-dsh-control variant="outline" type="button" className="is-destructive" onClick={onDelete}><Trash size={15} />删除规则</Button>
      </footer>
    </aside>
  );
}

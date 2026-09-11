import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  CaretDown,
  CaretRight,
  Check,
  ClockCounterClockwise,
  Cube,
  Heart,
  Key,
  LinkSimple,
  MapTrifold,
  NoteBlank,
  ShieldCheck,
  Skull,
  Sparkle,
  SlidersHorizontal,
  UserCircle,
  UsersThree,
} from "@phosphor-icons/react";
import { ElecKoiPromptMarkerIcon, ElecKoiSettingEntryIcon } from "../../../ui/icons/elecKoiPromptIcons.jsx";
import { MarkdownTextareaField } from "./MarkdownTextareaField.jsx";
import {
  FIXED_ENTRY_IDS,
  SETTING_LIBRARY_POSITION_OPTIONS,
  moveEntryToPosition,
  positionOrderScope,
} from "../model/settingLibraryEditing.js";
import { commitKeywordDraft, splitKeywordDraft } from "../model/settingLibraryKeywords.js";
import { CustomPositionManager } from './CustomPositionManager.jsx';
import { positionPickerRows } from '../model/customPositions.js';

const EDITOR_SECTIONS = [
  { id: "base", label: "基础" },
  { id: "trigger", label: "触发" },
  { id: "content", label: "正文" },
  { id: "insert", label: "插入" },
];

const TRIGGER_MODES = [
  { value: "agent_tool", label: "Agent 读取" },
  { value: "always", label: "提示词常驻" },
];

const READ_STRATEGIES = [
  { value: "required", label: "必读" },
  { value: "keyword", label: "关键词" },
  { value: "normal", label: "按需" },
  { value: "variable_condition", label: "变量条件" },
];

const DYNAMIC_MODES = [
  { value: "single_condition", label: "单条条件" },
  { value: "ejs_controller", label: "EJS 控制器" },
];

const ICON_OPTIONS = [
  { id: "", label: "默认", Icon: ElecKoiSettingEntryIcon },
  { id: "character", label: "人物", Icon: UserCircle },
  { id: "world", label: "世界", Icon: BookOpenText },
  { id: "place", label: "地点", Icon: MapTrifold },
  { id: "rule", label: "规则", Icon: ShieldCheck },
  { id: "secret", label: "秘密", Icon: Key },
  { id: "faction", label: "组织", Icon: UsersThree },
  { id: "item", label: "物品", Icon: Cube },
  { id: "timeline", label: "时间线", Icon: ClockCounterClockwise },
  { id: "relation", label: "关系", Icon: Heart },
  { id: "power", label: "能力", Icon: Sparkle },
  { id: "danger", label: "危险", Icon: Skull },
  { id: "note", label: "笔记", Icon: NoteBlank },
];

const POSITION_LABEL = new Map(SETTING_LIBRARY_POSITION_OPTIONS.map((option) => [option.value, option.label]));

export function SettingEntryGlyph({ iconId, size = 17, ...props }) {
  const Icon = ICON_OPTIONS.find((option) => option.id === iconId)?.Icon || ElecKoiSettingEntryIcon;
  return <Icon size={size} {...props} />;
}

function SegmentedField({ label, value, options, onChange }) {
  return (
    <section className="setting-library-field-card">
      <span className="setting-library-field-label">{label}</span>
      <div className="setting-library-segmented" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
          >{option.label}</button>
        ))}
      </div>
    </section>
  );
}

function KeywordTagInput({ label, keywords, placeholder, onChange, compact = false }) {
  const labelId = useId();
  const inputRef = useRef(null);
  const [draft, setDraft] = useState("");

  function commit() {
    const next = commitKeywordDraft(keywords, draft);
    if (next.length !== keywords.length || next.some((value, index) => value !== keywords[index])) onChange(next);
    setDraft("");
  }

  function updateDraft(value) {
    const next = splitKeywordDraft(keywords, value);
    if (next.keywords !== keywords) onChange(next.keywords);
    setDraft(next.draft);
  }

  return (
    <div className={`${compact ? "setting-library-rule-input" : "setting-library-field-card setting-library-plain-field"} setting-library-keyword-field`}>
      <span id={labelId}>{label}</span>
      <span className="setting-library-keyword-input" onMouseDown={(event) => {
        if (event.target === event.currentTarget) inputRef.current?.focus();
      }}>
        {keywords.map((keyword) => (
          <span className="setting-library-keyword-tag" key={keyword}>
            <span>{keyword}</span>
            <button
              type="button"
              aria-label={`删除关键词 ${keyword}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChange(keywords.filter((item) => item !== keyword))}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          aria-labelledby={labelId}
          placeholder={keywords.length ? "继续输入" : placeholder}
          onChange={(event) => updateDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commit();
          }}
        />
      </span>
    </div>
  );
}

function SwitchRow({ title, description, checked, onChange }) {
  return (
    <label className="setting-library-rule-row">
      <span><strong>{title}</strong><small>{description}</small></span>
      <button
        type="button"
        className="setting-library-tree-switch"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
      ><span aria-hidden="true" /></button>
    </label>
  );
}

function NumberField({ label, description, value, min, max, onChange }) {
  const commit = (next) => onChange(Math.min(max, Math.max(min, Number.isFinite(next) ? next : min)));
  return (
    <label className="setting-library-number-row">
      <span><strong>{label}</strong><small>{description}</small></span>
      <span className="setting-library-number-control">
        <button type="button" aria-label={`${label}减一`} onClick={() => commit(value - 1)}>−</button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          aria-label={label}
          onChange={(event) => commit(Number.parseInt(event.target.value, 10))}
        />
        <button type="button" aria-label={`${label}加一`} onClick={() => commit(value + 1)}>＋</button>
      </span>
    </label>
  );
}

function BasicSection({ entry, nameInputRef, onChange }) {
  return (
    <div className="setting-library-entry-section">
      <label className="setting-library-field-card setting-library-title-field">
        <span>条目标题</span>
        <input ref={nameInputRef} value={entry.title} maxLength={60} placeholder="条目标题/待命名" onChange={(event) => onChange({ ...entry, title: event.target.value })} />
      </label>
      <section className="setting-library-field-card">
        <div className="setting-library-field-heading"><strong>条目图标</strong><span>可选</span></div>
        <div className="setting-library-icon-grid">
          {ICON_OPTIONS.map(({ id, label, Icon }) => (
            <button key={id || "default"} type="button" title={label} aria-label={label} aria-pressed={entry.iconId === id} onClick={() => onChange({ ...entry, iconId: id })}>
              <Icon size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function groupPath(groupId, groups) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const names = [];
  const visited = new Set();
  let current = byId.get(groupId);
  while (current && !visited.has(current.id) && names.length < 12) {
    visited.add(current.id);
    names.unshift(current.name || "未命名文件夹");
    current = byId.get(current.parentId);
  }
  return names;
}

function AgentDirectoryPreview({ currentEntryId, entries, groups }) {
  const items = useMemo(() => entries
    .filter((entry) => !FIXED_ENTRY_IDS.has(entry.id) && entry.enabled && entry.triggerMode === "agent_tool" && entry.dynamicMode !== "ejs_reference")
    .sort((left, right) => left.treeViewOrder - right.treeViewOrder)
    .map((entry) => ({ entry, path: [...groupPath(entry.groupId, groups), entry.title || "未命名设定"] })), [entries, groups]);
  return (
    <details className="setting-library-directory-preview">
      <summary><span><strong>AI 看到的目录</strong><small>{items.length} 条已启用</small></span><CaretDown size={15} /></summary>
      <div>
        {items.length ? items.map(({ entry, path }) => (
          <div className={entry.id === currentEntryId ? "is-current" : ""} key={entry.id}>
            <span>{path.join(" / ")}</span>
            <em>{READ_STRATEGIES.find((option) => option.value === entry.agentReadStrategy)?.label}</em>
          </div>
        )) : <p>还没有可供 Agent 读取的条目</p>}
      </div>
    </details>
  );
}

function KeywordRules({ entry, onChange }) {
  const effectiveCondition = !entry.conditionKeywords.length ? "none" : entry.keywordCondition === "none" ? "any" : entry.keywordCondition;
  return (
    <>
      <KeywordTagInput
        label="触发关键词"
        keywords={entry.keywords}
        placeholder="输入后按回车"
        onChange={(keywords) => onChange({ ...entry, keywords })}
      />
      <section className="setting-library-advanced-rules">
        <div className="setting-library-advanced-rules-heading"><strong>匹配规则</strong></div>
        <div className="setting-library-rule-stack">
          <h4>扫描范围</h4>
          <NumberField label="扫描深度" description={entry.keywordScanDepth <= 1 ? "只扫描用户最新消息" : `扫描最近 ${entry.keywordScanDepth} 条消息`} value={entry.keywordScanDepth} min={1} max={1000} onChange={(value) => onChange({ ...entry, keywordScanDepth: value })} />
          <SwitchRow title="递归匹配" description={entry.keywordRecursionDepth > 0 ? "正文继续关联其他关键词" : "只根据最近消息匹配"} checked={entry.keywordRecursionDepth > 0} onChange={(checked) => onChange({ ...entry, keywordRecursionDepth: checked ? 1 : 0 })} />
          {entry.keywordRecursionDepth > 0 ? <NumberField label="递归次数" description={`正文再匹配 ${entry.keywordRecursionDepth} 轮`} value={entry.keywordRecursionDepth} min={1} max={10} onChange={(value) => onChange({ ...entry, keywordRecursionDepth: value })} /> : null}
          <h4>附加条件</h4>
          <KeywordTagInput
            compact
            label="附加关键词"
            keywords={entry.conditionKeywords}
            placeholder="输入后按回车"
            onChange={(conditionKeywords) => onChange({
              ...entry,
              conditionKeywords,
              keywordCondition: conditionKeywords.length ? (entry.keywordCondition === "none" ? "any" : entry.keywordCondition) : "none",
            })}
          />
          <label className="setting-library-rule-input"><span>匹配要求</span><select value={effectiveCondition} onChange={(event) => onChange({ ...entry, keywordCondition: event.target.value })}>
            {!entry.conditionKeywords.length ? <option value="none">无需</option> : (
              <>
                <option value="any">任意命中</option>
                <option value="all">全部命中</option>
                <option value="not_any">排除命中</option>
              </>
            )}
          </select></label>
          <h4>匹配方式</h4>
          <SwitchRow title="正则表达式" description={entry.keywordUseRegex ? "按酒馆关键词正则规则匹配" : "按普通文本关键词匹配"} checked={entry.keywordUseRegex} onChange={(checked) => onChange({ ...entry, keywordUseRegex: checked })} />
          <SwitchRow title="忽略大小写" description={entry.keywordIgnoreCase ? "英文关键词不区分大小写" : "英文关键词区分大小写"} checked={entry.keywordIgnoreCase} onChange={(checked) => onChange({ ...entry, keywordIgnoreCase: checked })} />
          <SwitchRow title="完整词匹配" description={entry.keywordWholeWord ? "只匹配完整英文单词" : "允许匹配英文单词的一部分"} checked={entry.keywordWholeWord} onChange={(checked) => onChange({ ...entry, keywordWholeWord: checked })} />
        </div>
      </section>
    </>
  );
}

function TriggerSection({ entry, entries, groups, onChange }) {
  function setStrategy(agentReadStrategy) {
    onChange({
      ...entry,
      agentReadStrategy,
      dynamicMode: agentReadStrategy === "variable_condition" ? entry.dynamicMode : "single_condition",
    });
  }
  return (
    <div className="setting-library-entry-section">
      <SegmentedField label="触发方式" value={entry.triggerMode || "always"} options={TRIGGER_MODES} onChange={(triggerMode) => onChange({ ...entry, triggerMode })} />
      {entry.triggerMode === "agent_tool" ? (
        <>
          <SegmentedField label="读取策略" value={entry.agentReadStrategy} options={READ_STRATEGIES} onChange={setStrategy} />
          {entry.agentReadStrategy === "keyword" ? <KeywordRules entry={entry} onChange={onChange} /> : null}
          {entry.agentReadStrategy === "normal" ? (
            <label className="setting-library-field-card setting-library-text-field">
              <span>注释（AI 读目录时靠它判断）</span>
              <textarea value={entry.agentSelectionHint} maxLength={200} placeholder="写给 AI 看的一句话" onChange={(event) => onChange({ ...entry, agentSelectionHint: event.target.value })} />
            </label>
          ) : null}
          {entry.agentReadStrategy === "variable_condition" ? (
            <>
              <SegmentedField label="动态方式" value={entry.dynamicMode === "ejs_controller" ? "ejs_controller" : "single_condition"} options={DYNAMIC_MODES} onChange={(dynamicMode) => onChange({ ...entry, dynamicMode })} />
              {entry.dynamicMode !== "ejs_controller" ? (
                <label className="setting-library-field-card setting-library-text-field">
                  <span>变量条件</span>
                  <textarea value={entry.agentReadCondition} placeholder="getvar('剧情.已完成事件', { defaults: 0 }) >= 3" onChange={(event) => onChange({ ...entry, agentReadCondition: event.target.value })} />
                </label>
              ) : null}
            </>
          ) : null}
          <AgentDirectoryPreview currentEntryId={entry.id} entries={entries} groups={groups} />
        </>
      ) : null}
    </div>
  );
}

export function referencedEjsTitles(code) {
  const titles = new Set();
  const pattern = /getwi\s*\(\s*(?:(?:null|["'`][^"'`]*["'`])\s*,\s*)?(["'`])([^"'`]+)\1/gi;
  let match;
  while ((match = pattern.exec(code))) titles.add(match[2]);
  return titles;
}

function ContentSection({ entry, entries, onChange, onOpenEntry }) {
  const label = entry.dynamicMode === "ejs_controller" ? "EJS 代码" : "设定正文";
  const references = entry.dynamicMode === "ejs_controller"
    ? entries
      .filter((candidate) => candidate.dynamicMode === "ejs_reference" && referencedEjsTitles(entry.content).has(candidate.title))
      .sort((left, right) => left.treeViewOrder - right.treeViewOrder)
    : [];
  return (
    <div className={`setting-library-entry-section is-content-section${references.length ? " has-references" : ""}`}>
      <MarkdownTextareaField
        label={label}
        value={entry.content}
        placeholder={entry.dynamicMode === "ejs_controller" ? "使用 <% … %> 编写判断；可通过 getvar 读取变量、getwi 读取已开启的引用条目" : "写入世界观、人物背景、地点规则、隐藏信息等"}
        preview={entry.dynamicMode !== "ejs_controller"}
        onChange={(content) => onChange({ ...entry, content })}
      />
      {references.length ? (
        <section className="setting-library-reference-list">
          <div className="setting-library-reference-heading"><LinkSimple size={16} aria-hidden="true" /><strong>引用条目（{references.length}）</strong></div>
          {references.map((reference) => <button type="button" key={reference.id} onClick={() => onOpenEntry(reference.id)}>
            <LinkSimple size={17} aria-hidden="true" />
            <span>{reference.title}</span>
            <small>{reference.enabled ? "已开启" : "已关闭"}</small>
            <CaretRight size={15} aria-hidden="true" />
          </button>)}
        </section>
      ) : null}
    </div>
  );
}

function VisualPositionPicker({ entry, entries, promptPositions, onChange, onEntriesChange, onManagePositions }) {
  const scope = useMemo(() => entry.position ? positionOrderScope(entries, entry.position, entry.promptPositionId) : [], [entries, entry.position, entry.promptPositionId]);

  function setOrder(order) {
    const normalized = Math.max(1, order);
    const conflict = scope.some((candidate) => candidate.id !== entry.id && candidate.enabled && !FIXED_ENTRY_IDS.has(candidate.id) && candidate.order === normalized);
    onChange({ ...entry, order: normalized, enabled: conflict ? false : entry.enabled });
  }

  const conflict = scope.some((candidate) => candidate.id !== entry.id && candidate.enabled && !FIXED_ENTRY_IDS.has(candidate.id) && candidate.order === entry.order);
  return (
    <>
      <section className="setting-library-placement-card">
        <div className="setting-library-placement-heading"><strong>上下文位置</strong><button type="button" className="setting-library-position-manage" onClick={onManagePositions}><SlidersHorizontal size={14} />管理位置</button></div>
        <div className="setting-library-placement-rail">
          {positionPickerRows(promptPositions).map((row, index) => {
            if (row.type === 'custom') {
              const position = row.position;
              const selected = entry.promptPositionId === position.id;
              return <button type="button" className={`setting-library-placement-row is-custom${selected ? ' is-selected' : ''}`} key={position.id} aria-pressed={selected}
                onClick={() => onEntriesChange(moveEntryToPosition(entries, entry.id, position.anchor, position.id))}>
                <i>{selected ? <Check size={11} weight="bold" /> : null}</i><span className="setting-library-placement-choice"><span>{position.name || '未命名位置'}</span></span>
              </button>;
            }
            const selected = entry.position === row.value && !entry.promptPositionId;
            if (row.type === "context") return <div className="setting-library-placement-row is-context" key={`context-${row.id}`}><i /><span><ElecKoiPromptMarkerIcon />{row.label}</span></div>;
            return (
              <button
                type="button"
                className={`setting-library-placement-row${row.card ? " is-card" : ""}${selected ? " is-selected" : ""}`}
                key={`${row.value}-${index}`}
                aria-pressed={selected}
                onClick={() => onEntriesChange(moveEntryToPosition(entries, entry.id, row.value))}
              >
                <i>{selected ? <Check size={11} weight="bold" /> : null}</i>
                <span className="setting-library-placement-choice">
                  {row.card ? <ElecKoiPromptMarkerIcon /> : null}
                  <span>{POSITION_LABEL.get(row.value)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {entry.position === "instructions" && !entry.promptPositionId ? null : (
        <SegmentedField label="消息身份" value={entry.insertRole === "assistant" ? "assistant" : "user"} options={[{ value: "user", label: "用户" }, { value: "assistant", label: "AI" }]} onChange={(insertRole) => onChange({ ...entry, insertRole })} />
      )}

      <section className="setting-library-order-card">
        <NumberField label="位置内部排序" description="数字越小越靠前" value={entry.order} min={1} max={9999} onChange={setOrder} />
        {conflict ? <p className="setting-library-order-warning">当前位置已存在排序数字 {entry.order}，条目已关闭。</p> : null}
        <div className="setting-library-order-preview">
          <strong>当前位置顺序</strong>
          {scope.map((candidate) => <div className={candidate.id === entry.id ? "is-current" : ""} key={candidate.id}><b>{candidate.order}</b><span>{candidate.title || "待命名设定"}</span>{candidate.id === entry.id ? <em>当前</em> : null}</div>)}
        </div>
      </section>
    </>
  );
}

function InsertSection({ entry, entries, promptPositions, onChange, onEntriesChange, onManagePositions }) {
  if (entry.triggerMode === "agent_tool") {
    return <p className="setting-library-agent-insert-note">AI 读取后，正文直接作为工具结果返回，无需配置插入位置。</p>;
  }
  return (
    <div className="setting-library-entry-section">
      <VisualPositionPicker entry={entry} entries={entries} promptPositions={promptPositions} onChange={onChange} onEntriesChange={onEntriesChange} onManagePositions={onManagePositions} />
    </div>
  );
}

export function SettingLibraryEntryEditor({ entry, entries, groups, promptPositions = [], nameInputRef, onChange, onEntriesChange, onOpenEntry, onPromptPositionsChange = () => {} }) {
  const [section, setSection] = useState("base");
  const [managingPositions, setManagingPositions] = useState(false);
  const editorRef = useRef(null);
  const scrollTopRef = useRef(0);
  useEffect(() => { setSection("base"); setManagingPositions(false); }, [entry.id]);
  function openPositionManager() {
    const scroller = editorRef.current?.closest('.setting-library-inspector-body');
    scrollTopRef.current = scroller?.scrollTop || 0;
    if (scroller) scroller.scrollTop = 0;
    setManagingPositions(true);
    requestAnimationFrame(() => editorRef.current?.querySelector('.setting-position-back')?.focus({ preventScroll: true }));
  }
  function closePositionManager() {
    setManagingPositions(false);
    requestAnimationFrame(() => {
      const scroller = editorRef.current?.closest('.setting-library-inspector-body');
      if (scroller) scroller.scrollTop = scrollTopRef.current;
      editorRef.current?.querySelector('.setting-library-position-manage')?.focus({ preventScroll: true });
    });
  }
  if (managingPositions) return <div ref={editorRef} className="setting-library-normal-entry-editor is-position-manager"><CustomPositionManager entry={entry} positions={promptPositions} entries={entries} onChange={onPromptPositionsChange} onBack={closePositionManager} /></div>;
  return (
    <div ref={editorRef} className="setting-library-normal-entry-editor">
      <nav className="setting-library-entry-tabs" aria-label="设定编辑区域">
        {EDITOR_SECTIONS.map((item, index) => (
          <button key={item.id} type="button" aria-current={section === item.id ? "step" : undefined} onClick={() => setSection(item.id)}>
            <span>{index + 1}</span>{item.id === "content" && entry.dynamicMode === "ejs_controller" ? "EJS 代码" : item.label}
          </button>
        ))}
      </nav>
      {section === "base" ? <BasicSection entry={entry} nameInputRef={nameInputRef} onChange={onChange} /> : null}
      {section === "trigger" ? <TriggerSection entry={entry} entries={entries} groups={groups} onChange={onChange} /> : null}
      {section === "content" ? <ContentSection entry={entry} entries={entries} onChange={onChange} onOpenEntry={onOpenEntry} /> : null}
      {section === "insert" ? <InsertSection entry={entry} entries={entries} promptPositions={promptPositions} onChange={onChange} onEntriesChange={onEntriesChange} onManagePositions={openPositionManager} /> : null}
    </div>
  );
}

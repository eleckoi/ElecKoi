import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  CaretRight,
  Check,
  ClockCounterClockwise,
  Cube,
  Database,
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
} from "../../../ui/icons/interfaceIcons.jsx";
import { ElecKoiSettingEntryIcon } from "../../../ui/icons/elecKoiPromptIcons.jsx";
import { MarkdownTextareaField } from "./MarkdownTextareaField.jsx";
import {
  FIXED_ENTRY_IDS,
  SETTING_LIBRARY_POSITION_OPTIONS,
  moveEntryToPosition,
  positionOrderScope,
} from "../model/settingLibraryEditing.js";
import { commitKeywordDraft, splitKeywordDraft } from "../model/settingLibraryKeywords.js";
import { CustomPositionManager, FixedPositionIcon } from './CustomPositionManager.jsx';
import { fixedPlacementRowSelectable, positionPickerRows } from '../model/customPositions.js';

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
  { value: "normal", label: "选读" },
];
const CONTENT_MODES = [
  { value: "plain_text", label: "文字" },
  { value: "ejs", label: "EJS" },
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
  { id: "database", label: "缓存", Icon: Database },
];

const POSITION_LABEL = new Map(SETTING_LIBRARY_POSITION_OPTIONS.map((option) => [option.value, option.label]));

export function SettingEntryGlyph({ iconId, size = 17, ...props }) {
  const tUi = useProductTranslation();
  const Icon = localizeUiCopy(ICON_OPTIONS, tUi).find((option) => option.id === iconId)?.Icon || ElecKoiSettingEntryIcon;
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
  const tUi = useProductTranslation();
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
              aria-label={tUi("删除关键词 {value0}", {value0: keyword})}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChange(keywords.filter((item) => item !== keyword))}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          enterKeyHint="enter"
          value={draft}
          aria-labelledby={labelId}
          placeholder={keywords.length ? tUi("继续输入") : placeholder}
          onChange={(event) => updateDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
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

function NumberField({ label, description, value, min, onChange }) {
  const tUi = useProductTranslation();
  const commit = (next) => onChange(Math.max(min, Number.isFinite(next) ? next : min));
  return (
    <label className="setting-library-number-row">
      <span><strong>{label}</strong><small>{description}</small></span>
      <span className="setting-library-number-control">
        <button type="button" aria-label={tUi("{value0}减一", {value0: label})} onClick={() => commit(value - 1)}>−</button>
        <input
          type="number"
          min={min}
          value={value}
          aria-label={label}
          onChange={(event) => commit(Number.parseInt(event.target.value, 10))}
        />
        <button type="button" aria-label={tUi("{value0}加一", {value0: label})} onClick={() => commit(value + 1)}>＋</button>
      </span>
    </label>
  );
}

function BasicSection({ entry, nameInputRef, onChange }) {
  const tUi = useProductTranslation();
  return (
    <div className="setting-library-entry-section">
      <label className="setting-library-field-card setting-library-title-field">
        <span>{tUi("条目标题")}</span>
        <input ref={nameInputRef} value={entry.title} placeholder={tUi("条目标题/待命名")} onChange={(event) => onChange({ ...entry, title: event.target.value })} />
      </label>
      <section className="setting-library-field-card">
        <div className="setting-library-field-heading"><strong>{tUi("条目图标")}</strong><span>{tUi("可选")}</span></div>
        <div className="setting-library-icon-grid">
          {localizeUiCopy(ICON_OPTIONS, tUi).map(({ id, label, Icon }) => (
            <button key={id || "default"} type="button" title={label} aria-label={label} aria-pressed={entry.iconId === id} onClick={() => onChange({ ...entry, iconId: id })}>
              <Icon size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function KeywordRules({ entry, onChange }) {
  const tUi = useProductTranslation();
  const effectiveCondition = !entry.conditionKeywords.length ? "none" : entry.keywordCondition === "none" ? "any" : entry.keywordCondition;
  return (
    <>
      <KeywordTagInput
        label={tUi("触发关键词")}
        keywords={entry.keywords}
        placeholder={tUi("输入后按回车")}
        onChange={(keywords) => onChange({ ...entry, keywords })}
      />
      <section className="setting-library-advanced-rules">
        <div className="setting-library-advanced-rules-heading"><strong>{tUi("匹配规则")}</strong></div>
        <div className="setting-library-rule-stack">
          <h4>{tUi("扫描范围")}</h4>
          <NumberField label={tUi("扫描深度")} description={entry.keywordScanDepth <= 1 ? tUi("只扫描用户最新消息") : tUi("扫描最近 {value0} 条消息", {value0: entry.keywordScanDepth})} value={entry.keywordScanDepth} min={1} onChange={(value) => onChange({ ...entry, keywordScanDepth: value })} />
          <SwitchRow title={tUi("递归匹配")} description={entry.keywordRecursionDepth > 0 ? tUi("正文继续关联其他关键词") : tUi("只根据最近消息匹配")} checked={entry.keywordRecursionDepth > 0} onChange={(checked) => onChange({ ...entry, keywordRecursionDepth: checked ? 1 : 0 })} />
          {entry.keywordRecursionDepth > 0 ? <NumberField label={tUi("递归次数")} description={tUi("正文再匹配 {value0} 轮", {value0: entry.keywordRecursionDepth})} value={entry.keywordRecursionDepth} min={1} onChange={(value) => onChange({ ...entry, keywordRecursionDepth: value })} /> : null}
          <h4>{tUi("附加条件")}</h4>
          <KeywordTagInput
            compact
            label={tUi("附加关键词")}
            keywords={entry.conditionKeywords}
            placeholder={tUi("输入后按回车")}
            onChange={(conditionKeywords) => onChange({
              ...entry,
              conditionKeywords,
              keywordCondition: conditionKeywords.length ? (entry.keywordCondition === "none" ? "any" : entry.keywordCondition) : "none",
            })}
          />
          <label className="setting-library-rule-input"><span>{tUi("匹配要求")}</span><select value={effectiveCondition} onChange={(event) => onChange({ ...entry, keywordCondition: event.target.value })}>
            {!entry.conditionKeywords.length ? <option value="none">{tUi("无需")}</option> : (
              <>
                <option value="any">{tUi("任意命中")}</option>
                <option value="all">{tUi("全部命中")}</option>
                <option value="not_any">{tUi("排除命中")}</option>
              </>
            )}
          </select></label>
          <h4>{tUi("匹配方式")}</h4>
          <SwitchRow title={tUi("正则表达式")} description={entry.keywordUseRegex ? tUi("按酒馆关键词正则规则匹配") : tUi("按普通文本关键词匹配")} checked={entry.keywordUseRegex} onChange={(checked) => onChange({ ...entry, keywordUseRegex: checked })} />
          <SwitchRow title={tUi("忽略大小写")} description={entry.keywordIgnoreCase ? tUi("英文关键词不区分大小写") : tUi("英文关键词区分大小写")} checked={entry.keywordIgnoreCase} onChange={(checked) => onChange({ ...entry, keywordIgnoreCase: checked })} />
          <SwitchRow title={tUi("完整词匹配")} description={entry.keywordWholeWord ? tUi("只匹配完整英文单词") : tUi("允许匹配英文单词的一部分")} checked={entry.keywordWholeWord} onChange={(checked) => onChange({ ...entry, keywordWholeWord: checked })} />
        </div>
      </section>
    </>
  );
}

function TriggerSection({ entry, onChange, creatorPreset }) {
  const tUi = useProductTranslation();
  function setStrategy(agentReadStrategy) {
    if (agentReadStrategy === "normal" && entry.agentReadStrategy === "keyword") return;
    onChange({ ...entry, agentReadStrategy,
      contentMode: agentReadStrategy === "required" ? "plain_text" : entry.contentMode });
  }
  return (
    <div className="setting-library-entry-section">
      <SegmentedField label={tUi("触发方式")} value={entry.triggerMode || "always"} options={localizeUiCopy(TRIGGER_MODES, tUi)} onChange={(triggerMode) => onChange({ ...entry, triggerMode,
        contentMode: triggerMode === "agent_tool" ? entry.contentMode : "plain_text" })} />
      {entry.triggerMode === "agent_tool" ? (
        <>
          <SegmentedField label={tUi("读取策略")} value={entry.agentReadStrategy === "required" ? "required" : "normal"} options={localizeUiCopy(READ_STRATEGIES, tUi)} onChange={setStrategy} />
          {entry.agentReadStrategy === "normal" && entry.contentMode === "plain_text" ? (
            <label className="setting-library-field-card setting-library-text-field">
              <span>{tUi("注释（AI 读目录时靠它判断）")}</span>
              <textarea value={entry.agentSelectionHint} placeholder={tUi("写给 AI 看的一句话")} onChange={(event) => onChange({ ...entry, agentSelectionHint: event.target.value })} />
            </label>
          ) : null}
          {!creatorPreset && entry.agentReadStrategy !== "required" ? (
            <section className="setting-library-field-card setting-library-keyword-card">
              <SwitchRow title={tUi("关键词命中")} description={entry.agentReadStrategy === "keyword" ? tUi("命中后列为本轮必读") : tUi("关闭时由 AI 选读")} checked={entry.agentReadStrategy === "keyword"} onChange={(enabled) => onChange({ ...entry, agentReadStrategy: enabled ? "keyword" : "normal" })} />
            </section>
          ) : null}
          {!creatorPreset && entry.agentReadStrategy === "keyword" ? <KeywordRules entry={entry} onChange={onChange} /> : null}
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

function ContentSection({ entry, entries, onChange, onOpenEntry, creatorPreset }) {
  const tUi = useProductTranslation();
  const ejs = entry.triggerMode === "agent_tool" && entry.agentReadStrategy !== "required" && entry.contentMode === "ejs";
  const label = tUi("设定正文");
  const references = ejs
    ? entries
      .filter((candidate) => candidate.dynamicMode === "ejs_reference" && referencedEjsTitles(entry.content).has(candidate.title))
      .sort((left, right) => left.treeViewOrder - right.treeViewOrder)
    : [];
  return (
    <div className={`setting-library-entry-section is-content-section${references.length ? " has-references" : ""}`}>
      <MarkdownTextareaField
        label={label}
        value={entry.content}
        placeholder={ejs ? tUi("填写 EJS 模板") : tUi("填写设定正文")}
        preview={!ejs}
        onChange={(content) => onChange({ ...entry, content })}
        labelAction={!creatorPreset && entry.triggerMode === "agent_tool" && entry.agentReadStrategy !== "required" ? (
          <div className="setting-library-content-mode" role="radiogroup" aria-label={tUi("正文格式")}>
            {localizeUiCopy(CONTENT_MODES, tUi).map((mode) => <button key={mode.value} type="button" role="radio" aria-checked={(ejs ? "ejs" : "plain_text") === mode.value}
              onClick={() => onChange({ ...entry, contentMode: mode.value })}>{mode.label}</button>)}
          </div>
        ) : null}
      />
      {references.length ? (
        <section className="setting-library-reference-list">
          <div className="setting-library-reference-heading"><LinkSimple size={16} aria-hidden="true" /><strong>{tUi("EJS引用设定（")}{references.length}）</strong></div>
          <div className="setting-library-reference-items">
            {references.map((reference) => <button type="button" key={reference.id} onClick={() => onOpenEntry(reference.id)}>
              <LinkSimple size={17} aria-hidden="true" />
              <span>{reference.title}</span>
              <small>{reference.enabled ? tUi("已开启") : tUi("已关闭")}</small>
              <CaretRight size={15} aria-hidden="true" />
            </button>)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function VisualPositionPicker({ entry, entries, promptPositions, allowCustomPromptPositions = false, onChange, onEntriesChange, onManagePositions }) {
  const tUi = useProductTranslation();
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
        <div className="setting-library-placement-heading"><strong>{tUi("插入位置")}</strong>{allowCustomPromptPositions ? <Button data-dsh-control variant="outline" type="button" className="setting-library-position-manage" onClick={onManagePositions}><SlidersHorizontal size={14} />{tUi("管理位置")}</Button> : null}</div>
        <div className="setting-library-placement-rail">
          {positionPickerRows(allowCustomPromptPositions ? promptPositions : []).map((row, index) => {
            if (row.type === 'custom') {
              const position = row.position;
              const selected = entry.promptPositionId === position.id;
              return <button type="button" className={`setting-library-placement-row is-custom is-card${selected ? ' is-selected' : ''}`} key={position.id} aria-pressed={selected}
                onClick={() => onEntriesChange(moveEntryToPosition(entries, entry.id, position.anchor, position.id))}>
                <i>{selected ? <Check size={11} weight="bold" /> : null}</i><span className="setting-library-placement-choice"><FixedPositionIcon id="custom" size={16} /><span>{position.name || tUi("未命名位置")}</span></span>
              </button>;
            }
            const selectable = fixedPlacementRowSelectable(row, allowCustomPromptPositions);
            const selected = selectable && entry.position === row.value && !entry.promptPositionId;
            if (row.type === "context") return <div className="setting-library-placement-row is-context" key={`context-${row.id}`}><i /><span><FixedPositionIcon id={row.id} size={16} />{tUi(row.label)}</span></div>;
            if (!selectable) return <div
              className={`setting-library-placement-row${row.card ? " is-card" : ""} is-fixed`}
              key={`${row.value}-${index}`}
              aria-label={tUi("固定位置{value0}", {value0: tUi(POSITION_LABEL.get(row.value))})}
            >
              <i />
              <span className="setting-library-placement-choice">
                {row.card ? <FixedPositionIcon id={row.value} size={16} /> : null}
                <span>{tUi(POSITION_LABEL.get(row.value))}</span>
              </span>
            </div>;
            return (
              <button
                type="button"
                className={`setting-library-placement-row${row.card ? " is-card" : ""}${row.value === "instructions" ? " is-instructions" : ""}${selected ? " is-selected" : ""}`}
                key={`${row.value}-${index}`}
                aria-label={tUi("选择{value0}", {value0: tUi(POSITION_LABEL.get(row.value))})}
                aria-pressed={selected}
                onClick={() => onEntriesChange(moveEntryToPosition(entries, entry.id, row.value))}
              >
                <i>{selected ? <Check size={11} weight="bold" /> : null}</i>
                <span className="setting-library-placement-choice">
                  {row.card ? <FixedPositionIcon id={row.value} size={16} /> : null}
                  <span>{tUi(POSITION_LABEL.get(row.value))}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {entry.position === "instructions" && !entry.promptPositionId ? null : (
        <SegmentedField label={tUi("消息身份")} value={entry.insertRole === "assistant" ? "assistant" : "user"} options={[{ value: "user", label: tUi("用户") }, { value: "assistant", label: "AI" }]} onChange={(insertRole) => onChange({ ...entry, insertRole })} />
      )}

      <section className="setting-library-order-card">
        <NumberField label={tUi("位置内部排序")} description={tUi("数字越小越靠前")} value={entry.order} min={1} onChange={setOrder} />
        {conflict ? <p className="setting-library-order-warning">{tUi("当前位置已存在排序数字 ")}{entry.order}{tUi("，条目已关闭。")}</p> : null}
        <div className="setting-library-order-preview">
          <strong>{tUi("当前位置顺序")}</strong>
          {scope.map((candidate) => <div className={candidate.id === entry.id ? "is-current" : ""} key={candidate.id}><b>{candidate.order}</b><span>{candidate.title || tUi("待命名设定")}</span>{candidate.id === entry.id ? <em>{tUi("当前")}</em> : null}</div>)}
        </div>
      </section>
    </>
  );
}

function InsertSection({ entry, entries, promptPositions, allowCustomPromptPositions, onChange, onEntriesChange, onManagePositions }) {
  const tUi = useProductTranslation();
  if (entry.triggerMode === "agent_tool") {
    return <p className="setting-library-agent-insert-note">{entry.agentReadStrategy === "required"
      ? tUi("必读正文会放入缓存设定区；读取工具只返回编号和标题。")
      : tUi("AI 读取后，正文直接作为工具结果返回，无需配置插入位置。")}</p>;
  }
  return (
    <div className="setting-library-entry-section">
      <VisualPositionPicker entry={entry} entries={entries} promptPositions={promptPositions} allowCustomPromptPositions={allowCustomPromptPositions} onChange={onChange} onEntriesChange={onEntriesChange} onManagePositions={onManagePositions} />
    </div>
  );
}

export function SettingLibraryEntryEditor({ entry, entries, promptPositions = [], allowCustomPromptPositions = false, creatorPreset = false, nameInputRef, onChange, onEntriesChange, onOpenEntry, onPromptPositionsChange = () => {} }) {
  const tUi = useProductTranslation();
  const [section, setSection] = useState("base");
  const [managingPositions, setManagingPositions] = useState(false);
  const editorRef = useRef(null);
  const scrollTopRef = useRef(0);
  useEffect(() => { setSection("base"); setManagingPositions(false); }, [entry.id]);
  function openPositionManager() {
    if (!allowCustomPromptPositions) return;
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
  if (allowCustomPromptPositions && managingPositions) return <div ref={editorRef} className="setting-library-normal-entry-editor is-position-manager"><CustomPositionManager entry={entry} positions={promptPositions} entries={entries} onChange={onPromptPositionsChange} onBack={closePositionManager} /></div>;
  const editorSections = localizeUiCopy(EDITOR_SECTIONS, tUi);
  const activeSection = editorSections.some((item) => item.id === section) ? section : editorSections[0].id;
  const activeSectionIndex = editorSections.findIndex((item) => item.id === activeSection);
  return (
    <div ref={editorRef} className={`setting-library-normal-entry-editor${activeSection === "content" ? " is-content-editor" : ""}${activeSection === "trigger" ? " is-trigger-editor" : ""}`}>
      <nav className="setting-library-entry-tabs" aria-label={tUi("设定编辑区域")}>
        {editorSections.map((item, index) => {
          const completed = index < activeSectionIndex;
          return <Fragment key={item.id}>
            <button type="button" className={completed ? "is-complete" : undefined} aria-current={activeSection === item.id ? "step" : undefined} onClick={() => setSection(item.id)}>
              <span className="setting-library-entry-tab-node">{completed ? <Check size={12} weight="bold" /> : index + 1}</span>
              <span className="setting-library-entry-tab-label">{item.label}</span>
            </button>
            {index < editorSections.length - 1 ? <i className={`setting-library-entry-tab-connector${completed ? " is-complete" : ""}`} aria-hidden="true" /> : null}
          </Fragment>;
        })}
      </nav>
      {activeSection === "base" ? <BasicSection entry={entry} nameInputRef={nameInputRef} onChange={onChange} /> : null}
      {activeSection === "trigger" ? <TriggerSection entry={entry} onChange={onChange} creatorPreset={creatorPreset} /> : null}
      {activeSection === "content" ? <ContentSection entry={entry} entries={entries} onChange={onChange} onOpenEntry={onOpenEntry} creatorPreset={creatorPreset} /> : null}
      {activeSection === "insert" ? <InsertSection entry={entry} entries={entries} promptPositions={promptPositions} allowCustomPromptPositions={allowCustomPromptPositions} onChange={onChange} onEntriesChange={onEntriesChange} onManagePositions={openPositionManager} /> : null}
    </div>
  );
}

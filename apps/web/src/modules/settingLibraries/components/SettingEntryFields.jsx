import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { settingBodyMode } from '@shared/contracts/settingLibrary/schemas';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useId, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  CaretRight,
  Check,
  ClockCounterClockwise,
  Cube,
  Database,
  Heart,
  Key,
  MapTrifold,
  NoteBlank,
  PushPin,
  Robot,
  ShieldCheck,
  Skull,
  Sparkle,
  SlidersHorizontal,
  Tag,
  UserCircle,
  UsersThree,
  WarningCircle,
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
import { FixedPositionIcon } from './CustomPositionManager.jsx';
import { fixedPlacementRowSelectable, positionPickerRows } from '../model/customPositions.js';
import { PropertySegment, PropertySwitch } from './SettingPropertyFields.jsx';
import { EditorSelect } from '../../../ui/ui/EditorSelect.jsx';
import { settingRuleType } from '../model/settingLibraryRules.js';

export const SETTING_RULE_TYPES = [
  { value: "lookup", label: "AI 选读", Icon: Robot },
  { value: "keyword", label: "关键词触发", badgeLabel: "关键词", Icon: Tag },
  { value: "always", label: "常驻触发", badgeLabel: "常驻", Icon: PushPin },
];
const ALWAYS_MODES = [
  { value: "required", label: "每轮必读" },
  { value: "prompt", label: "指定插入位置" },
];
const CREATOR_RULE_TYPES = SETTING_RULE_TYPES.filter(option => option.value !== 'keyword');

export const ICON_OPTIONS = [
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

function NumberField({ label, description, value, min, onChange }) {
  const tUi = useProductTranslation();
  const commit = (next) => onChange(Math.max(min, Number.isFinite(next) ? next : min));
  return (
    <label className="setting-library-number-row">
      <span title={description}><strong>{label}</strong><small>{description}</small></span>
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
      <details className="setting-keyword-details" open>
      <summary>{tUi('匹配规则')}<CaretRight size={14} /></summary>
      <section className="setting-library-advanced-rules">
        <div className="setting-library-rule-stack">
          <h4>{tUi("扫描范围")}</h4>
          <NumberField label={tUi("扫描深度")} description={entry.keywordScanDepth <= 1 ? tUi("只扫描用户最新消息") : tUi("扫描最近 {value0} 条消息", {value0: entry.keywordScanDepth})} value={entry.keywordScanDepth} min={1} onChange={(value) => onChange({ ...entry, keywordScanDepth: value })} />
          <PropertySwitch title={tUi("递归匹配")} description={entry.keywordRecursionDepth > 0 ? tUi("正文继续关联其他关键词") : tUi("只根据最近消息匹配")} checked={entry.keywordRecursionDepth > 0} onChange={(checked) => onChange({ ...entry, keywordRecursionDepth: checked ? 1 : 0 })} />
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
          <label className="setting-library-rule-input"><span>{tUi("匹配要求")}</span><EditorSelect label={tUi('匹配要求')} value={effectiveCondition} onChange={keywordCondition => onChange({ ...entry, keywordCondition })}
            options={!entry.conditionKeywords.length ? [{ value: 'none', label: tUi('无需') }] : [
              { value: 'any', label: tUi('任意命中') }, { value: 'all', label: tUi('全部命中') }, { value: 'not_any', label: tUi('排除命中') },
            ]} /></label>
          <h4>{tUi("匹配方式")}</h4>
          <PropertySwitch title={tUi("正则表达式")} description={entry.keywordUseRegex ? tUi("按酒馆关键词正则规则匹配") : tUi("按普通文本关键词匹配")} checked={entry.keywordUseRegex} onChange={(checked) => onChange({ ...entry, keywordUseRegex: checked })} />
          <PropertySwitch title={tUi("忽略大小写")} description={entry.keywordIgnoreCase ? tUi("英文关键词不区分大小写") : tUi("英文关键词区分大小写")} checked={entry.keywordIgnoreCase} onChange={(checked) => onChange({ ...entry, keywordIgnoreCase: checked })} />
          <PropertySwitch title={tUi("完整词匹配")} description={entry.keywordWholeWord ? tUi("只匹配完整英文单词") : tUi("允许匹配英文单词的一部分")} checked={entry.keywordWholeWord} onChange={(checked) => onChange({ ...entry, keywordWholeWord: checked })} />
        </div>
      </section>
      </details>
    </>
  );
}

export function TriggerSection({ entry, entries, onChange, creatorPreset }) {
  const tUi = useProductTranslation();
  function changeUsage(usage) {
    const always = usage === "prompt";
    const position = always ? entry.position || SETTING_LIBRARY_POSITION_OPTIONS[0].value : entry.position;
    const order = creatorPreset && always
      ? positionOrderScope(entries, position, entry.promptPositionId).reduce((last, candidate) => (
        candidate.id !== entry.id && candidate.triggerMode === 'always' && !FIXED_ENTRY_IDS.has(candidate.id)
          ? Math.max(last, candidate.order) : last
      ), 0) + 1
      : entry.order;
    onChange({ ...entry,
      triggerMode: always ? "always" : "agent_tool",
      agentReadStrategy: usage === "required" || usage === "keyword" ? usage : "normal",
      ...(creatorPreset ? { contentMode: 'plain_text' } : {}),
      position, order,
      ...(creatorPreset && always && position === 'instructions' ? { insertRole: 'system' } : {}),
    });
  }
  const placement = entry.triggerMode === "always";
  const usage = settingRuleType(entry, creatorPreset);
  return <div className="setting-library-entry-section setting-usage-fields">
      <div className="setting-usage-primary">
        <PropertySegment label={tUi("触发方式")} value={usage} options={(creatorPreset ? CREATOR_RULE_TYPES : SETTING_RULE_TYPES).map(({ value, label, Icon }) => ({
          value, label: <span className="setting-usage-label" title={tUi(label)}><Icon size={16} aria-hidden="true" /><span>{tUi(label)}</span></span>,
        }))}
          onChange={next => { if (next !== usage) changeUsage(next === "always" ? (creatorPreset ? 'prompt' : 'required') : next); }} />
      </div>
      {!creatorPreset && usage === "always" && <PropertySegment label={tUi("常驻方式")} value={placement ? "prompt" : "required"}
        options={localizeUiCopy(ALWAYS_MODES, tUi)} onChange={changeUsage} />}
      {usage === "lookup" && <ReadingHint entry={entry} onChange={onChange} creatorPreset={creatorPreset} />}
      {usage === "keyword" && <div className="setting-keywords-inline"><KeywordRules entry={entry} onChange={onChange} /></div>}
    </div>;
}

function ReadingHint({ entry, onChange, creatorPreset }) {
  const tUi = useProductTranslation();
  return <label className="setting-library-field-card setting-library-text-field setting-property-row">
    <span className="setting-property-label" title={tUi('注释（AI 读目录时靠它判断）')}>{creatorPreset ? tUi('选读说明') : tUi('查阅提示')}</span>
    <textarea value={entry.agentSelectionHint} placeholder={creatorPreset ? tUi("写给 AI 看的一句话") : tUi("告诉 AI 什么时候适合查阅")}
      onChange={event => onChange({ ...entry, agentSelectionHint: event.target.value })} />
  </label>;
}

export function ContentSection({ entry, onChange, creatorPreset, presetPrompt, toolbarHost, immersiveHost }) {
  const tUi = useProductTranslation();
  const ejs = !creatorPreset && entry.contentMode === "ejs";
  return (
    <div className="setting-library-entry-section is-content-section">
      <MarkdownTextareaField
        toolbarHost={toolbarHost} immersiveHost={immersiveHost} fullWidth
        label={presetPrompt ? tUi("提示词正文") : tUi("设定正文")}
        value={entry.content}
        placeholder={presetPrompt ? tUi("填写提示词正文") : tUi("填写设定正文")}
        preview={!ejs}
        onChange={content => onChange({ ...entry, content,
          contentMode: creatorPreset ? 'plain_text' : settingBodyMode(content) })}
        labelAction={ejs ? <span className="setting-template-status">{tUi("已识别 EJS")}</span> : null}
      />
    </div>
  );
}

export function VisualPositionPicker({ entry, entries, promptPositions, allowCustomPromptPositions = false, creatorPreset, onChange, onEntriesChange, onManagePositions }) {
  const tUi = useProductTranslation();
  const scope = useMemo(() => {
    const peers = entry.position ? positionOrderScope(entries, entry.position, entry.promptPositionId) : [];
    return creatorPreset ? peers.filter(candidate => candidate.triggerMode === 'always') : peers;
  }, [creatorPreset, entries, entry.position, entry.promptPositionId]);

  function setOrder(order) {
    const normalized = Math.max(1, order);
    const conflict = scope.some((candidate) => candidate.id !== entry.id && candidate.enabled && !FIXED_ENTRY_IDS.has(candidate.id) && candidate.order === normalized);
    onChange({ ...entry, order: normalized, enabled: conflict ? false : entry.enabled });
  }

  const conflict = scope.some((candidate) => candidate.id !== entry.id && candidate.enabled && !FIXED_ENTRY_IDS.has(candidate.id) && candidate.order === entry.order);
  const conflictMessage = `${tUi('当前位置已存在排序数字 ')}${entry.order}${tUi('，条目已关闭。')}`;
  return (
    <>
      <section className="setting-library-placement-card">
        <div className="setting-library-placement-heading"><strong>{tUi("插入位置")}</strong>{allowCustomPromptPositions ? <Button data-dsh-control variant="outline" type="button" className="setting-library-position-manage" onClick={onManagePositions}><SlidersHorizontal size={14} />{tUi("管理位置")}</Button> : null}</div>
        <div className="setting-library-placement-rail">
          {positionPickerRows(allowCustomPromptPositions ? promptPositions : [], creatorPreset).map((row, index) => {
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
        <PropertySegment label={tUi("消息身份")} value={entry.insertRole === "assistant" ? "assistant" : "user"} options={[{ value: "user", label: tUi("用户") }, { value: "assistant", label: "AI" }]} onChange={(insertRole) => onChange({ ...entry, insertRole })} />
      )}

      <section className="setting-library-order-card">
        <NumberField label={tUi('位置内顺序')} description={tUi("数字越小越靠前")} value={entry.order} min={1} onChange={setOrder} />
        {conflict ? <p className="setting-library-order-warning" title={conflictMessage}>
          <span className="setting-order-warning-full">{conflictMessage}</span>
          <span className="setting-order-warning-compact" tabIndex={0} aria-label={conflictMessage}><WarningCircle size={17} aria-hidden="true" /></span>
        </p> : null}
        <div className="setting-library-order-preview">
          <strong>{tUi('同位置条目')}</strong>
          {scope.length ? <ol className="setting-order-items" aria-label={tUi('同位置条目')}>
            {scope.map((candidate) => <li className={candidate.id === entry.id ? "is-current" : ""} aria-current={candidate.id === entry.id ? 'true' : undefined} key={candidate.id}>
              <b>{candidate.order}</b><span title={candidate.title || tUi("待命名设定")}>{candidate.title || tUi("待命名设定")}</span>{candidate.id === entry.id ? <em>{tUi("当前")}</em> : null}
            </li>)}
          </ol> : <p className="setting-order-empty">{tUi('暂无条目')}</p>}
        </div>
      </section>
    </>
  );
}

export function InsertSection({ entry, entries, promptPositions, allowCustomPromptPositions, creatorPreset, onChange, onEntriesChange, onManagePositions }) {
  const tUi = useProductTranslation();
  if (entry.triggerMode === "agent_tool") {
    return <p className="setting-library-agent-insert-note">{entry.agentReadStrategy === "required"
      ? tUi("必读正文会放入缓存设定区；读取工具只返回编号和标题。")
      : tUi("AI 读取后，正文直接作为工具结果返回，无需配置插入位置。")}</p>;
  }
  return (
    <div className="setting-library-entry-section">
      <VisualPositionPicker entry={entry} entries={entries} promptPositions={promptPositions} allowCustomPromptPositions={allowCustomPromptPositions}
        creatorPreset={creatorPreset} onChange={onChange} onEntriesChange={onEntriesChange} onManagePositions={onManagePositions} />
    </div>
  );
}

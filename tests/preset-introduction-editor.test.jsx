import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { PresetContentComposer, PresetIntroductionEditor } from '../src/renderer/src/modules/presets/components/PresetIntroductionEditor.jsx';
import { calendarDateValue, createTimelineDraft, createUsageDraft, introductionDraftPatch, isIntroductionDraftDirty, localDateLabel, visibleTimelineRecords } from '../src/renderer/src/modules/presets/model/presetIntroductionDraft.js';

const profile = { usageInstructions: '选择角色后开始对话。', timeline: [{ id: 'first', title: '首次发布', dateLabel: '2026-9-11', note: '加入基础规则。' }] };
const props = { preset: { id: 'preset', profile }, saving: false, error: '', onClearError: () => {}, onSaveProfile: async () => true };
beforeAll(() => vi.stubGlobal('React', React));
afterAll(() => vi.unstubAllGlobals());

describe('preset introduction drafts', () => {
  it('keeps typing and cancellation isolated from the saved profile', () => {
    const draft = createUsageDraft(profile);
    expect(isIntroductionDraftDirty(draft)).toBe(false);
    draft.value = '新的使用说明';
    expect(isIntroductionDraftDirty(draft)).toBe(true);
    expect(profile.usageInstructions).toBe('选择角色后开始对话。');
    expect(introductionDraftPatch(profile, draft)).toEqual({ usageInstructions: '新的使用说明' });
    expect(isIntroductionDraftDirty(createUsageDraft(profile))).toBe(false);
  });

  it('allows explicitly clearing usage instructions', () => {
    const draft = { ...createUsageDraft(profile), value: '' };
    expect(introductionDraftPatch(profile, draft)).toEqual({ usageInstructions: '' });
  });

  it('does not create a placeholder record before a valid save', () => {
    const draft = createTimelineDraft(null, new Date(2026, 8, 11));
    expect(draft.value.dateLabel).toBe('2026-09-11');
    expect(isIntroductionDraftDirty(draft)).toBe(false);
    expect(() => introductionDraftPatch(profile, draft)).toThrow('填写更新标题或内容');
    expect(profile.timeline).toHaveLength(1);
    draft.value.title = ' 新版本 ';
    draft.value.note = ' 更新内容 ';
    expect(isIntroductionDraftDirty(draft)).toBe(true);
    const patch = introductionDraftPatch(profile, draft);
    expect(patch.timeline).toHaveLength(2);
    expect(patch.timeline[0]).toMatchObject({ title: '新版本', note: '更新内容' });
    expect(patch.timeline[1]).toEqual(profile.timeline[0]);
  });

  it('edits only the matching record without changing the persisted object', () => {
    const draft = createTimelineDraft(profile.timeline[0]);
    draft.value.note = '修订后的说明';
    expect(profile.timeline[0].note).toBe('加入基础规则。');
    expect(introductionDraftPatch(profile, draft).timeline[0].note).toBe('修订后的说明');
    expect(draft.initial.note).toBe('加入基础规则。');
  });

  it('respects the profile timeline limit', () => {
    const draft = createTimelineDraft();
    draft.value.title = '一条更新';
    expect(() => introductionDraftPatch({ ...profile, timeline: Array(100).fill(profile.timeline[0]) }, draft)).toThrow('100');
  });

  it('normalizes real local calendar dates without changing free-form labels', () => {
    expect(localDateLabel(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
    expect(calendarDateValue('2026-9-11')).toBe('2026-09-11');
    expect(calendarDateValue('2026-02-31')).toBe('');
    expect(calendarDateValue('首次发布')).toBe('');
  });

  it('collapses older records without mutating their order or dates', () => {
    const timeline = Array.from({ length: 5 }, (_, index) => ({ id: String(index), title: `记录${index}`, dateLabel: `自定义日期${index}`, note: '' }));
    expect(visibleTimelineRecords(timeline, false)).toEqual({ records: timeline.slice(0, 3), hiddenCount: 2 });
    expect(visibleTimelineRecords(timeline, false, true)).toEqual({ records: timeline.slice(0, 2), hiddenCount: 3 });
    expect(visibleTimelineRecords(timeline, true)).toEqual({ records: timeline, hiddenCount: 0 });
    expect(visibleTimelineRecords(timeline, true, true)).toEqual({ records: timeline, hiddenCount: 0 });
    expect(timeline).toHaveLength(5);
  });

  it('does not invent earlier records for short or empty timelines', () => {
    expect(visibleTimelineRecords([], false)).toEqual({ records: [], hiddenCount: 0 });
    expect(visibleTimelineRecords(profile.timeline, false, true)).toEqual({ records: profile.timeline, hiddenCount: 0 });
  });
});

describe('preset introduction presentation', () => {
  it('gives both record actions equally sized decorative icons before their labels', () => {
    const html = renderToStaticMarkup(<PresetIntroductionEditor {...props} />);
    const menu = html.match(/<div class="preset-update-menu-items">([\s\S]*?)<\/div>/)?.[1];
    const actions = [...menu.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
    expect(actions).toHaveLength(2);
    actions.forEach(([ , content], index) => {
      expect(content).toMatch(/<svg[^>]*width="16"[^>]*height="16"/);
      expect(content).toContain('aria-hidden="true"');
      expect(content).toContain(`</svg><span>${index === 0 ? '编辑' : '删除'}</span>`);
    });
  });

  it('shows saved content as readable text, not a wall of inputs', () => {
    const html = renderToStaticMarkup(<PresetIntroductionEditor {...props} />);
    expect(html).toContain('选择角色后开始对话。');
    expect(html).toContain('加入基础规则。');
    expect(html).toContain('添加更新');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('>保存<');
    expect(html).toContain('<h2>使用说明</h2>');
    expect(html).toContain('preset-usage-reading-surface');
    expect(html).toContain('preset-update-step is-latest');
    expect(html).toContain('preset-update-node');
    expect(html).toContain('preset-update-record');
    expect(html).toContain('<details');
    expect(html).toContain('操作：首次发布');
  });

  it('has both actions inside the empty editor before any typing', () => {
    const html = renderToStaticMarkup(<PresetIntroductionEditor {...props} preset={{ ...props.preset, profile: { ...profile, usageInstructions: '' } }} />);
    const form = html.match(/<form[\s\S]*?<\/form>/)?.[0];
    expect(form).toContain('aria-label="使用说明"');
    expect(form).toContain('preset-content-composer-footer');
    expect(form).toContain('>取消<');
    expect(form).toContain('>保存<');
    expect(html.match(/<textarea/g)).toHaveLength(1);
  });

  it('keeps new update title, date, body, and actions in one composer', () => {
    const html = renderToStaticMarkup(<PresetContentComposer draft={createTimelineDraft()} saving={false} error="" onChange={() => {}} onCancel={() => {}} onSave={() => {}} />);
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html).toContain('aria-label="更新标题"');
    expect(html).toContain('aria-label="更新日期"');
    expect(html).toContain('aria-label="更新内容"');
    expect(html).toContain('>保存更新<');
    expect(html).toContain('>取消<');
  });

  it('disables the entire composer during saving and exposes errors', () => {
    const html = renderToStaticMarkup(<PresetContentComposer draft={createUsageDraft(profile)} saving error="保存失败，请重试" onChange={() => {}} onCancel={() => {}} onSave={() => {}} />);
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain('role="alert"');
    expect(html).toContain('保存中…');
  });

  it('shows a real earlier-record count and keeps older content collapsed', () => {
    const timeline = Array.from({ length: 5 }, (_, index) => ({ id: String(index), title: `记录${index}`, dateLabel: '2026-09-11', note: '' }));
    const html = renderToStaticMarkup(<PresetIntroductionEditor {...props} preset={{ ...props.preset, profile: { ...profile, timeline } }} />);
    expect(html).toContain('展开更早 2 条记录');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('记录2');
    expect(html).not.toContain('记录3');
    expect(html).not.toContain('记录4');
    expect(html.match(/class="preset-update-node"/g)).toHaveLength(3);
  });

  it('omits the expand control when there are no older records', () => {
    const html = renderToStaticMarkup(<PresetIntroductionEditor {...props} />);
    expect(html).not.toContain('preset-updates-expand');
  });
});

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VariableViewerDialog } from '../../src/modules/chat/components/VariableViewerDialog.jsx';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/modules/chat/styles/variable-viewer.css';
import '../../src/mobile/mobile-conversation-overlays.css';
installBrowserIconSprite();
const previous = { 场景: { 时间: '19:15', 删除项: '旧值' }, 角色: { 同行者: { 好感度: 35 } } };
const current = { 场景: { 时间: '19:30', 目标: '找到遗落在候车室的信件。', 数组: [{ 名称: '钥匙', 详情: { 可用: false, 备注: null } }] },
  角色: { 同行者: { 好感度: 38, 心情: '逐渐放松，但仍然有所保留。', 属性: { 体力: 82 } }, 向导: { 好感度: 12 } },
  大量字段: Object.fromEntries(Array.from({ length: 1003 }, (_, i) => [`字段${i}`, `合成值 ${i} ${i === 1002 ? '末尾关键词' : ''}`])) };
const doc = root => ({ root, rawJson: JSON.stringify(root), errorMessage: '', topLevelCount: Object.keys(root).length, valueCount: 1009 });
const timeline = { initial: doc(previous), current: doc(current), floors: [{ id: 'floor-1', label: '第 1 楼', createdAt: '2026-11-10T11:42:00.000Z', messagePreview: '雨声渐渐小了，你们决定回到候车室。', state: doc(current), changedValueCount: 8, changedPaths: [] },
  { id: 'floor-2', label: '第 2 楼', createdAt: '2026-11-10T11:45:00.000Z', messagePreview: '无快照的合成楼层', state: { root: null, rawJson: '', errorMessage: '无历史状态' }, changedValueCount: 0, changedPaths: [] }] };
let sequence = 0, configuration = { versionId: '', versions: [{ id: 'a', name: '日常剧情' }, { id: 'b', name: '调查剧情' }] };
let handlers = [], snapshot = { id: 'synthetic-chat', status: 'ready', timeline, error: '' };
const service = { subscribeTimeline: () => () => {}, getTimelineSnapshot: () => snapshot, openTimeline: async () => timeline, closeTimeline: () => {},
  readVariableConfiguration: async () => structuredClone(configuration),
  selectVariableVersion: async (...args) => { window.variableCalls.push(args); if (window.rejectVariableSelection) throw new Error('合成保存失败'); configuration = { ...configuration, versionId: args[1] }; return structuredClone(configuration); } };
function Fixture() {
  const [key, setKey] = useState(0);
  window.variableCalls = [];
  window.remountVariables = ({ mobile = false, theme = 'light', missing = false } = {}) => {
    document.documentElement.dataset.eleckoiMobile = String(mobile);document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark');
    snapshot = { ...snapshot, timeline: missing ? { ...timeline, current: doc({}), floors: [] } : timeline };
    configuration = { ...configuration, versionId: '' }; window.rejectVariableSelection = false;setKey(++sequence);
  };
  window.variableBack = () => handlers.at(-1)?.();
  return <MainPageContext.Provider value={{ registerBackHandler(handler) { handlers.push(handler);return () => { handlers = handlers.filter(item => item !== handler); }; } }}>
    <VariableViewerDialog key={key} conversationId="synthetic-chat" conversationModel={service} onClose={() => { window.variableClosed = true; }} />
  </MainPageContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

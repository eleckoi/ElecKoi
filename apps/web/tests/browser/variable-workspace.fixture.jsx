import { EditorView } from '@codemirror/view';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CharacterEditorWindow } from '../../src/app/windows/CharacterEditorWindow.jsx';
import { ensureInitializationObject, syncActiveVersion } from '../../src/modules/variables/model/variableConfigEditing.js';
import { createVariableVersion, switchVariableVersion } from '../../src/modules/variables/model/variableConfigTransfer.js';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/base.css';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/app/windows/shell/styles/titlebar.css';
import '../../src/app/windows/shell/styles/client-shell.css';
import '../../src/ui/styles/editor-sidebar.css';
import '../../src/modules/persona/styles/character-editor.css';
import '../../src/modules/variables/styles/variable-config.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';

installBrowserIconSprite();
const stamp = '2026-11-11T00:00:00.000Z';
const object = (id, name, extra = {}) => ({ id, name, parentId: '', enabled: true, description: '', updateRule: '', dynamicKey: false, order: 1, treeViewOrder: 1, createdAt: stamp, updatedAt: stamp, ...extra });
const variable = (id, title, type, defaultValue, extra = {}) => ({ id, title, type, defaultValue, objectId: 'character', enabled: true, description: '', updateRule: '', readMode: 'on_demand', order: 1, treeViewOrder: 1, createdAt: stamp, updatedAt: stamp, ...extra });
const objects = [object('character', '角色状态', { description: '林晚的状态与日常感受。', updateRule: '根据故事中实际发生的行动更新，保持前后连贯。' }), object('environment', '环境', { treeViewOrder: 2, description: '当前场景中的时间、地点与天气。' }), object('relations', '人物关系', { treeViewOrder: 3 }), object('aunt', '周姨', { parentId: 'relations', description: '隔壁花店的店主，也是林晚多年的邻居。' })];
const variables = [
  variable('affection', '好感度', 'number', '20', { description: '林晚对你的信任与亲近程度，取值为 0～100。', updateRule: '根据对话中的实际互动，小幅调整好感度。\n\n被认真倾听、得到体贴的照顾时，可以增加 1～3 点。普通寒暄不需要改变数值。\n\n发生误解或冲突时，根据情节减少；不要因为一次对话就突然大幅变化。' }),
  variable('energy', '体力', 'number', '80', { treeViewOrder: 2, readMode: 'required', description: '当前的体力，取值为 0～100。' }),
  variable('mood', '心情', 'string', '平静', { treeViewOrder: 3, description: '用简短的词语描述林晚此刻的情绪。' }),
  variable('closed', '是否打烊', 'boolean', 'false', { treeViewOrder: 4 }),
  variable('items', '随身物品', 'array', '["钥匙", "旧书"]', { treeViewOrder: 5, description: '随身携带的物品，按获得顺序记录。' }),
  variable('place', '当前地点', 'string', '雨巷书店', { objectId: 'environment' }),
  variable('weather', '天气', 'string', '小雨', { objectId: 'environment', treeViewOrder: 2 }),
  variable('familiarity', '熟悉程度', 'number', '60', { objectId: 'aunt' }),
];
const schemaCode = 'z.object({\n  角色状态: z.object({\n    好感度: z.number().min(0).max(100),\n    体力: z.number().min(0).max(100),\n    心情: z.string(),\n    是否打烊: z.boolean(),\n    随身物品: z.array(z.string())\n  }),\n  环境: z.object({\n    当前地点: z.string(),\n    天气: z.string()\n  }),\n  人物关系: z.object({\n    周姨: z.object({ 熟悉程度: z.number() })\n  })\n})';
const base = ensureInitializationObject({ characterId: 'design-character', name: '林间来信', objects, variables, schemaCode, initialStateJson: '{}', expandedObjectIds: ['character', 'environment', 'relations', 'aunt'], activeVersionId: 'v1', versions: [] });
const initial = switchVariableVersion(createVariableVersion(syncActiveVersion(base), { name: '夜雨 · 草稿', sourceVersionId: 'v1' }), 'v1');

let value = structuredClone(initial);
window.variableWorkspaceCalls = 0; window.variableWorkspaceSaveFails = false;
window.variableWorkspaceSaved = () => value;
const model = { getSnapshot: () => ({ status: 'ready', value }), read: async () => value, subscribe: () => () => {}, saveViewState: async () => [],
  save: async (_id, next) => { window.variableWorkspaceCalls++; if (window.variableWorkspaceSaveFails) throw Error('合成保存失败'); value = structuredClone(next); return value; } };
const q = new URLSearchParams(location.search), theme = q.get('theme') || 'light';
window.editorViewFor = label => EditorView.findFromDOM(document.querySelector(`[role="textbox"][aria-label="${label}"]`));
if (q.has('long')) {
  const text = q.get('long') === 'single' ? '超长行内容'.repeat(250000) : Array.from({ length: 100000 }, (_, i) => `${i} 创作内容，保留完整文字。\n`).join('');
  value.variables[0].description = text; value.variables[0].updateRule = text;
}
document.documentElement.dataset.theme = theme; document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark'); document.documentElement.style.colorScheme = theme;
const catalog = { refresh: async () => ({ items: [{ id: 'design-character', name: '林间来信', persona: {} }] }) };
createRoot(document.getElementById('root')).render(<div id="eleckoi-root"><CharacterEditorWindow
  embeddedCharacterId="design-character" characterCatalog={catalog} characterConfiguration={{ variables: model }}
  renderHeader={() => <header className="client-titlebar split-surface"><div className="title-spacer" /></header>}
  renderCharacterEditorSection={(section, _owner, fallback) => section === 'variables' ? fallback : <div data-fixture-section={section} />}
/></div>);

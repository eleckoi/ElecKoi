import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CreatorToolCall } from '../../src/modules/creatorStudio/components/CreatorToolCall.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import { DisclosureRow } from '@deepseek-ai/dsh-client-ui-primitives';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';

installBrowserIconSprite();
const files = Array.from({ length: 1003 }, (_, index) => ({ id: `prompt-${index}`, title: `合成提示${index}`, path: `合成组/合成提示${index}`,
  read_strategy: index === 0 ? 'required' : 'normal', content_delivery: index === 0 ? 'cached_reference' : 'tool_result',
  content: index === 0 ? '本轮前置正文已提供。' : index === 1002 ? '完整长正文𠮷\n'.repeat(800) + 'CREATOR_PROMPT_TAIL' : `合成正文${index}` }));
const capability = (id, name, args, value, rest = {}) => ({ id, toolName: 'eleckoi_call_capability', args: { capability_id: name, arguments: args }, payload: { value }, ...rest });
const cases = [
  { id: 'discovery', toolName: 'eleckoi_list_toolsets', args: {}, payload: { toolsets: [{ id: 'presetPrompts', title: '预设提示词', description: '目录与正文', operationCount: 3 }] } },
  { id: 'describe', toolName: 'eleckoi_describe_toolset', args: { toolset_id: 'presetPrompts' }, payload: { toolset: { title: '预设提示词', description: '目录与正文' }, operations: [{ id: 'read', title: '读取' }] } },
  capability('prompts', 'presetPrompts.read', { paths: files.map(file => file.path) }, { status: 'ok', files }),
  capability('variables', 'variables.update', { id: 'var-a', changes: { defaultValue: '0', enabled: false, updateRule: '每次增加 1，最高 100' } }, { id: 'var-a', title: '合成好感度', enabled: false }),
  capability('edit', 'settings.edit', { id: 'setting-a', old_string: '原文𠮷\n'.repeat(400) + 'CREATOR_OLD_TAIL', new_string: '新文𠮷\n'.repeat(400) + 'CREATOR_NEW_TAIL' }, { id: 'setting-a', changed: true, replacements: 1 }),
  capability('preview', 'regex.test', { text: '<value>0</value>', rule: { name: '合成数值' } }, { output: '数值：0', changed: true, appliesToSurface: true }),
  capability('failed', 'scripts.update', { id: 'script-a', expectedRevision: 2, changes: { content: 'export default () => {}' } }, {}, { isError: true, error: { code: 'conflict_stale_revision', message: '脚本库已被修改，请重新读取后再保存。' } }),
  { id: 'page', toolName: 'eleckoi_call_capability', args: { result: { file_path: '/synthetic/result.json', offset: 200 } }, payload: { kind: 'tool_result_page', offset: 200, total_bytes: 10000, file_path: '/synthetic/result.json', content: '实际续读的完整片段𠮷\n'.repeat(300) + 'CREATOR_PAGE_TAIL', next_offset: 6000 } },
  capability('cancelled', 'settings.read', { id: 'setting-a' }, {}, { error: { code: 'interrupted', message: '操作已中断。' } }),
  capability('spilled', 'settings.read', { id: 'setting-a' }, {}, { payload: { status: 'spilled' } }),
];
function useDisclosure() { const [expanded, setExpanded] = useState(false); return { expanded, toggle: () => setExpanded(value => !value) }; }
function Fixture() {
  return <div className="creator-simple-transcript" style={{ width: '100%', maxWidth: 720, margin: '0 auto', padding: 16, boxSizing: 'border-box' }}>
    <DisclosureRow className="official-tool-reference" titleClassName="official-tool-reference-title" title="官方工具" open={false} expandable={false} />
    {cases.map(item => <CreatorToolCall key={item.id} callId={item.id} toolName={item.toolName} phase="result" useDisclosure={useDisclosure}
      inspect={() => { document.body.dataset.inspected = item.id; }} renderNative={() => <span data-native-fallback={item.id}>Native original tool output</span>}
      block={{ kind: 'tool-result', call: { argsRaw: JSON.stringify(item.args) }, content: [{ type: 'text', text: JSON.stringify(item.payload) }], isError: item.isError, error: item.error }} />)}
  </div>;
}
createRoot(document.querySelector('#root')).render(<Fixture />);

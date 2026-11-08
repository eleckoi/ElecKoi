import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { AgentProcessDialog } from '../../src/modules/chat/components/AgentProcessDialog.jsx';
import { renderRoleplayToolCall } from '../../src/modules/chat/components/RoleplayToolCall.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';

const query = new URLSearchParams(location.search);
installBrowserIconSprite();
const long = query.has('volume');
const operations = long ? Array.from({ length: 1003 }, (_, index) => ({ op: 'replace', path: `/合成组/字段${index}`,
  value: index === 1002 ? '合成值𠮷\n'.repeat(300) + 'VARIABLE_MUTATION_TAIL' : index }))
  : [{ op: 'replace', path: '/剧情/共伞', value: true }, { op: 'delta', path: '/关系/好感度', value: 1 }];
const old_string = long ? '完整旧文𠮷\n'.repeat(300) + 'OLD_MUTATION_TAIL' : '她把伞递给你，转身准备独自离开。';
const new_string = long ? '完整新文𠮷\n'.repeat(300) + 'NEW_MUTATION_TAIL' : '她把伞往你这边偏了偏，轻声问：“一起走吗？”';
const cases = [
  { id: 'read', toolName: 'eleckoi_read_setting_files', args: {}, payload: { status: 'ok', files: [{ path: '场景/雨夜', title: '雨夜', content: '合成只读正文' }] } },
  { id: 'variables', toolName: 'eleckoi_apply_variable_patch', args: { operations }, payload: { status: 'ok', applied_operations: operations.length,
    paths: operations.map(op => op.path), message: '变量补丁已通过校验并暂存，将随本回合成功完成后提交。' } },
  ...['edit_file', 'move_file', 'delete_file', 'make_directory', 'write_file', 'move_directory', 'delete_directory'].map(operation => ({ id: operation,
    toolName: 'eleckoi_apply_setting_patch', args: { operation, path: '场景/雨夜', destination: '新组/雨夜', old_string, new_string, content: '合成写入的全文𠮷' },
    payload: { status: 'ok', changed: true, path: '场景/雨夜', operation, destination: '新组/雨夜', ...(operation === 'edit_file' ? { replacements: 1 } : {}) } })),
  { id: 'failed', toolName: 'eleckoi_apply_variable_patch', args: { operations: [{ op: 'replace', path: '/好感度', value: 120 }] },
    payload: { status: 'validation_error', message: '好感度需要在 0 到 100 之间，本次提交为 120。', state_unchanged: true } },
  { id: 'unchanged', toolName: 'eleckoi_apply_setting_patch', args: { operation: 'delete_file', path: '场景/雨夜' }, payload: { status: 'ok', changed: false } },
];
function useDisclosure() { const [expanded, setExpanded] = useState(false); return { expanded, toggle: () => setExpanded(value => !value) }; }
function Fixture() {
  const [target, setTarget] = useState(null);
  return <><AgentProcessDialog message={{ status: 'complete', processTiming: { startedAtMillis: 0, completedAtMillis: 8000 } }} onClose={() => {}} onContentTarget={setTarget} />
    {target ? createPortal(<div style={{ padding: 12 }}>
      {cases.map(item => <React.Fragment key={item.id}>{renderRoleplayToolCall({ toolName: item.toolName, callId: item.id, phase: 'result', useDisclosure, inspect: () => {},
        block: { kind: 'tool-result', isError: false, call: { argsRaw: JSON.stringify(item.args) }, content: [{ type: 'text', text: JSON.stringify(item.payload) }] } }, () => <span data-native-fallback>Native fallback</span>)}</React.Fragment>)}
    </div>, target) : null}
  </>;
}
createRoot(document.querySelector('#root')).render(<Fixture />);

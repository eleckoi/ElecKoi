import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { AgentProcessDialog } from '../../src/modules/chat/components/AgentProcessDialog.jsx';
import { renderRoleplayToolCall } from '../../src/modules/chat/components/RoleplayToolCall.jsx';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';

const domain = new URLSearchParams(location.search).get('domain') || 'variables';
const variables = Array.from({ length: 128 }, (_, index) => ({ path: `/合成组/字段${index}`, type: 'boolean', current: false,
  default: false, read_mode: 'required', description: '是否完成合成步骤。', update_rule: '在合成条件满足后更新当前值。', write_guidance: '用 replace 修改当前值' }));
variables[127].update_rule = '合成规则完整内容。\n'.repeat(600) + 'VARIABLE_TAIL_127';
const files = Array.from({ length: 86 }, (_, index) => ({ path: `合成组/设定${index}`, title: `合成设定${index}`,
  content: index === 85 ? '合成设定完整正文。\n'.repeat(600) + 'SETTING_TAIL_085' : '合成的简短正文。' }));
const payload = domain === 'variables' ? { status: 'ok', variables } : { status: 'ok', files };
const toolName = domain === 'variables' ? 'eleckoi_read_variables' : 'eleckoi_read_setting_files';
function useDisclosure() {
  const [expanded, setExpanded] = useState(false);
  return { expanded, toggle: () => setExpanded(value => !value) };
}
function Fixture() {
  const [target, setTarget] = useState(null);
  return <><AgentProcessDialog message={{ status: 'complete', processTiming: { startedAtMillis: 0, completedAtMillis: 8000 } }} onClose={() => {}} onContentTarget={setTarget} />
    {target ? createPortal(<>
      <div style={{ height: 144 }}>合成前置工具</div>
      {renderRoleplayToolCall({ toolName, callId: 'synthetic-results', phase: 'result', useDisclosure, inspect: () => {},
        block: { kind: 'tool-result', call: { argsRaw: '{}' }, content: [{ type: 'text', text: JSON.stringify(payload) }] } }, () => null)}
      <div style={{ height: 150 }}>合成后置工具</div>
    </>, target) : null}
  </>;
}
createRoot(document.querySelector('#root')).render(<Fixture />);

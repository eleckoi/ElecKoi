import React, { useState } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
import * as store from '@deepseek-ai/dsh-client-store';
import * as reactVirtual from '@tanstack/react-virtual';
import { AgentProcessDialog } from '../../src/modules/chat/components/AgentProcessDialog.jsx';
import { renderRoleplayToolCall } from '../../src/modules/chat/components/RoleplayToolCall.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';

installBrowserIconSprite();
const official = {};
function useDisclosure() {
  const [expanded, setExpanded] = useState(true);
  return { expanded, toggle: () => setExpanded(value => !value) };
}
function Process() {
  const [target, setTarget] = useState(null);
  return <><AgentProcessDialog message={{ status: 'complete' }} onClose={() => {}} onContentTarget={setTarget} />
    {target && ReactDOM.createPortal(<>
      <div style={{ height: 50 }}>合成处理过程</div>
      <official.ReasoningRow text={'合成思考正文。\n'.repeat(60)} running={false} useDisclosure={useDisclosure}
        usePresentation={select => select({ settledReasoningPreview: true })} t={() => '思考'}
        renderSlot={(_name, props) => <official.ReasoningContent {...props} t={key => key} />} />
      <official.ToolRow toolName="synthetic_tool" variant="generic" state="ok" title="合成工具" summary="本次调用"
        icon={<primitives.IconInspectOutlineRegular size={14} />} output="完整的合成工具结果" bodyRaw='{"query":"synthetic"}'
        useDisclosure={useDisclosure} t={key => key} inspect={() => { document.body.dataset.inspected = 'native'; }} />
      {renderRoleplayToolCall({ toolName: 'eleckoi_read_variables', callId: 'synthetic-material', phase: 'result', useDisclosure,
        inspect: () => { document.body.dataset.inspected = 'readable'; }, block: { kind: 'tool-result', call: { argsRaw: '{}' },
          content: [{ type: 'text', text: JSON.stringify({ status: 'ok', variables: [{ path: '/synthetic/value', current: false, description: '合成字段' }] }) }] } }, () => null)}
      <div style={{ height: 300 }}>合成后续正文</div>
    </>, target)}
  </>;
}
window.__ModuleLoader__ = { load(entry) {
  const modules = { react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM,
    '@deepseek-ai/dsh-client-store': store, '@deepseek-ai/dsh-client-ui-primitives': primitives, '@tanstack/react-virtual': reactVirtual };
  const requireModule = Object.assign(name => {
    if (!(name in modules)) throw Error('Unexpected material fixture dependency ' + name);
    return modules[name];
  }, { asset: name => new URL(name, location.href).href });
  Object.assign(official, entry.factory(requireModule));
  if (official.ReasoningRow && official.ToolRow) createRoot(document.getElementById('root')).render(<Process />);
} };

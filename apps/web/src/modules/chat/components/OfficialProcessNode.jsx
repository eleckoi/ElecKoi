import { createPortal } from 'react-dom';
import { renderRoleplayToolCall } from './RoleplayToolCall.jsx';

/** Move the registered Session renderer into the dialog without copying its data. */
export function OfficialProcessNode({ target, owner, renderOfficial, part, index, onInspect }) {
  return createPortal(<div className="roleplay-process-node" style={{ order: index }}
    data-process-node-key={owner.node.key} data-process-node-kind={owner.node.kind} data-process-part={owner.groupPart}>
    {renderOfficial({
      ...(part === 'reasoning' ? { groupPart: 'reasoning' } : {}),
      ...(owner.node.kind === 'tool-call' ? { renderToolCall: renderRoleplayToolCall } : {}),
      ...(owner.inspectCall ? { inspectCall: callId => { onInspect?.(); owner.inspectCall(callId); } } : {}),
    })}
  </div>, target, owner.node.key);
}

/** Select process content using the official Turn boundary and node placement. */
export function officialProcessPart({ node, turnProcess, groupPart }, answer) {
  // The main row keeps its concise failure status; native notices retain details here.
  if (node.kind === 'turn-error' || node.kind === 'turn-max-tokens') return 'all';
  const spec = turnProcess?.spec;
  if (!spec || ['exchange', 'input', 'turn'].includes(node.groupTree)) return null;
  if (['user', 'steering', 'turn-process', 'turn-tail'].includes(node.kind)) return null;
  if (node.anchorSeq < spec.processStartSeq) return null;
  const closingStep = node.kind === 'assistant-step' && spec.answerStep === node.data.step;
  const liveAnswer = node.kind === 'assistant-step' && node.key === answer?.dshNodeKey
    && Boolean(String(answer.displayContent ?? '').trim());
  // DSH can route the same node through separate reasoning and response seats.
  // The response seat must not render that node's reasoning a second time.
  if (closingStep || liveAnswer) return groupPart !== 'response'
    && (node.data.blocks || []).some(block => block.kind === 'reasoning' && block.text) ? 'reasoning' : null;
  if (spec.answerAnchorSeq !== null && node.anchorSeq >= spec.answerAnchorSeq) return null;
  return 'all';
}

export function officialProcessTurn({ node, turnProcess }) {
  if (turnProcess) return turnProcess.spec.turn;
  return node.location?.kind === 'turn' || node.location?.kind === 'step' ? node.location.turn.turn : undefined;
}

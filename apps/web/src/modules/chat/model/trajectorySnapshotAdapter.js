export function adaptTrajectorySnapshot(official, outcomes, inputIdentities) {
  const abortedTurns = new Set(outcomes?.abortedTurns || []);
  const turnLabels = new Map();
  const inputTurns = new Map();
  const inputs = new Map();
  for (const [index, input] of [...(inputIdentities?.inputs ?? [])].sort((a, b) => a.eventSeq - b.eventSeq).entries()) {
    inputs.set(input.eventSeq, { ...input, round: index + 1 });
    if (input.turn > 0) {
      turnLabels.set(input.turn, index + 1);
      inputTurns.set(input.eventSeq, input.turn);
    }
  }
  for (const link of inputIdentities?.links ?? []) {
    const input = inputs.get(link.inputEventSeq);
    if (input?.messageId !== link.inputMessageId) continue;
    turnLabels.set(link.turn, input.round);
    inputTurns.set(link.inputEventSeq, link.turn);
  }
  return {
    ...official,
    turnLabels,
    inputTurns,
    eventNodes: official.eventNodes.filter((node) => node.source?.kind !== "plugin:eleckoi-request-projection"),
    requests: official.requests
      // DSH 0.2.0-rc.2 classifies a user-cancelled assistant attempt as an
      // error because Trajectory does not retain the turn/end abort reason.
      // Preserve completed work, but do not present the cancelled attempt as
      // a failed request.
      .filter((request) => !(request.purpose === "assistant"
        && request.status === "error"
        && abortedTurns.has(request.turn))),
  };
}

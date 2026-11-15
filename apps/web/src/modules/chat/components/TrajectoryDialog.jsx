import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useCallback, useMemo } from "react";
import { adaptTrajectorySnapshot } from "../model/trajectorySnapshotAdapter.js";

const noop = () => {};

export function TrajectoryView({ renderSlot, viewOwner }) {
  const tUi = useProductTranslation();
  return <section className="trajectory-host" aria-label={tUi("轨迹")}>
    {renderSlot?.("eleckoi.roleplay.trajectory", {
      component: SessionTrajectoryView,
      inspectCall: undefined,
      viewRequest: null,
      openView: noop,
      completeViewRequest: noop,
      ...viewOwner,
    })}
  </section>;
}

function SessionTrajectoryView(props) {
  const official = props.useTrajectory((value) => value);
  const outcomes = props.useProjection("eleckoiTurnOutcomes");
  const inputIdentities = props.useProjection("eleckoiInputContinuations");
  const snapshot = useMemo(
    () => adaptTrajectorySnapshot(official, outcomes, inputIdentities),
    [official, outcomes, inputIdentities],
  );
  const useTrajectory = useCallback((selector) => selector(snapshot), [snapshot]);
  const t = useCallback((key, values) => props.t(key, key === 'turn.label' && values?.turn !== undefined
    ? { ...values, turn: snapshot.turnLabels.get(values.turn) ?? values.turn } : values), [props.t, snapshot.turnLabels]);
  return props.renderNative({ useTrajectory, t });
}

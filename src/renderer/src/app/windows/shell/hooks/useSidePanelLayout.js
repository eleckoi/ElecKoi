import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureInitialWindowSizeOnce } from "../../../services/windowControls.js";

const SIDE_PANEL_DEFAULT = 328;
const SIDE_PANEL_MIN = 264;
const SIDE_PANEL_MAX = 420;
const MAIN_PANEL_MIN = 640;
const CLIENT_HORIZONTAL_INSET = 8;
const RAIL_WIDTH_FOR_LAYOUT = 51;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function useSidePanelLayout() {
  const [sidePanelWidth, setSidePanelWidth] = useState(SIDE_PANEL_DEFAULT);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [sidePanelDragging, setSidePanelDragging] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? 960 : window.innerWidth));
  const shellRef = useRef(null);
  const sidePanelDragBaseRef = useRef(SIDE_PANEL_DEFAULT);
  const sidePanelDragMaxRef = useRef(SIDE_PANEL_MAX);

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    ensureInitialWindowSizeOnce().finally(() => {
      if (!cancelled) setViewportWidth(window.innerWidth);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sidePanelMax = useMemo(() => {
    const bodyWidth = Math.max(0, viewportWidth - CLIENT_HORIZONTAL_INSET);
    const available = bodyWidth - RAIL_WIDTH_FOR_LAYOUT - MAIN_PANEL_MIN;
    return Math.max(SIDE_PANEL_MIN, Math.min(SIDE_PANEL_MAX, available));
  }, [viewportWidth]);
  const effectiveSidePanelWidth = clamp(sidePanelWidth || SIDE_PANEL_DEFAULT, SIDE_PANEL_MIN, sidePanelMax);

  const startSidePanelResize = useCallback(() => {
    const shell = shellRef.current;
    const renderedWidth = shell
      ? parseFloat(getComputedStyle(shell).getPropertyValue("--side-panel-width"))
      : effectiveSidePanelWidth;
    const frameWidth = shell?.getBoundingClientRect().width || viewportWidth;
    sidePanelDragBaseRef.current = Number.isFinite(renderedWidth) ? renderedWidth : effectiveSidePanelWidth;
    sidePanelDragMaxRef.current = Math.max(
      SIDE_PANEL_MIN,
      Math.min(SIDE_PANEL_MAX, frameWidth - RAIL_WIDTH_FOR_LAYOUT - MAIN_PANEL_MIN),
    );
    setSidePanelDragging(true);
  }, [effectiveSidePanelWidth, viewportWidth]);

  const resizeSidePanel = useCallback((deltaX) => {
    setSidePanelWidth(clamp(
      sidePanelDragBaseRef.current + deltaX,
      SIDE_PANEL_MIN,
      sidePanelDragMaxRef.current,
    ));
  }, []);

  return {
    shellRef,
    shellStyle: {
      "--side-panel-width": sidePanelCollapsed ? "0px" : `${effectiveSidePanelWidth}px`,
      "--side-panel-content-width": `${effectiveSidePanelWidth}px`,
    },
    sidePanelCollapsed,
    sidePanelDragging,
    collapseSidePanel: () => setSidePanelCollapsed(true),
    expandSidePanel: () => setSidePanelCollapsed(false),
    startSidePanelResize,
    resizeSidePanel,
    endSidePanelResize: () => setSidePanelDragging(false),
  };
}

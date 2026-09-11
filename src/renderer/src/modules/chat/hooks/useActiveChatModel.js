import { useEffect, useMemo, useRef, useState } from "react";
import {
  getActiveModelSelection,
  listenActiveModelSelectionChanged,
  saveActiveModelSelection,
} from "../../models/index.js";
import {
  normalizeModelSelection,
  reconcileModelSelection,
  resolveModelConfig,
  selectionFromActiveSetting,
  toActiveModelSelection,
} from "../model/chatModelSelection.js";

const DEFAULT_SELECTION = {
  capability: "chat",
  configId: "",
  model: "",
  parameters: { stream: true, temperature: 1, topP: 1 },
};

function errorMessage(error, fallback) {
  if (typeof error === "string" && error.trim()) return error;
  if (error?.message?.trim()) return error.message;
  return fallback;
}

export function useActiveChatModel({ modelConfigs, setStatus }) {
  const [modelSelection, setModelSelection] = useState(DEFAULT_SELECTION);
  const activeModelLoadedRef = useRef(false);
  const modelConfig = useMemo(
    () => resolveModelConfig(modelConfigs, modelSelection),
    [modelConfigs, modelSelection.configId, modelSelection.model],
  );

  async function selectChatModel(nextSelection) {
    const previous = modelSelection;
    const next = normalizeModelSelection(nextSelection, modelSelection.parameters);
    setModelSelection(next);
    try {
      await saveActiveModelSelection(toActiveModelSelection(next));
    } catch (error) {
      setModelSelection(previous);
      setStatus(errorMessage(error, "模型选择保存失败"));
    }
  }

  useEffect(() => {
    let active = true;
    let dispose = () => {};
    getActiveModelSelection().then((selection) => {
      if (!active) return;
      activeModelLoadedRef.current = true;
      setModelSelection(selectionFromActiveSetting(selection));
    }).catch((error) => setStatus(errorMessage(error, "模型选择读取失败")));
    listenActiveModelSelectionChanged((selection) => {
      if (active) setModelSelection(selectionFromActiveSetting(selection));
    }).then((cleanup) => {
      if (active) dispose = cleanup;
      else cleanup();
    }).catch(() => {});
    return () => {
      active = false;
      dispose();
    };
  }, []);

  useEffect(() => {
    if (!modelConfigs?.length) return;
    const next = reconcileModelSelection(modelSelection, modelConfigs);
    if (next.configId === modelSelection.configId && next.model === modelSelection.model) return;
    setModelSelection(next);
    if (activeModelLoadedRef.current) {
      saveActiveModelSelection(toActiveModelSelection(next)).catch((error) => {
        setStatus(errorMessage(error, "模型选择保存失败"));
      });
    }
  }, [modelConfigs, modelSelection.configId, modelSelection.model]);

  return { modelConfig, modelSelection, selectChatModel };
}

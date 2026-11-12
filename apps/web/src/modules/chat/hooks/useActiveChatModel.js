import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeModelSelection, resolveModelConfig } from "../model/chatModelSelection.js";

const DEFAULT_SELECTION = {
  capability: "chat",
  configId: "",
  model: "",
};

function errorMessage(error, fallback) {
  if (typeof error === "string" && error.trim()) return error;
  if (error?.message?.trim()) return error.message;
  return fallback;
}

function fromDshSelection(selection = {}) {
  return normalizeModelSelection({
    capability: "chat",
    configId: selection.provider || "",
    model: selection.model || "",
  });
}

export function useActiveChatModel({ conversations, conversationId, modelConfigs, setStatus }) {
  const [modelSelection, setModelSelection] = useState(DEFAULT_SELECTION);
  const generationRef = useRef(0);
  const configKey = JSON.stringify((modelConfigs || []).map(config => [config.id, config.model,
    config.enabled, config.credentialConfigured, (config.model_options || []).map(option => option.id)]));
  const modelConfig = useMemo(
    () => resolveModelConfig(modelConfigs, modelSelection),
    [modelConfigs, modelSelection.configId, modelSelection.model],
  );

  async function selectChatModel(nextSelection) {
    if (!conversations) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪。", { what: "DSH 聊天服务" });
    const generation = ++generationRef.current;
    const previous = modelSelection;
    const next = normalizeModelSelection(nextSelection);
    setModelSelection(next);
    try {
      const selected = await conversations.selectModel(conversationId, {
        provider: next.configId,
        model: next.model,
      });
      if (generation === generationRef.current) setModelSelection(fromDshSelection(selected));
    } catch (error) {
      if (generation === generationRef.current) {
        setModelSelection(previous);
        setStatus(errorMessage(error, "模型选择保存失败"));
      }
      throw error;
    }
  }

  useEffect(() => {
    const generation = ++generationRef.current;
    const fallback = (modelConfigs || []).find(config => config.enabled !== false
      && config.credentialConfigured !== false && (config.model || config.model_options?.[0]?.id));
    const defaultSelection = fallback ? normalizeModelSelection({ configId: fallback.id,
      model: fallback.model || fallback.model_options[0].id }) : DEFAULT_SELECTION;
    if (!conversations) {
      setModelSelection(defaultSelection);
      return;
    }
    setModelSelection(DEFAULT_SELECTION);
    conversations.readModelSelection(conversationId).then((selection) => {
      if (generation !== generationRef.current) return;
      const current = fromDshSelection(selection);
      setModelSelection(current);
    }).catch((error) => {
      if (generation === generationRef.current) setStatus(errorMessage(error, "模型选择读取失败"));
    });
    return () => { generationRef.current += 1; };
  }, [conversations, conversationId, setStatus, configKey]);

  useEffect(() => {
    if (!conversations?.subscribeDetails || !conversationId) return undefined;
    let face, stop = () => {};
    const update = () => {
      const selection = face?.getSnapshot()?.next;
      if (selection) setModelSelection(fromDshSelection(selection));
    };
    const bind = () => {
      const details = conversations.getDetailsSnapshot();
      const reference = details.id === conversationId
        ? conversations.getSessionReference(details.details?.runtimeSessionId) : null;
      const next = reference?.binding.session.projections.faceOf('modelSelection');
      if (next === face) return;
      stop(); face = next; stop = face?.subscribe(update) || (() => {}); update();
    };
    const stopDetails = conversations.subscribeDetails(bind); bind();
    return () => { stopDetails(); stop(); };
  }, [conversations, conversationId]);

  return { modelConfig, modelSelection, selectChatModel };
}

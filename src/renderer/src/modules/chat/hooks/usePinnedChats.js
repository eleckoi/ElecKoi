import { useEffect, useState } from "react";
import { getUiPreferences, saveUiPreferences } from "../../settings/index.js";

function normalizePinnedIds(ids) {
  const next = [];
  for (const id of ids || []) {
    const value = String(id || "").trim();
    if (value && !next.includes(value)) {
      next.push(value);
    }
  }
  return next;
}

function persistPinnedIds(ids) {
  saveUiPreferences({ pinned_chat_ids: normalizePinnedIds(ids) }).catch(() => {});
}

export function usePinnedChats() {
  const [pinnedIds, setPinnedIds] = useState([]);

  useEffect(() => {
    let active = true;
    getUiPreferences()
      .then((data) => {
        if (active) {
          setPinnedIds(normalizePinnedIds(data?.pinned_chat_ids));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function togglePinChat(chatId) {
    setPinnedIds((items) => {
      const id = String(chatId || "").trim();
      if (!id) return items;
      const next = items.includes(id) ? items.filter((item) => item !== id) : [id, ...items];
      persistPinnedIds(next);
      return next;
    });
  }

  function unpinChat(chatId) {
    setPinnedIds((items) => {
      const id = String(chatId || "").trim();
      if (!id) return items;
      const next = items.filter((item) => item !== id);
      persistPinnedIds(next);
      return next;
    });
  }

  return { pinnedIds, togglePinChat, unpinChat };
}

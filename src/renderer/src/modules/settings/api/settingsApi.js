import { emitSetting, listenSetting, readSetting, writeSetting } from "../../../bridge/settingsClient.js";

const UI_PREFERENCES_KEY = "appearance.ui";
let uiPreferencesWriteQueue = Promise.resolve();

export function getUiPreferences() {
  return readSetting(UI_PREFERENCES_KEY);
}

function updateUiPreferences(update) {
  const operation = uiPreferencesWriteQueue.then(async () => {
    const current = await getUiPreferences();
    return writeSetting(UI_PREFERENCES_KEY, update(current || {}));
  });
  uiPreferencesWriteQueue = operation.catch(() => {});
  return operation;
}

export function saveUiPreferences(payload) {
  return updateUiPreferences((current) => ({ ...current, ...payload }));
}

export async function getListCollapseState(area) {
  const current = await getUiPreferences();
  return current?.list_collapse_state?.[area] || {};
}

export function saveListCollapseState(area, collapsedGroups) {
  return updateUiPreferences((current) => ({
    ...current,
    list_collapse_state: {
      ...(current.list_collapse_state || {}),
      [area]: collapsedGroups,
    },
  }));
}

export function emitUiPreferencesChanged(payload) {
  emitSetting(UI_PREFERENCES_KEY, payload);
}

export async function listenUiPreferencesChanged(handler) {
  return listenSetting(UI_PREFERENCES_KEY, handler);
}

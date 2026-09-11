import { desktopClient } from "./desktopClient.ts";

const listenersByKey = new Map();
let disposeDesktopListener = null;

function ensureDesktopListener() {
  if (disposeDesktopListener) return;
  disposeDesktopListener = desktopClient.on("settings.changed", ({ key, value }) => {
    for (const listener of listenersByKey.get(key) || []) listener(value);
  });
}

function disposeDesktopListenerIfIdle() {
  if (!disposeDesktopListener || [...listenersByKey.values()].some((listeners) => listeners.size > 0)) return;
  disposeDesktopListener();
  disposeDesktopListener = null;
}

export function readSetting(key) {
  return desktopClient.request("query.settings.read", { key });
}

export function writeSetting(key, value) {
  return desktopClient.request("command.settings.write", { key, value });
}

export function emitSetting(key, value) {
  for (const listener of listenersByKey.get(key) || []) listener(value);
}

export function listenSetting(key, handler) {
  const listeners = listenersByKey.get(key) || new Set();
  listeners.add(handler);
  listenersByKey.set(key, listeners);
  ensureDesktopListener();
  return () => {
    listeners.delete(handler);
    if (listeners.size === 0) listenersByKey.delete(key);
    disposeDesktopListenerIfIdle();
  };
}

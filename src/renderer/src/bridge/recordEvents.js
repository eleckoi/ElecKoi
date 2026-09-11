import { desktopClient } from "./desktopClient.ts";

export function listenRecordsChanged(handler) {
  return desktopClient.on("records.changed", handler);
}

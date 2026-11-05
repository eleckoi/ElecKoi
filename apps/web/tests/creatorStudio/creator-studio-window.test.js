import { afterEach, describe, expect, it, vi } from "vitest";
import { openCreatorStudioWindow } from "../../src/modules/creatorStudio/window/openCreatorStudioWindow.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Creator studio window launcher", () => {
  it("selects the resident creator studio without opening or navigating a window", () => {
    const open = vi.fn(() => null);
    const assign = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", {
      dispatchEvent,
      location: {
        href: "http://127.0.0.1:5173/?view=chat&chat=conversation-1",
        assign,
      },
      open,
    });

    openCreatorStudioWindow();

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({ type: 'eleckoi:shell-action', detail: 'creatorStudio' });
    expect(open).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});

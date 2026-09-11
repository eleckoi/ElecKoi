import { afterEach, describe, expect, it, vi } from "vitest";
import { openCharacterEditorWindow } from "../src/renderer/src/modules/persona/window/openCharacterEditorWindow.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Character editor window launcher", () => {
  it("opens the selected character in a separate window without navigating the current window", () => {
    const open = vi.fn(() => null);
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: {
        href: "http://127.0.0.1:5173/?view=chat&chat=conversation-1",
        assign,
      },
      open,
    });

    openCharacterEditorWindow("character-1");

    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(
      "http://127.0.0.1:5173/?view=character-editor&character=character-1",
      "character-editor-character-1",
      "width=1520,height=1120",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("does nothing when no character is selected", () => {
    const open = vi.fn();
    vi.stubGlobal("window", {
      location: { href: "http://127.0.0.1:5173/" },
      open,
    });

    openCharacterEditorWindow("");

    expect(open).not.toHaveBeenCalled();
  });
});

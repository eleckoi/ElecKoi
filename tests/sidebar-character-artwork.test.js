import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_CHARACTER_ARTWORK,
  normalizeSidebarCharacterArtwork,
} from "../src/renderer/src/modules/appearance/preferences/sidebarCharacterArtwork.js";

describe("sidebar character artwork preference", () => {
  it("uses cover artwork as the desktop default and preserves the avatar option", () => {
    expect(DEFAULT_SIDEBAR_CHARACTER_ARTWORK).toBe("cover");
    expect(normalizeSidebarCharacterArtwork(undefined)).toBe("cover");
    expect(normalizeSidebarCharacterArtwork("cover")).toBe("cover");
    expect(normalizeSidebarCharacterArtwork("avatar")).toBe("avatar");
    expect(normalizeSidebarCharacterArtwork("circle")).toBe("cover");
  });
});

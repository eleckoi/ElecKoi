import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_CHARACTER_ARTWORK,
  normalizeSidebarCharacterArtwork,
} from "../src/renderer/src/modules/appearance/preferences/sidebarCharacterArtwork.js";
import { characterDescription } from "../src/renderer/src/utils/characterDisplay.js";

describe("sidebar character artwork preference", () => {
  it("uses cover artwork as the desktop default and preserves the avatar option", () => {
    expect(DEFAULT_SIDEBAR_CHARACTER_ARTWORK).toBe("cover");
    expect(normalizeSidebarCharacterArtwork(undefined)).toBe("cover");
    expect(normalizeSidebarCharacterArtwork("cover")).toBe("cover");
    expect(normalizeSidebarCharacterArtwork("avatar")).toBe("avatar");
    expect(normalizeSidebarCharacterArtwork("circle")).toBe("cover");
  });

  it("uses the introduction first, then the opening, without adding placeholder copy", () => {
    expect(characterDescription({ profileLike: "  一段角色简介  " })).toBe("一段角色简介");
    expect(characterDescription({ description: "正式简介", profileLike: "旧简介" })).toBe("正式简介");
    expect(characterDescription({ profileLike: "   ", primaryOpening: "  设定库里的主开场白。  " })).toBe("设定库里的主开场白。");
    expect(characterDescription({ profileLike: "角色简介", primaryOpening: "主开场白" })).toBe("角色简介");
    expect(characterDescription({ persona: { opening: "Agent 开场白" } })).toBe("Agent 开场白");
    expect(characterDescription({})).toBe("");
  });
});

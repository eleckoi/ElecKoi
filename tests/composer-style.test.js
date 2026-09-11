import { describe, expect, it } from "vitest";
import { DEFAULT_COMPOSER_STYLE, normalizeComposerStyle } from "../src/renderer/src/modules/appearance/preferences/composerStyle.js";

describe("composer style preference", () => {
  it("uses the glass composer as the default", () => {
    expect(DEFAULT_COMPOSER_STYLE).toBe("glass");
    expect(normalizeComposerStyle(undefined)).toBe("glass");
    expect(normalizeComposerStyle("unknown")).toBe("glass");
  });

  it("keeps an explicitly selected original composer", () => {
    expect(normalizeComposerStyle("standard")).toBe("standard");
  });
});

import { describe, expect, it } from "vitest";
import {
  commitKeywordDraft,
  splitKeywordDraft,
} from "../src/renderer/src/modules/settingLibraries/model/settingLibraryKeywords.js";

describe("setting-library keyword tag input", () => {
  it("commits comma, Chinese punctuation and newline separated values without duplicates", () => {
    expect(commitKeywordDraft(["已有"], "旅行，夏天、旅行\n夜晚")).toEqual([
      "已有",
      "旅行",
      "夏天",
      "夜晚",
    ]);
  });

  it("commits completed tags while preserving the unfinished draft", () => {
    expect(splitKeywordDraft([], "旅行，夏天")).toEqual({ keywords: ["旅行"], draft: "夏天" });
    expect(splitKeywordDraft(["旅行"], "夜晚、")).toEqual({ keywords: ["旅行", "夜晚"], draft: "" });
  });
});

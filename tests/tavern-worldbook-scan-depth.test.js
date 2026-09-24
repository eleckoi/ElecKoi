import { describe, expect, it } from "vitest";
import { decodeCharacterCard } from "../src/main/modules/characterTransfer/characterCardFormats";
import { parseSettingLibraryFile } from "../src/renderer/src/modules/settingLibraries/model/settingLibraryTransfer.js";

// 回归：卡里显式写下的扫描深度必须被保留。
// 主进程导入路径完全不写 keywordScanDepth（落到 emptyEntry 的默认值 1），
// 渲染进程路径则字面写死 1。修复后按四级回退解析：
// extensions.scan_depth → 顶层 scanDepth → 书级 scan_depth → SillyTavern 的默认值 2。

function card(book) {
  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      name: "扫描深度回归卡",
      description: "描述",
      first_mes: "你好。",
      alternate_greetings: [],
      character_book: { name: "世界", ...book },
      extensions: {},
    },
  };
}

function importedDepth(book, title) {
  const bytes = new TextEncoder().encode(JSON.stringify(card(book)));
  const decoded = decodeCharacterCard(bytes, "sillytavern");
  return decoded.settingLibrary?.entries.find((entry) => entry.title === title)?.keywordScanDepth;
}

function worldBookDepth(entries, title) {
  const parsed = parseSettingLibraryFile(JSON.stringify({ entries }), "sillytavern");
  return parsed.entries.find((entry) => entry.title === title)?.keywordScanDepth;
}

describe("tavern world book scan depth", () => {
  it("keeps extensions.scan_depth from an embedded character book", () => {
    expect(importedDepth({ entries: [{ name: "甲", content: "A", keys: ["甲"], extensions: { scan_depth: 5 } }] }, "甲")).toBe(5);
  });

  it("keeps the top-level scanDepth that native worlds/*.json entries use", () => {
    expect(importedDepth({ entries: [{ name: "乙", content: "B", keys: ["乙"], scanDepth: 6 }] }, "乙")).toBe(6);
  });

  it("falls back to the book-level scan_depth when the entry declares none", () => {
    expect(importedDepth({ scan_depth: 4, entries: [{ name: "丙", content: "C", keys: ["丙"] }] }, "丙")).toBe(4);
  });

  it("falls back to SillyTavern's world_info_depth default of 2", () => {
    expect(importedDepth({ entries: [{ name: "丁", content: "D", keys: ["丁"] }] }, "丁")).toBe(2);
  });

  it("keeps the top-level scanDepth on the standalone world book import path", () => {
    expect(worldBookDepth({ 0: { uid: 0, key: ["戊"], comment: "戊", content: "E", scanDepth: 5 } }, "戊")).toBe(5);
  });
});

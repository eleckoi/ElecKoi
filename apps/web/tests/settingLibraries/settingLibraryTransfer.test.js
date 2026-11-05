import { describe, expect, it, vi } from "vitest";
import { settingLibrarySchema } from "../../../../packages/shared/src/contracts/settingLibrary/schemas";
import {
  createLibraryVersion,
  deleteActiveLibraryVersion,
  importLibraryAsVersion,
  mergeSettingLibraryEntries,
  parseSettingLibraryFile,
  serializeSettingLibrary,
  switchLibraryVersion,
} from "../../src/modules/settingLibraries/model/settingLibraryTransfer.js";

function entry(id, title, groupId = "", order = 1) {
  return {
    id, title, iconId: "", kind: "normal", groupId, content: `${title}正文`, openingMessages: [],
    defaultOpeningMessageId: "", agentSelectionHint: "", agentReadStrategy: "normal",
    dynamicMode: "standard", contentMode: "plain_text", keywords: [], keywordScanDepth: 1,
    conditionKeywords: [], keywordCondition: "none", keywordUseRegex: false, keywordIgnoreCase: true,
    keywordWholeWord: false, keywordRecursionDepth: 0, triggerMode: "always", enabled: true,
    position: "insert_point_1", promptPositionId: "", insertRole: "user", order,
    viewOrder: order, groupViewOrder: order, treeViewOrder: order, createdAt: "", updatedAt: "",
  };
}

function fixed(id, kind, title) {
  return { ...entry(id, title), kind, openingMessages: kind === "opening" ? [{ id: "opening", title: "默认开场", content: "" }] : [], defaultOpeningMessageId: kind === "opening" ? "opening" : "" };
}

function version(id, name, entries, groups = []) {
  return { id, name, entries, groups, promptPositions: [], listAllExpanded: true, expandedGroupIds: [], createdAt: "", updatedAt: "" };
}

function library() {
  const fixedEntries = [];
  const first = version("v1", "第一版", [...fixedEntries, entry("a", "旧设定")]);
  const second = version("v2", "第二版", [...fixedEntries, entry("b", "第二版设定")]);
  return {
    characterId: "character-1", name: first.name, entries: first.entries, groups: [], promptPositions: [],
    activeVersionId: first.id, versions: [first, second], listAllExpanded: true, expandedGroupIds: [],
  };
}

describe("setting-library versions and transfer", () => {
  it('uses file names only when the imported worldbook has no embedded book name', () => {
    const entries = { 0: { uid: 0, key: ['合成关键词'], comment: '合成条目', content: '合成正文' } };
    const parse = book => parseSettingLibraryFile(JSON.stringify(book), 'sillytavern', '合成文件名.JSON');
    expect(parse({ entries }).name).toBe('合成文件名');
    expect(parse({ entries }).groups[0].name).toBe('合成文件名');
    expect(parse({ entries, originalData: { name: '合成卡内书名', entries: [] } }).name).toBe('合成卡内书名');
    expect(parse({ entries, name: '合成书内名称' }).name).toBe('合成书内名称');
    expect(parse({ character_book: { name: '合成角色世界书', entries: Object.values(entries) } }).name).toBe('合成角色世界书');
  });
  it("maps SillyTavern world book scan depth onto the keyword scan window", () => {
    const depthOf = (book, title) => parseSettingLibraryFile(JSON.stringify(book), "sillytavern")
      .entries.find((item) => item.title === title)?.keywordScanDepth;

    // 卡内嵌形态（V2/V3 规范）：extensions.scan_depth
    expect(depthOf({ entries: { 0: { comment: "条目级优先", content: "A", keys: ["甲"], extensions: { scan_depth: 4 } } } }, "条目级优先")).toBe(4);
    expect(depthOf({ scan_depth: 3, entries: { 0: { comment: "跟随书级", content: "B", keys: ["乙"], extensions: { scan_depth: null } } } }, "跟随书级")).toBe(3);
    expect(depthOf({ entries: { 0: { comment: "缺省兜底", content: "C", keys: ["丙"] } } }, "缺省兜底")).toBe(2);
    expect(depthOf({ entries: { 0: { comment: "完整保留大深度", content: "D", keys: ["丁"], extensions: { scan_depth: 2000 } } } }, "完整保留大深度")).toBe(2000);
    expect(depthOf({ entries: { 0: { comment: "零值抬到最小", content: "E", keys: ["戊"], extensions: { scan_depth: 0 } } } }, "零值抬到最小")).toBe(1);
    expect(depthOf({ scan_depth: 3, entries: { 0: { comment: "条目级覆盖书级", content: "F", keys: ["己"], extensions: { scan_depth: 5 } } } }, "条目级覆盖书级")).toBe(5);

    // 酒馆原生形态（worlds/*.json 运行时字段名）：条目顶层 scanDepth
    expect(depthOf({ entries: { 0: { uid: 0, key: ["庚"], comment: "原生条目", content: "G", scanDepth: 6 } } }, "原生条目")).toBe(6);
    expect(depthOf({ entries: { 0: { uid: 0, key: ["辛"], comment: "原生零值", content: "H", scanDepth: 0 } } }, "原生零值")).toBe(1);
    expect(depthOf({ entries: { 0: { uid: 0, key: ["壬"], comment: "原生缺省", content: "I" } } }, "原生缺省")).toBe(2);
  });

  it("keeps unsaved active edits when switching versions", () => {
    const source = library();
    source.entries = source.entries.map((item) => item.id === "a" ? { ...item, content: "未保存修改" } : item);
    const switched = switchLibraryVersion(source, "v2");
    expect(switched.activeVersionId).toBe("v2");
    expect(switched.entries.find((item) => item.id === "b")).toBeTruthy();
    expect(switched.versions.find((item) => item.id === "v1").entries.find((item) => item.id === "a").content).toBe("未保存修改");
  });

  it("creates a copy or a blank version without saving it", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValueOnce("copy").mockReturnValueOnce("blank") });
    const copied = createLibraryVersion(library(), "副本", "v1");
    expect(copied).toMatchObject({ activeVersionId: "library-copy", name: "副本" });
    expect(copied.entries.some((item) => item.id === "a")).toBe(true);
    const blank = createLibraryVersion(copied, "空白", "");
    expect(blank).toMatchObject({ activeVersionId: "library-blank", name: "空白" });
    expect(blank.entries.map((item) => item.id)).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("replaces the final deleted version with one blank version", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "replacement" });
    const source = library();
    source.versions = [source.versions[0]];
    const deleted = deleteActiveLibraryVersion(source);
    expect(deleted.versions).toHaveLength(1);
    expect(deleted).toMatchObject({ activeVersionId: "library-replacement", name: "新版本" });
    expect(deleted.entries.map((item) => item.id)).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("round-trips the Android-aligned ElecKoi v3 export as a new version", () => {
    const source = library();
    const parsed = parseSettingLibraryFile(serializeSettingLibrary(source), "eleckoi");
    expect(parsed).toMatchObject({ name: "第一版" });
    expect(parsed.entries.find((item) => item.id === "a")).toMatchObject({ title: "旧设定", content: "旧设定正文" });
    const imported = importLibraryAsVersion(source, parsed);
    expect(imported.versions).toHaveLength(3);
    expect(imported.activeVersionId).not.toBe("v1");
  });

  it('separates a content-only legacy opening without losing its text', () => {
    const legacy = JSON.parse(serializeSettingLibrary(library()));
    legacy.entries.push({ id: 'fixed-opening-assistant', kind: 'opening', content: '合成旧版完整正文', enabled: false });
    const parsed = parseSettingLibraryFile(JSON.stringify(legacy), 'eleckoi');
    expect(parsed.openingImport).toEqual({ enabled: false, defaultOpeningMessageId: 'opening-default', openingMessages: [
      { id: 'opening-default', title: '默认开场', content: '合成旧版完整正文' },
    ] });
    expect(parsed.entries.every(entry => entry.kind !== 'opening')).toBe(true);
  });

  it("rebuilds selected folder ancestors and resolves title and order collisions when merging", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValueOnce("parent").mockReturnValueOnce("nested").mockReturnValueOnce("entry") });
    const target = library();
    target.entries.push(entry("taken", "重复", "", 1));
    const imported = version("source", "来源", [entry("source-entry", "重复", "nested", 1)], [
      { id: "parent", name: "父级", parentId: "", order: 1, treeViewOrder: 1, createdAt: "", updatedAt: "" },
      { id: "nested", name: "子级", parentId: "parent", order: 1, treeViewOrder: 1, createdAt: "", updatedAt: "" },
    ]);
    const merged = mergeSettingLibraryEntries(target, imported, new Set(["source-entry"]));
    expect(merged.plan).toMatchObject({ entryCount: 1, newFolderCount: 2, renamedEntryCount: 0, reorderedEntryCount: 1 });
    const importedEntry = merged.library.entries.find((item) => item.id === "setting-entry");
    expect(importedEntry).toMatchObject({ title: "重复", groupId: "group-nested", order: 2 });
    vi.unstubAllGlobals();
  });

  it("exports and imports setting identities without attaching role openings", () => {
    const source = library();
    source.groups = [{ id: "synthetic-folder", name: "合成文件夹", parentId: "", order: 1, treeViewOrder: 1, createdAt: "", updatedAt: "" }];
    source.promptPositions = [{ id: "synthetic-position", name: "合成位置", anchor: "instructions", side: "after_setting_position", order: 1, createdAt: "", updatedAt: "" }];
    source.entries[0] = { ...source.entries[0], groupId: 'synthetic-folder', promptPositionId: 'synthetic-position' };
    const exported = serializeSettingLibrary(source);
    expect(JSON.parse(exported).entries.map(item => item.id)).toEqual(['a']);
    const imported = importLibraryAsVersion(source, parseSettingLibraryFile(exported, 'eleckoi'));
    expect(imported.entries).toEqual(source.entries);
    expect(imported.groups).toEqual(source.groups);
    expect(imported.promptPositions).toEqual(source.promptPositions);
    expect(imported.openingImports).toBeUndefined();
    expect(switchLibraryVersion(imported, 'v1').entries).toEqual(source.entries);
  });

  it('preserves every long setting and imports openings explicitly included in an existing v3 file', () => {
    const source = library();
    const opening = fixed("fixed-opening-assistant", "opening", "合成旧开场白");
    opening.enabled = false;
    opening.openingMessages[0] = { ...opening.openingMessages[0], content: '合成角色开场正文', variableVersionId: 'synthetic-version' };
    source.entries.push(...Array.from({ length: 10001 }, (_, index) => ({ ...entry(`synthetic-${index}`, `合成设定 ${index}`),
      content: `${index}：${'合成长正文。'.repeat(200)}末尾关键词` })));
    const exported = JSON.parse(serializeSettingLibrary(source));
    expect(exported.entries).toHaveLength(10002);
    for (const index of [0, 5000, 10000]) expect(exported.entries[index + 1].content).toBe(source.entries[index + 1].content);
    expect(exported.entries.filter(item => item.content.endsWith('末尾关键词'))).toHaveLength(10001);
    const legacy = { ...exported, entries: [{ ...exported.entries[0], id: opening.id, kind: 'opening',
      enabled: opening.enabled, opening_messages: [{ id: 'legacy-opening', title: '合成旧开场', content: '合成旧开场正文',
        variable_version_id: 'synthetic-legacy-version', initial_variable_state: '{"score":7}' }],
      default_opening_message_id: 'legacy-opening' }, ...exported.entries] };
    const imported = importLibraryAsVersion(source, parseSettingLibraryFile(JSON.stringify(legacy), 'eleckoi'));
    expect(imported.openingImports).toMatchObject([{ id: 'legacy-opening', content: '合成旧开场正文', variableVersionId: 'synthetic-legacy-version' }]);
    expect(imported.entries.every(entry => entry.kind !== 'opening')).toBe(true);
    expect(imported.entries).toHaveLength(10002);
  });

  it("imports a SillyTavern world book into one folder", () => {
    const parsed = parseSettingLibraryFile(JSON.stringify({ name: "世界书", entries: { 0: { comment: "地点", content: "内容", keys: ["城堡"] } } }), "sillytavern");
    expect(parsed.name).toBe("世界书");
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({ title: "地点", keywords: ["城堡"], agentReadStrategy: "keyword" });
  });

  it.each(['entries', 'character_book', 'data.character_book'])('produces saveable entries for %s in both version imports and merges', (shape) => {
    const entries = [
      { comment: 'Synthetic keyword', content: 'Synthetic text', key: ['synthetic-key'], disable: true },
      { comment: 'Synthetic constant', content: 'Synthetic constant text', constant: true },
      { comment: 'Synthetic controller', content: '<%- await getwi(null, "Synthetic reference") %>', constant: true },
      { comment: 'Synthetic reference', content: 'Synthetic reference text' },
    ];
    const source = shape === 'entries' ? { entries: Object.fromEntries(entries.map((item, index) => [index, item])) }
      : shape === 'character_book' ? { character_book: { entries } } : { data: { character_book: { entries } } };
    const parsed = parseSettingLibraryFile(JSON.stringify(source), 'sillytavern');
    expect(Object.fromEntries(parsed.entries.map(item => [item.title, item.contentMode]))).toEqual({
      'Synthetic keyword': 'plain_text', 'Synthetic constant': 'plain_text',
      'Synthetic controller': 'ejs', 'Synthetic reference': 'plain_text',
    });
    const imported = importLibraryAsVersion(library(), parsed);
    expect(() => settingLibrarySchema.parse(imported)).not.toThrow();
    expect(imported.versions.find(item => item.id === 'v1').entries.find(item => item.id === 'a')).toMatchObject({ content: '旧设定正文' });
    const merged = mergeSettingLibraryEntries(library(), parsed, parsed.entries.map(item => item.id)).library;
    expect(() => settingLibrarySchema.parse(merged)).not.toThrow();
    expect(merged.activeVersionId).toBe('v1');
    expect(merged.entries.find(item => item.id === 'a')).toMatchObject({ content: '旧设定正文' });
    expect(merged.entries.find(item => item.title === 'Synthetic keyword')).toMatchObject({ contentMode: 'plain_text', enabled: false });
    const exported = parseSettingLibraryFile(serializeSettingLibrary(imported), 'eleckoi');
    expect(exported.entries.map(item => item.contentMode)).toEqual(imported.entries.filter(item => item.kind !== "opening").map(item => item.contentMode));
  });

  it("classifies EJS controllers and their getwi references like Android", () => {
    const parsed = parseSettingLibraryFile(JSON.stringify({ name: "剧情", entries: {
      0: { comment: "章节控制器", content: '<%- await getwi(null, "第一章") %>', constant: true },
      1: { comment: "第一章", content: "章节正文", disable: true },
      2: { comment: "普通设定", content: "普通正文", constant: true },
    } }), "sillytavern");
    expect(parsed.entries.find((item) => item.title === "章节控制器")).toMatchObject({
      dynamicMode: "standard",
      agentReadStrategy: "normal",
      contentMode: "ejs",
    });
    expect(parsed.entries.find((item) => item.title === "第一章")).toMatchObject({
      dynamicMode: "ejs_reference",
      agentReadStrategy: "normal",
      enabled: true,
    });
    expect(parsed.entries.find((item) => item.title === "普通设定")?.dynamicMode).toBe("standard");
  });
});

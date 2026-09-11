import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { apply as applySettingLibraryTools } from "../resources/dsh/setting-library-tools.mjs";

const directories = [];

afterEach(() => {
  delete process.env.ELECKOI_SETTING_LIBRARY_ENABLED;
  delete process.env.ELECKOI_SETTING_LIBRARY_STATE_FILE;
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function tools({ extraEntries = [], history = [], variableState = {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "eleckoi-setting-library-tools-"));
  directories.push(directory);
  const file = join(directory, "state.json");
  writeFileSync(file, JSON.stringify({
    enabled: true,
    library: {
      groups: [
        { id: "world", name: "世界", parentId: "", order: 1 },
        { id: "city", name: "城市", parentId: "world", order: 1 },
      ],
      entries: [
        entry({ id: "required", title: "总览", groupId: "world", content: "王都是晴天。", agentReadStrategy: "required" }),
        entry({ id: "city", title: "港口", groupId: "city", content: "港口终年多雾。", agentSelectionHint: "抵达港口时读取" }),
        entry({ id: "always", title: "自动注入", groupId: "", content: "不应出现在工具目录。", triggerMode: "always" }),
        entry({ id: "disabled", title: "已停用", groupId: "", content: "不可读取。", enabled: false }),
        ...extraEntries,
      ],
    },
    history,
    variableState,
  }, null, 2));
  process.env.ELECKOI_SETTING_LIBRARY_ENABLED = "1";
  process.env.ELECKOI_SETTING_LIBRARY_STATE_FILE = file;
  const registered = [];
  applySettingLibraryTools({ tools: { register: (definition) => { registered.push(definition); return () => undefined; } } });
  return { file, byName: new Map(registered.map((definition) => [definition.name, definition])) };
}

function entry(overrides) {
  return {
    id: "entry",
    title: "设定",
    iconId: "setting",
    kind: "normal",
    groupId: "",
    content: "",
    agentSelectionHint: "",
    agentReadStrategy: "normal",
    dynamicMode: "single_condition",
    triggerMode: "agent_tool",
    enabled: true,
    order: 1,
    ...overrides,
  };
}

describe("DSH character setting-library tools", () => {
  it("exposes only enabled Agent-readable files and returns required-file metadata", async () => {
    const runtime = await tools();
    expect([...runtime.byName.keys()]).toEqual([
      "eleckoi_glob_setting_files",
      "eleckoi_grep_setting_files",
      "eleckoi_read_setting_files",
      "eleckoi_apply_setting_patch",
    ]);

    const found = await runtime.byName.get("eleckoi_glob_setting_files").execute({ pattern: "**" });
    expect(found.files.map((file) => file.path)).toEqual(["世界/总览", "世界/城市/港口"]);
    expect(found.required_files).toEqual([{
      path: "世界/总览",
      title: "总览",
      read_strategy: "required",
      selection_hint: "",
    }]);

    const searched = await runtime.byName.get("eleckoi_grep_setting_files").execute({
      pattern: "多雾",
      path: "世界/城市",
      output_mode: "content",
    });
    expect(searched.matches).toEqual([expect.objectContaining({ path: "世界/城市/港口", text: "港口终年多雾。" })]);

    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["世界/城市/港口"] });
    expect(read.files[0]).toMatchObject({
      path: "世界/城市/港口",
      selection_hint: "抵达港口时读取",
      content: "港口终年多雾。",
    });
  });

  it("supports the complete Android patch operation set on the conversation snapshot", async () => {
    const runtime = await tools();
    const patch = runtime.byName.get("eleckoi_apply_setting_patch");

    await expect(patch.execute({ operation: "make_directory", path: "世界/支线" }))
      .resolves.toMatchObject({ status: "ok", operation: "make_directory" });
    await expect(patch.execute({ operation: "write_file", path: "世界/支线/天气", content: "小雨。" }))
      .resolves.toMatchObject({ status: "ok", created: true });
    await expect(patch.execute({ operation: "edit_file", path: "世界/支线/天气", old_string: "小雨", new_string: "暴雨" }))
      .resolves.toMatchObject({ status: "ok", replacements: 1 });
    await expect(patch.execute({ operation: "move_file", path: "世界/支线/天气", destination: "世界/支线/气候" }))
      .resolves.toMatchObject({ status: "ok", destination: "世界/支线/气候" });
    await expect(patch.execute({ operation: "move_directory", path: "世界/支线", destination: "资料/支线" }))
      .resolves.toMatchObject({ status: "ok", destination: "资料/支线" });

    const afterMove = JSON.parse(readFileSync(runtime.file, "utf8"));
    const movedEntry = afterMove.library.entries.find((item) => item.title === "气候");
    expect(movedEntry.content).toBe("暴雨。");

    await expect(patch.execute({ operation: "delete_file", path: "资料/支线/气候" }))
      .resolves.toMatchObject({ status: "ok", operation: "delete_file" });
    await expect(patch.execute({ operation: "delete_directory", path: "资料" }))
      .resolves.toMatchObject({ status: "ok", operation: "delete_directory" });

    const finalState = JSON.parse(readFileSync(runtime.file, "utf8"));
    expect(finalState.library.entries.some((item) => item.title === "气候")).toBe(false);
    expect(finalState.library.groups.some((group) => group.name === "资料")).toBe(false);
  });

  it("treats a hidden timeline configured for Agent reading as a readable setting", async () => {
    const runtime = await tools({
      extraEntries: [entry({
        id: "built-in-hidden-tool-timeline",
        title: "隐藏工具时间线",
        kind: "hidden_tool_timeline",
        content: "按需读取的时间线协议。",
      })],
    });

    const found = await runtime.byName.get("eleckoi_glob_setting_files").execute({ pattern: "**" });
    expect(found.files.map((file) => file.path)).toContain("隐藏工具时间线");
    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["隐藏工具时间线"] });
    expect(read.files[0].content).toBe("按需读取的时间线协议。");
  });

  it("filters keyword entries by recent messages and promotes direct and recursive matches to required", async () => {
    const runtime = await tools({
      history: [{ role: "user", content: "暴雨快来了。" }],
      extraEntries: [
        entry({
          id: "weather",
          title: "天气警报",
          content: "地下港口即将关闭。",
          agentReadStrategy: "keyword",
          keywords: ["暴雨"],
          keywordScanDepth: 1,
          keywordRecursionDepth: 1,
        }),
        entry({ id: "tunnel", title: "密道", content: "密道入口在钟楼。", agentReadStrategy: "keyword", keywords: ["地下港口"] }),
        entry({ id: "hidden-keyword", title: "晴天活动", content: "广场开放。", agentReadStrategy: "keyword", keywords: ["晴天"] }),
      ],
    });

    const found = await runtime.byName.get("eleckoi_glob_setting_files").execute({ pattern: "**" });
    expect(found.files.map((file) => file.path)).toEqual([
      "世界/总览",
      "世界/城市/港口",
      "天气警报",
      "密道",
    ]);
    expect(found.required_files.map((file) => file.path)).toEqual(["世界/总览", "天气警报", "密道"]);
  });

  it("evaluates variable conditions and renders EJS controllers as promoted required files", async () => {
    const runtime = await tools({
      history: [{ role: "user", content: "继续故事。" }],
      variableState: { 剧情: { 章节: 2 } },
      extraEntries: [
        entry({
          id: "chapter-condition",
          title: "第二章规则",
          content: "第二章已经开始。",
          agentReadStrategy: "variable_condition",
          agentReadCondition: "getvar('剧情.章节', { defaults: 0 }) >= 2",
        }),
        entry({
          id: "future-condition",
          title: "第三章规则",
          content: "第三章尚未开始。",
          agentReadStrategy: "variable_condition",
          agentReadCondition: "getvar('剧情.章节', { defaults: 0 }) >= 3",
        }),
        entry({
          id: "chapter-reference",
          title: "章节素材",
          content: "第二章隐藏线索。",
          agentReadStrategy: "variable_condition",
          dynamicMode: "ejs_reference",
        }),
        entry({
          id: "chapter-controller",
          title: "章节控制器",
          content: "<% if (getvar('剧情.章节') === 2) { %><%- await getwi(null, '章节素材') %>｜<%= Math.random() %><% } %>",
          agentReadStrategy: "variable_condition",
          dynamicMode: "ejs_controller",
        }),
      ],
    });

    const found = await runtime.byName.get("eleckoi_glob_setting_files").execute({ pattern: "**" });
    expect(found.files.map((file) => file.path)).toEqual([
      "世界/总览",
      "世界/城市/港口",
      "第二章规则",
      "章节控制器",
    ]);
    expect(found.required_files.map((file) => file.path)).toEqual(["世界/总览", "第二章规则", "章节控制器"]);

    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["章节控制器"] });
    expect(read.files[0].content).toMatch(/^第二章隐藏线索。｜0\./);
    const reread = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["章节控制器"] });
    expect(reread.files[0].content).toBe(read.files[0].content);
  });

  it("rejects invalid edits and unsafe paths without changing persisted state", async () => {
    const runtime = await tools();
    const patch = runtime.byName.get("eleckoi_apply_setting_patch");
    const before = readFileSync(runtime.file, "utf8");

    await expect(patch.execute({ operation: "edit_file", path: "世界/总览", old_string: "不存在", new_string: "改写" }))
      .resolves.toMatchObject({ status: "change_rejected", state_unchanged: true });
    await expect(patch.execute({ operation: "write_file", path: "../越界", content: "禁止" }))
      .resolves.toMatchObject({ status: "change_rejected", state_unchanged: true });
    expect(readFileSync(runtime.file, "utf8")).toBe(before);
  });
});

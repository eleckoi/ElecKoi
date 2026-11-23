import { runtimeContextsFor } from '../../../../../../tests/helpers/runtime-contexts.js';
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apply as applySettingLibraryTools } from "../../../../../../apps/desktop/resources/dsh/setting-library-tools.mjs";
import { requiredSettingCache } from "../../../../../../apps/desktop/resources/dsh/required-setting-cache.mjs";
import {
  ELECKOI_FAILURE_CODES as PLUGIN_FAILURE_CODES,
  RUNTIME_PLUGIN_FAILURE_EVENT,
} from "../../../../../../apps/desktop/resources/dsh/runtime-plugin-failure.mjs";
import { ELECKOI_FAILURE_CODES as CONTRACT_FAILURE_CODES } from "../../../../../shared/src/contracts/errors/codes.ts";
import { settingLibraryEntrySchema } from "../../../../../shared/src/contracts/settingLibrary/schemas.ts";

const FAILURE_LINE_PREFIX = `${RUNTIME_PLUGIN_FAILURE_EVENT} `;

function failureRecord(line) {
  expect(line.startsWith(FAILURE_LINE_PREFIX)).toBe(true);
  return JSON.parse(line.slice(FAILURE_LINE_PREFIX.length));
}

const directories = [];

afterEach(() => {
  delete process.env.ELECKOI_SESSION_SNAPSHOT_ROOT;
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function tools({ extraEntries = [], history = [], variableState = {}, liveVariableState = false, configured = true, commit, logger } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "eleckoi-setting-library-tools-"));
  directories.push(directory);
  const bridge = configured ? {
    enabled: true,
    library: {
      characterId: 'synthetic-character',
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
  } : { enabled: false, library: null, frozenLibrary: null, history: [] };
  const sessionId = "setting-tool-test-session";
  const contexts = runtimeContextsFor(sessionId, { settings: bridge, variables: { enabled: liveVariableState, state: variableState }, settingLibraryBaseline: { source: bridge.library, projected: bridge.library } });
  const registered = [];
  const commitConversationRuntime = vi.fn(commit || (() => {}));
  const publish = vi.fn();
  applySettingLibraryTools({
    eleckoiRuntimeContexts: contexts,
    tools: { register: (definition) => { registered.push(definition); return () => undefined; } },
    eleckoiProductData: { commitConversationRuntime },
    eleckoiCharacterConfigurationChanges: { publish },
    ...(logger ? { logger } : {}),
  });
  const execution = { agent: { session: { id: sessionId } } };
  return {
    contexts,
    state: () => contexts.get(sessionId).settings,
    replace: value => { contexts.get(sessionId).settings = value; },
    updateVariables: state => { contexts.get(sessionId).variables = { enabled: true, state }; },
    commitConversationRuntime,
    publish,
    byName: new Map(registered.map((definition) => [definition.name, {
      ...definition,
      execute: (args) => definition.execute(args, execution),
    }])),
  };
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
    contentMode: "plain_text",
    triggerMode: "agent_tool",
    enabled: true,
    order: 1,
    ...overrides,
  };
}

describe("DSH character setting-library tools", () => {
  it("uses keywordScanDepth as the message window for keyword matching", async () => {
    const runtime = await tools({
      history: [
        { role: "user", content: "我们去见合成甲合成乙。" },
        { role: "assistant", content: "夜色沉了下去。" },
      ],
      extraEntries: [
        entry({ id: "narrow", title: "窄窗口", content: "合成甲合成乙。", agentReadStrategy: "keyword", keywords: ["合成甲合成乙"], keywordScanDepth: 1 }),
        entry({ id: "wide", title: "宽窗口", content: "合成甲合成乙。", agentReadStrategy: "keyword", keywords: ["合成甲合成乙"], keywordScanDepth: 2 }),
      ],
    });

    const found = await runtime.byName.get("eleckoi_glob_setting_files").execute({ pattern: "**" });
    const paths = found.required_entries.map((file) => file.path);
    expect(paths).toContain("宽窗口");
    expect(paths).not.toContain("窄窗口");
  });

  it("does not match keywords across a message boundary", async () => {
    const runtime = await tools({
      history: [
        { role: "user", content: "合成甲" },
        { role: "assistant", content: "合成乙出现了。" },
      ],
      extraEntries: [
        entry({ id: "span", title: "跨消息", content: "跨消息命中。", agentReadStrategy: "keyword", keywords: ["合成甲\\s*合成乙"], keywordUseRegex: true, keywordScanDepth: 2 }),
        entry({ id: "inside", title: "同消息", content: "同消息命中。", agentReadStrategy: "keyword", keywords: ["合成乙出现"], keywordScanDepth: 2 }),
      ],
    });

    const found = await runtime.byName.get("eleckoi_glob_setting_files").execute({ pattern: "**" });
    const paths = found.required_entries.map((file) => file.path);
    expect(paths).toContain("同消息");
    expect(paths).not.toContain("跨消息");
  });

  it("keeps the SillyTavern haystack boundaries and their known limits", async () => {
    const runtime = await tools({
      history: [
        { role: "user", content: "合成甲" },
        { role: "assistant", content: "合成乙出现了。" },
      ],
      extraEntries: [
        // \x01 加在每条消息前面，因此 ^ 锚不住消息开头（带不带 m 都一样，与酒馆一致）
        entry({ id: "caret", title: "行首锚点", content: "行首。", agentReadStrategy: "keyword", keywords: ["^合成甲"], keywordUseRegex: true, keywordScanDepth: 2 }),
        entry({ id: "caret-m", title: "行首锚点m", content: "行首m。", agentReadStrategy: "keyword", keywords: ["/^合成甲/m"], keywordUseRegex: true, keywordScanDepth: 2 }),
        // \x01 加在消息前面而不是后面，因此消息末尾的 $ 锚点仍然可用
        entry({ id: "dollar", title: "行尾锚点", content: "行尾。", agentReadStrategy: "keyword", keywords: ["现了。$"], keywordUseRegex: true, keywordScanDepth: 2 }),
        // 已知边界：\x01 只挡住依赖空白符的跨越，任意字符类仍可跨消息（与酒馆相同，不是硬隔离）
        entry({ id: "anychar", title: "任意字符跨越", content: "任意字符。", agentReadStrategy: "keyword", keywords: ["合成甲[\\s\\S]*合成乙"], keywordUseRegex: true, keywordScanDepth: 2 }),
      ],
    });

    const found = await runtime.byName.get("eleckoi_glob_setting_files").execute({ pattern: "**" });
    const paths = found.required_entries.map((file) => file.path);
    expect(paths).not.toContain("行首锚点");
    expect(paths).not.toContain("行首锚点m");
    expect(paths).toContain("行尾锚点");
    expect(paths).toContain("任意字符跨越");
  });

  it("keeps every enabled preset tool registered when the character has no setting library", async () => {
    const runtime = await tools({ configured: false });
    const calls = [
      ["eleckoi_glob_setting_files", {}, { status: "ok", files: [] }],
      ["eleckoi_grep_setting_files", { pattern: "世界" }, { status: "no_matches", matches: [] }],
      ["eleckoi_read_setting_files", { paths: ["世界"] }, { status: "ok", files: [] }],
      ["eleckoi_apply_setting_patch", { operation: "make_directory", path: "世界" }, { status: "ok", changed: false }],
    ];
    expect([...runtime.byName.keys()]).toHaveLength(4);
    for (const [name, args, expected] of calls) {
      await expect(runtime.byName.get(name).execute(args)).resolves.toMatchObject(expected);
    }
  });

  it("caches only readable fixed required bodies in directory order", () => {
    const cache = requiredSettingCache({ entries: [
      entry({ id: "regular", title: "正文", content: "正文内容", agentReadStrategy: "required", treeViewOrder: 2 }),
      entry({ id: "reference", title: "引用", content: "引用内容", agentReadStrategy: "required", enabled: false }),
      entry({ id: "timeline", title: "时间线", kind: "hidden_tool_timeline", content: "时间线内容", agentReadStrategy: "required", treeViewOrder: 1 }),
      entry({ id: "timeline", title: "重复", kind: "hidden_tool_timeline", content: "重复内容", agentReadStrategy: "required" }),
      entry({ id: "opening", title: "开场", kind: "opening", content: "开场内容", agentReadStrategy: "required" }),
    ] });
    expect(cache.map(({ id, reference }) => [id, reference])).toEqual([["timeline", "#S01"], ["regular", "#S02"]]);
  });

  it("exposes only enabled Agent-readable files and returns required-file metadata", async () => {
    const runtime = await tools();
    expect([...runtime.byName.keys()]).toEqual([
      "eleckoi_glob_setting_files",
      "eleckoi_grep_setting_files",
      "eleckoi_read_setting_files",
      "eleckoi_apply_setting_patch",
    ]);
    for (const name of ["eleckoi_glob_setting_files", "eleckoi_grep_setting_files"]) {
      const description = runtime.byName.get(name).description;
      expect(description).toContain("每一条本轮尚未读取或正文已变化的完整 path 原样放进同一次");
      expect(description).toContain("cached_reference 也包含在内");
      expect(description).toContain("本轮已读且正文未变化的条目无需重复读取");
    }

    const found = await runtime.byName.get("eleckoi_glob_setting_files").execute({});
    expect(found.files.map((file) => file.path)).toEqual(["世界/总览", "世界/城市/港口"]);
    expect(found.required_entries).toEqual([{
      path: "世界/总览",
      title: "总览",
      read_strategy: "required",
      selection_hint: "",
      content_delivery: "cached_reference",
      cached_reference: "#S01",
    }]);

    const scoped = await runtime.byName.get("eleckoi_glob_setting_files").execute({ path: "世界/城市", pattern: "**/不存在" });
    expect(scoped.files).toEqual([]);
    expect(scoped.required_entries).toEqual(found.required_entries);

    const searched = await runtime.byName.get("eleckoi_grep_setting_files").execute({
      pattern: "多雾",
      path: "世界/城市",
      output_mode: "content",
    });
    expect(searched.matches).toEqual([expect.objectContaining({ path: "世界/城市/港口", text: "港口终年多雾。" })]);

    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["世界/城市/港口"] });
    expect(read.files.map(file => file.path)).toEqual(["世界/城市/港口"]);
    expect(read.files[0]).toMatchObject({
      path: "世界/城市/港口",
      selection_hint: "抵达港口时读取",
      content: "港口终年多雾。",
    });
    const required = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["世界/总览"] });
    expect(required.files[0]).toMatchObject({ cached_reference: "#S01", content_delivery: "cached_reference" });
    expect(required.files[0].content).toContain("#S01「总览」");
    expect(required.files[0].content).not.toContain("王都是晴天。");
  });

  it("keeps fixed required references stable across search and read while returning dynamic bodies", async () => {
    const runtime = await tools({ extraEntries: [
      entry({ id: "second-required", title: "城规", groupId: "city", content: "城门傍晚关闭。", agentReadStrategy: "required", treeViewOrder: 2 }),
      entry({ id: "dynamic", title: "本轮天气", content: "今日有雾。", agentReadStrategy: "keyword", keywords: ["天气"] }),
    ], history: [{ role: "user", content: "看看天气。" }] });
    const glob = await runtime.byName.get("eleckoi_glob_setting_files").execute({ pattern: "**" });
    const grep = await runtime.byName.get("eleckoi_grep_setting_files").execute({ pattern: "城门" });
    expect(glob.required_entries.map((item) => item.cached_reference)).toEqual(["#S01", "#S02", undefined]);
    expect(glob.required_entries.at(-1).content_delivery).toBe("tool_result");
    expect(grep.required_entries).toEqual(glob.required_entries);

    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["世界/总览", "世界/城市/城规", "本轮天气"] });
    expect(read.files[2]).toMatchObject({ read_strategy: "keyword", content_mode: "plain_text" });
    expect(read.files.map((item) => item.content)).toEqual([
      expect.stringContaining("#S01「总览」"),
      expect.stringContaining("#S02「城规」"),
      "今日有雾。",
    ]);
    expect(read.files[0].content).not.toContain("王都是晴天。");
    expect(read.files[1].content).not.toContain("城门傍晚关闭。");
  });

  it("returns every matched setting and complete file content without artificial limits", async () => {
    const longContent = "长".repeat(130_001);
    const bulkEntries = Array.from({ length: 2_101 }, (_, index) => entry({
      id: `bulk-${index}`,
      title: `批量设定-${String(index).padStart(4, "0")}`,
      content: `无限搜索命中-${index}`,
      order: index + 10,
    }));
    const runtime = await tools({
      extraEntries: [
        ...bulkEntries,
        entry({ id: "long", title: "超长正文", content: longContent, order: 2_000 }),
      ],
    });

    const found = await runtime.byName.get("eleckoi_glob_setting_files").execute({ pattern: "**" });
    expect(found.files).toHaveLength(2_104);
    expect(found).not.toHaveProperty("truncated");
    expect(found).not.toHaveProperty("omitted");

    const searched = await runtime.byName.get("eleckoi_grep_setting_files").execute({ pattern: "无限搜索命中" });
    expect(searched.matches.map(item => item.path)).toEqual(bulkEntries.map(item => item.title));
    expect(searched).not.toHaveProperty("omitted");
    expect(runtime.byName.get("eleckoi_grep_setting_files").parameters).not.toHaveProperty("limit");

    const paths = bulkEntries.slice(0, 17).map((item) => item.title).concat("超长正文");
    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths });
    expect(read.files).toHaveLength(18);
    expect(read.files.at(-1).content).toBe(longContent);
    expect(read.files.at(-1)).not.toHaveProperty("truncated");
  });

  it.each([101, 1_001, 10_001])("matches, lists, searches and reads all %i keyword settings including their final keyword and full long bodies", async count => {
    const probes = new Set([0, Math.floor(count / 2), count - 1]);
    const entries = Array.from({ length: count }, (_, index) => entry({
      id: `synthetic-keyword-${index}`, title: `合成关键词条目-${index}`,
      content: `合成命中正文-${index}\n${probes.has(index) ? '合成𠮷'.repeat(32_769) : '合成正文'}\n合成末尾-${index}`,
      agentReadStrategy: "keyword",
      keywords: [...(probes.has(index) ? Array.from({ length: 1_501 }, (_, key) => `未命中-${index}-${key}`) : []), "合成总量触发"],
      conditionKeywords: ["合成条件甲", "合成条件乙"], keywordCondition: "all",
    }));
    const runtime = await tools({ extraEntries: entries, history: [{ role: "user", content: "合成总量触发，合成条件甲，合成条件乙。" }] });
    const glob = await runtime.byName.get("eleckoi_glob_setting_files").execute({});
    const expectedPaths = entries.map(item => item.title);
    expect(glob.files.slice(2).map(item => item.path)).toEqual(expectedPaths);
    expect(glob.required_entries.slice(1).map(item => item.path)).toEqual(expectedPaths);
    for (const output_mode of ["files_with_matches", "content", "count"]) {
      const definition = runtime.byName.get("eleckoi_grep_setting_files");
      const result = await definition.execute({ pattern: "合成命中正文", output_mode });
      expect(result.matches).toHaveLength(count);
      expect(result.matches.map(item => item.path)).toEqual(expectedPaths);
      expect(result).not.toHaveProperty("omitted");
      expect(JSON.parse(definition.output.render({}, result)[0].text)).toEqual(result);
      if (output_mode === "content") expect(result.matches.at(-1).text).toBe(`合成命中正文-${count - 1}`);
    }
    const longLines = await runtime.byName.get("eleckoi_grep_setting_files").execute({ pattern: "合成𠮷", output_mode: "content" });
    expect(longLines.matches.map(item => item.text)).toEqual([...probes].map(index => entries[index].content.split('\n')[1]));
    const definition = runtime.byName.get("eleckoi_read_setting_files");
    const result = await definition.execute({ paths: expectedPaths });
    expect(result.status).toBe("ok");
    expect(result.files).toHaveLength(count);
    expect(result.files.map(item => item.content)).toEqual(entries.map(item => item.content));
    expect(JSON.parse(definition.output.render({}, result)[0].text)).toEqual(result);
    expect(runtime.state().runtimeResolution.visibleEntryIds).toHaveLength(count + 2);
  }, 60_000);

  it("honors scan depths above 1000 and recursive matches above ten rounds inside a large library", async () => {
    const filler = Array.from({ length: 2_101 }, (_, index) => entry({ id: `synthetic-filler-${index}`, title: `合成背景-${index}`, content: "合成无关正文", agentReadStrategy: "keyword", keywords: ["永不出现"] }));
    const chain = Array.from({ length: 22 }, (_, index) => entry({ id: `synthetic-chain-${index}`, title: `合成关联-${index}`,
      content: `合成链-${index + 1}|`, agentReadStrategy: "keyword", keywords: [`合成链-${index}|`], keywordRecursionDepth: index === 0 ? 20 : 0 }));
    const history = [{ role: "user", content: "合成早期触发" }, ...Array.from({ length: 1_001 }, () => ({ role: "assistant", content: "合成间隔消息" })), { role: "user", content: "合成链-0|" }];
    const runtime = await tools({ extraEntries: [...filler, ...chain,
      entry({ id: "synthetic-deep", title: "合成深层扫描", content: "合成深层正文", agentReadStrategy: "keyword", keywords: ["合成早期触发"], keywordScanDepth: history.length }),
      entry({ id: "synthetic-outside", title: "合成范围之外", content: "合成不应命中", agentReadStrategy: "keyword", keywords: ["合成早期触发"], keywordScanDepth: history.length - 1 }),
    ], history });
    const result = await runtime.byName.get("eleckoi_glob_setting_files").execute({});
    const paths = result.files.map(item => item.path);
    for (const item of chain.slice(0, 21)) expect(paths).toContain(item.title);
    expect(paths).not.toContain(chain[21].title);
    expect(paths).toContain("合成深层扫描");
    expect(paths).not.toContain("合成范围之外");
    expect(paths.some(path => path.startsWith("合成背景-"))).toBe(false);
  });

  it("matches keyword modes and secondary conditions after thousands of entries and at the end of a long user message", async () => {
    const filler = Array.from({ length: 2_101 }, (_, index) => entry({ id: `synthetic-mode-filler-${index}`, title: `合成模式背景-${index}`, content: "合成无关", agentReadStrategy: "keyword", keywords: ["从未出现"] }));
    const cases = [
      { id: 'insensitive', keywords: ['syntheticport'], keywordIgnoreCase: true, hit: true },
      { id: 'sensitive', keywords: ['syntheticport'], keywordIgnoreCase: false, hit: false },
      { id: 'whole', keywords: ['SyntheticPort'], keywordWholeWord: true, hit: true },
      { id: 'part', keywords: ['Port'], keywordWholeWord: true, hit: false },
      { id: 'substring', keywords: ['Port'], keywordWholeWord: false, hit: true },
      { id: 'cjk', keywords: ['合成港口'], keywordWholeWord: true, hit: true },
      { id: 'regex', keywords: ['/合成\\s+桥/g'], keywordUseRegex: true, hit: true },
      { id: 'all', keywords: ['合成港口'], conditionKeywords: ['条件甲', '条件乙'], keywordCondition: 'all', hit: true },
      { id: 'all-missing', keywords: ['合成港口'], conditionKeywords: ['条件甲', '不存在的条件'], keywordCondition: 'all', hit: false },
      { id: 'any', keywords: ['合成港口'], conditionKeywords: ['不存在的条件', '条件乙'], keywordCondition: 'any', hit: true },
      { id: 'exclude', keywords: ['合成港口'], conditionKeywords: ['条件乙'], keywordCondition: 'not_any', hit: false },
      { id: 'allow', keywords: ['合成港口'], conditionKeywords: ['不存在的条件'], keywordCondition: 'not_any', hit: true },
    ];
    const runtime = await tools({ history: [{ role: 'user', content: `${'合成填充'.repeat(32_769)}|SyntheticPort，合成港口岸，合成 桥，条件甲，条件乙。` }],
      extraEntries: [...filler, ...cases.map(({ hit, ...item }) => entry({ ...item, title: `合成模式-${item.id}`, content: `合成模式正文-${item.id}`, agentReadStrategy: 'keyword' }))] });
    const result = await runtime.byName.get('eleckoi_glob_setting_files').execute({});
    expect(result.required_entries.slice(1).map(item => item.path)).toEqual(cases.filter(item => item.hit).map(item => `合成模式-${item.id}`));
  });

  it("supports the structured patch operation set on the conversation snapshot", async () => {
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

    const afterMove = runtime.state();
    const movedEntry = afterMove.library.entries.find((item) => item.title === "气候");
    expect(movedEntry.content).toBe("暴雨。");

    await expect(patch.execute({ operation: "delete_file", path: "资料/支线/气候" }))
      .resolves.toMatchObject({ status: "ok", operation: "delete_file" });
    await expect(patch.execute({ operation: "delete_directory", path: "资料" }))
      .resolves.toMatchObject({ status: "ok", operation: "delete_directory" });

    const finalState = runtime.state();
    expect(finalState.library.entries.some((item) => item.title === "气候")).toBe(false);
    expect(finalState.library.groups.some((group) => group.name === "资料")).toBe(false);
  });

  it('commits a complete new entry before returning success and exposes it to search and read', async () => {
    const runtime = await tools({ commit: (_chat, variables, raw, baseline) => {
      expect(variables).toBeUndefined();
      expect(baseline.source.characterId).toBe('synthetic-character');
      const created = JSON.parse(raw).entries.find(item => item.title === '偏好');
      expect(settingLibraryEntrySchema.parse(created).contentMode).toBe('plain_text');
    } });
    expect(runtime.commitConversationRuntime).not.toHaveBeenCalled();
    const result = await runtime.byName.get('eleckoi_apply_setting_patch').execute({
      operation: 'write_file', path: '偏好', content: '喜欢温热的茶。'
    });
    expect(result).toMatchObject({ status: 'ok', changed: true, created: true });
    expect(runtime.commitConversationRuntime).toHaveBeenCalledTimes(1);
    expect(runtime.publish).toHaveBeenCalledWith({
      kind: 'configuration', domain: 'settingLibraries', characterId: 'synthetic-character'
    });
    const found = await runtime.byName.get('eleckoi_glob_setting_files').execute({});
    expect(found.files.some(file => file.path === '偏好')).toBe(true);
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['偏好'] });
    expect(read.files[0].content).toBe('喜欢温热的茶。');
  });

  it('rolls back rejected persistence without publishing a phantom branch', async () => {
    const runtime = await tools({ commit: () => { throw new Error('synthetic transaction failure'); } });
    const before = JSON.stringify(runtime.state());
    const result = await runtime.byName.get('eleckoi_apply_setting_patch').execute({
      operation: 'write_file', path: '偏好', content: '喜欢茶。'
    });
    expect(result).toMatchObject({ status: 'change_rejected', state_unchanged: true });
    expect(JSON.stringify(runtime.state())).toBe(before);
    expect(runtime.publish).not.toHaveBeenCalled();
    const found = await runtime.byName.get('eleckoi_glob_setting_files').execute({});
    expect(found.files.some(file => file.path === '偏好')).toBe(false);
  });

  it('does not persist reads, no-op writes, existing directories or invalid edits', async () => {
    const runtime = await tools();
    const patch = runtime.byName.get('eleckoi_apply_setting_patch');
    const before = JSON.stringify(runtime.state());
    await runtime.byName.get('eleckoi_glob_setting_files').execute({});
    await expect(patch.execute({ operation: 'write_file', path: '世界/城市/港口', content: '港口终年多雾。' }))
      .resolves.toMatchObject({ status: 'ok', changed: false });
    await expect(patch.execute({ operation: 'make_directory', path: '世界' }))
      .resolves.toMatchObject({ status: 'ok', changed: false });
    await expect(patch.execute({ operation: 'edit_file', path: '世界/城市/港口', old_string: '不存在', new_string: '替换' }))
      .resolves.toMatchObject({ status: 'change_rejected' });
    expect(runtime.commitConversationRuntime).not.toHaveBeenCalled();
    expect(runtime.publish).not.toHaveBeenCalled();
    // Search may resolve a cache, but no setting entry is changed.
    expect(runtime.state().library).toEqual(JSON.parse(before).library);
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
    expect(found.required_entries.map((file) => file.path)).toEqual(["世界/总览", "天气警报", "密道"]);
    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["天气警报", "密道"] });
    expect(read.files.map((file) => file.content)).toEqual(["地下港口即将关闭。", "密道入口在钟楼。"]);
  });

  it("keeps unmatched keywords hidden when the latest user turn does not match the prior assistant", async () => {
    const runtime = await tools({
      history: [
        { role: "user", content: "请介绍世界。" },
        { role: "assistant", content: "世界中有商店和属性。" },
        { role: "user", content: "我在哪里？" },
      ],
      extraEntries: [
        entry({ id: "shop", title: "商店", content: "商店设定。", agentReadStrategy: "keyword", keywords: ["世界", "商店"] }),
        entry({ id: "stats", title: "属性", content: "属性设定。", agentReadStrategy: "keyword", keywords: ["属性"] }),
      ],
    });
    const glob = await runtime.byName.get("eleckoi_glob_setting_files").execute({ pattern: "**" });
    const grep = await runtime.byName.get("eleckoi_grep_setting_files").execute({ pattern: "设定" });
    expect(glob.files.map((file) => file.path)).toEqual(["世界/总览", "世界/城市/港口"]);
    expect(glob.required_entries.map((file) => file.path)).toEqual(["世界/总览"]);
    expect(grep.matches.map((file) => file.path)).not.toContain("商店");
    expect(grep.required_entries.map((file) => file.path)).toEqual(["世界/总览"]);
    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["商店"] });
    expect(read.status).toBe("not_found");
  });

  it("lists optional EJS by title and hint and renders it only when explicitly read", async () => {
    const runtime = await tools({
      history: [{ role: "user", content: "继续故事。" }],
      variableState: { 剧情: { 章节: 2 } },
      extraEntries: [
        entry({
          id: "chapter-reference",
          title: "章节素材",
          content: "第二章隐藏线索。",
          agentReadStrategy: "normal",
          enabled: false,
        }),
        entry({
          id: "chapter-controller",
          title: "章节控制器",
          content: "<% if (getvar('剧情.章节') === 2) { %><%- await getwi(null, '章节素材') %>｜<%= Math.random() %><% } %>",
          agentSelectionHint: "进入第二章时查阅",
          agentReadStrategy: "normal",
          contentMode: "ejs",
        }),
      ],
    });

    const found = await runtime.byName.get("eleckoi_glob_setting_files").execute({ pattern: "**" });
    expect(found.files.map((file) => file.path)).toEqual([
      "世界/总览",
      "世界/城市/港口",
      "章节控制器",
    ]);
    expect(found.required_entries.map((file) => file.path)).toEqual(["世界/总览"]);
    expect(found.files.at(-1)).toMatchObject({ read_strategy: "normal", selection_hint: "进入第二章时查阅", content_delivery: "tool_result" });
    expect(runtime.state().runtimeResolution.renderedContents).not.toHaveProperty("chapter-controller");
    const grep = runtime.byName.get("eleckoi_grep_setting_files");
    const hint = await grep.execute({ pattern: "进入第二章时查阅" });
    expect(hint.matches.map(file => file.path)).toEqual(["章节控制器"]);
    const sourceOrBody = "Math\\.random|第二章隐藏线索";
    expect((await grep.execute({ pattern: sourceOrBody })).matches).toEqual([]);

    const readTool = runtime.byName.get("eleckoi_read_setting_files");
    const [read, concurrentRead] = await Promise.all([
      readTool.execute({ paths: ["章节控制器"] }),
      readTool.execute({ paths: ["章节控制器"] }),
    ]);
    expect(read.files[0]).toMatchObject({ read_strategy: "normal", content_mode: "ejs" });
    expect(read.files[0].content).toMatch(/^第二章隐藏线索。｜0\./);
    expect(read.files[0].resolved_references).toEqual([{ title: "章节素材" }]);
    expect(concurrentRead.files[0].content).toBe(read.files[0].content);
    expect((await grep.execute({ pattern: sourceOrBody })).matches).toEqual([]);
    expect((await grep.execute({ pattern: "章节控制器" })).required_entries.map(file => file.path)).toEqual(["世界/总览"]);
    expect(JSON.stringify(read.files[0])).not.toContain("chapter-reference");
    const referenceRead = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["章节素材"] });
    expect(referenceRead.status).toBe("not_found");
    const reread = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["章节控制器"] });
    expect(reread.files[0].content).toBe(read.files[0].content);
  });

  it("returns EJS reference bodies literally, even when they contain template delimiters", async () => {
    const literal = '模板示例：<% throw new Error("不应执行引用正文") %>';
    const runtime = await tools({ extraEntries: [
      entry({ id: 'literal-reference', title: '文字素材', content: literal, enabled: false }),
      entry({ id: 'literal-controller', title: '文字控制器', content: '<%- await getwi("文字素材") %>', contentMode: 'ejs' }),
    ] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['文字控制器'] });
    expect(read.files[0].content).toBe(literal);
  });

  it('renders the whole mixed body and lets getwi read entries independently of their rule', async () => {
    const extraEntries = [
      entry({ id: 'oil', title: '灯油设定', agentReadStrategy: 'keyword', keywords: ['灯塔'], keywordScanDepth: 1,
        contentMode: 'ejs', content: '首段\n<%= getvar("oil") %><%- await getwi("停用场景") %>\n尾段' }),
      entry({ id: 'disabled-scene', title: '停用场景', enabled: false, content: '熄灯。' }),
      entry({ id: 'always-shop', title: '常驻商店', triggerMode: 'always', content: '常驻正文。' }),
      entry({ id: 'mixed-required', title: '混合必读', agentReadStrategy: 'required', contentMode: 'ejs',
        content: '首段<%= 2 + 2 %>尾段' }),
      entry({ id: 'explicit-reference', title: '点名引用', contentMode: 'ejs',
        content: '<%- await getwi("灯油设定") %><%- await getwi("常驻商店") %>' }),
      entry({ id: 'empty-keywords', title: '没有配置关键词', agentReadStrategy: 'keyword', contentMode: 'ejs',
        content: '这条没有满足关键词。<%= 1 %>' }),
    ];
    const runtime = await tools({ extraEntries, history: [{ role: 'user', content: '走进灯塔' }], variableState: { oil: 0 } });
    const found = await runtime.byName.get('eleckoi_glob_setting_files').execute({});
    expect(found.required_entries).toEqual(expect.arrayContaining(['灯油设定', '混合必读'].map(path => expect.objectContaining({ path, content_delivery: 'tool_result' }))));
    expect(found.files.some(file => file.path === '没有配置关键词')).toBe(false);
    const result = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['灯油设定', '混合必读'] });
    expect(result.files.map(file => file.content)).toEqual(['首段\n0熄灯。\n尾段', '首段4尾段']);
    const unmatched = await tools({ extraEntries, history: [{ role: 'user', content: '离开港口' }], variableState: { oil: 0 } });
    const read = unmatched.byName.get('eleckoi_read_setting_files');
    const absent = await read.execute({ paths: ['灯油设定'] });
    expect(absent.status).toBe('not_found');
    const explicit = await read.execute({ paths: ['点名引用'] });
    expect(explicit.files[0]).toMatchObject({ content: '首段\n0熄灯。\n尾段常驻正文。', resolved_references: [
      { title: '灯油设定' }, { title: '停用场景' }, { title: '常驻商店' }
    ] });
  });

  it("refuses ambiguous reference titles and resolves an exact folder path", async () => {
    const runtime = await tools({ extraEntries: [
      entry({ id: 'root-reference', title: '天气', content: '合成根目录文字', enabled: false }),
      entry({ id: 'folder-reference', title: '天气', groupId: 'city', content: '合成文件夹文字', enabled: false }),
      entry({ id: 'ambiguous-controller', title: '重名控制器', content: '<%- await getwi("天气") %>', contentMode: 'ejs' }),
      entry({ id: 'exact-controller', title: '路径控制器', content: '<%- await getwi("世界/城市/天气") %>', contentMode: 'ejs' }),
    ] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['重名控制器', '路径控制器'] });
    expect(read.status).toBe('partial');
    expect(read.files[0].error).toMatchObject({ code: 'ejs_render_failed', message: expect.stringContaining('引用标题不唯一') });
    expect(read.files[1].content).toBe('合成文件夹文字');
  });

  it("renders nested EJS references with the same chat variables and returns transitive references", async () => {
    const runtime = await tools({ variableState: { score: 7 }, history: [{ role: 'user', content: 'Synthetic latest input', variableState: { score: 3 } }], extraEntries: [
      entry({ id: 'nested-controller', title: '合成递归控制器', contentMode: 'ejs', content: '<%- await getwi("世界/城市/合成动态引用") %>' }),
      entry({ id: 'nested-template', title: '合成动态引用', groupId: 'city', enabled: false, contentMode: 'ejs',
        content: '<% const score = await Promise.resolve(getvar("score")); %>score=<%= score %>;<%- await getwi("合成动态末层") %>' }),
      entry({ id: 'nested-leaf', title: '合成动态末层', enabled: false, contentMode: 'ejs',
        content: '<%= getMessageVar("score") %>:<%= getChatMessages(-1)[0] %>:<%= lastUserMessage %>' }),
    ] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['合成递归控制器'] });
    expect(read.files[0].error).toBeUndefined();
    expect(read.files[0].content).toBe('score=7;3:Synthetic latest input:Synthetic latest input');
    expect(read.files[0].resolved_references).toEqual([{ title: '合成动态引用' }, { title: '合成动态末层' }]);
    const found = await runtime.byName.get('eleckoi_glob_setting_files').execute({ pattern: '**' });
    expect(found.files.map(file => file.path)).not.toContain('世界/城市/合成动态引用');
    expect(found.files.map(file => file.path)).not.toContain('合成动态末层');
    const reread = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['合成递归控制器'] });
    expect(reread.files[0].content).toBe(read.files[0].content);
  });

  it("allows concurrent sibling and diamond references to reuse one template without reporting a cycle", async () => {
    const runtime = await tools({ variableState: { score: 2 }, extraEntries: [
      entry({ id: 'diamond-controller', title: '合成分支控制器', contentMode: 'ejs',
        content: '<%- (await Promise.all([getwi("合成分支甲"), getwi("合成分支乙"), getwi("合成分支甲")])).join("|") %>' }),
      ...['甲', '乙'].map(name => entry({ id: `diamond-${name}`, title: `合成分支${name}`, enabled: false, contentMode: 'ejs',
        content: `${name}<%- await getwi("合成共用末层") %>` })),
      entry({ id: 'diamond-leaf', title: '合成共用末层', enabled: false, contentMode: 'ejs',
        content: '<%= await Promise.resolve(getvar("score")) %>' }),
    ] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['合成分支控制器'] });
    expect(read.files[0].error).toBeUndefined();
    expect(read.files[0].content).toBe('甲2|乙2|甲2');
    expect(new Set(read.files[0].resolved_references.map(item => item.title))).toEqual(new Set(['合成分支甲', '合成分支乙', '合成共用末层']));
    expect(read.files[0].resolved_references).toHaveLength(3);
  });

  it.each([
    ['direct', '合成循环引用甲', '合成循环控制器 → 世界/城市/合成循环引用甲 → 世界/城市/合成循环引用甲'],
    ['indirect', '合成循环引用乙', '合成循环控制器 → 世界/城市/合成循环引用甲 → 合成循环引用乙 → 世界/城市/合成循环引用甲'],
  ])("reports the complete %s reference cycle without blocking other settings", async (_name, firstTarget, chain) => {
    const runtime = await tools({ extraEntries: [
      entry({ id: 'cycle-controller', title: '合成循环控制器', contentMode: 'ejs', content: '<%- await getwi("世界/城市/合成循环引用甲") %>' }),
      entry({ id: 'cycle-a', title: '合成循环引用甲', groupId: 'city', enabled: false, contentMode: 'ejs', content: `<%- await getwi("${firstTarget}") %>` }),
      entry({ id: 'cycle-b', title: '合成循环引用乙', enabled: false, contentMode: 'ejs', content: '<%- await getwi("世界/城市/合成循环引用甲") %>' }),
      entry({ id: 'unrelated-controller', title: '合成正常控制器', contentMode: 'ejs', content: '<%= 7 %>' }),
    ] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['合成循环控制器', '合成正常控制器', '世界/总览'] });
    expect(read.files[0].error.code).toBe('ejs_render_failed');
    expect(read.files[0].error.message).toContain(chain);
    expect(read.files[1].content).toBe('7');
    expect(read.files[2]).toMatchObject({ content_delivery: 'cached_reference', cached_reference: '#S01' });
  });

  it("propagates a nested template error with its actual reference path", async () => {
    const runtime = await tools({ extraEntries: [
      entry({ id: 'broken-nested-controller', title: '合成错误外层', contentMode: 'ejs', content: '<%- await getwi("世界/城市/合成错误内层") %>' }),
      entry({ id: 'broken-nested-reference', title: '合成错误内层', groupId: 'city', enabled: false, contentMode: 'ejs', content: '<%= missingSyntheticValue %>' }),
    ] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['合成错误外层'] });
    expect(read.files[0].error.code).toBe('ejs_render_failed');
    expect(read.files[0].error.message).toContain('世界/城市/合成错误内层');
    expect(read.files[0].error.message).toContain('missingSyntheticValue');
  });

  it("renders a long acyclic reference chain without imposing a new recursion limit", async () => {
    const references = Array.from({ length: 24 }, (_, index) => entry({ id: `chain-${index}`, title: `合成链${index}`,
      enabled: false, contentMode: 'ejs', content: index === 23 ? '<%= 23 %>' : `<%- await getwi("合成链${index + 1}") %>` }));
    const runtime = await tools({ extraEntries: [entry({ id: 'chain-controller', title: '合成链控制器', contentMode: 'ejs', content: '<%- await getwi("合成链0") %>' }), ...references] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['合成链控制器'] });
    expect(read.files[0].error).toBeUndefined();
    expect(read.files[0].content).toBe('23');
    expect(read.files[0].resolved_references).toHaveLength(24);
  });

  it("exposes the latest user message to EJS setting controllers", async () => {
    const runtime = await tools({
      history: [
        { role: "user", content: "上一轮用户消息" },
        { role: "assistant", content: "上一轮助手回复" },
        { role: "user", content: "当前轮用户消息" },
      ],
      extraEntries: [entry({
        id: "message-controller",
        title: "消息控制器",
        content: "<%= lastUserMessage %>",
        contentMode: "ejs",
      })],
    });

    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["消息控制器"] });
    expect(read.files[0].content).toBe("当前轮用户消息");
  });

  it("provides full Lodash to EJS controllers and keeps deep-cloned message variables independent", async () => {
    const variableState = { profile: { inventory: [{ amount: 2 }] } };
    const runtime = await tools({ variableState, extraEntries: [entry({
      id: 'lodash-controller', title: '合成变量副本', contentMode: 'ejs',
      content: `<% const copy = _.cloneDeep(getMessageVar('profile'));
        copy.inventory[0].amount = 7;
        const labels = _.mapValues({ first: { label: 'Synthetic' } }, 'label');
        const values = _({ first: 1, second: 2 }).pickBy(value => value > 1).values().value();
      %><%= JSON.stringify({ copy: copy.inventory[0].amount, original: getMessageVar('profile').inventory[0].amount,
        labels, values, nullable: _.get({ value: null }, 'value', 'fallback') }) %>`,
    })] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['合成变量副本'] });
    expect(read.files[0].error).toBeUndefined();
    expect(JSON.parse(read.files[0].content)).toEqual({ copy: 7, original: 2,
      labels: { first: 'Synthetic' }, values: [2], nullable: null });
    expect(variableState.profile.inventory[0].amount).toBe(2);
  });

  it.each([
    ['semicolon-free scriptlet', '<% const value = 3 %><%= value %>', '3'],
    ['line comment', '<% // synthetic comment %>after', 'after'],
    ['escaped closing delimiter', 'before %%> after', 'before %> after'],
    ['whitespace slurping', 'x \n  <%_ print("y"); _%>  \n z', 'x \ny z'],
    ['locals binding', '<%= locals.getvar("label") %>', 'Synthetic'],
    ['this binding', '<%= this.getvar("label") %>', 'Synthetic'],
    ['async print', '<% print(await Promise.resolve("A")); %><%= "<tag>&" %>', 'A<tag>&'],
    ['variadic print', '<% print("A", null, "B", undefined, 0); %>after', 'AB0after'],
  ])("renders standard EJS %s through the setting read tool", async (_name, content, expected) => {
    const runtime = await tools({ variableState: { label: 'Synthetic' }, extraEntries: [
      entry({ id: 'syntax-controller', title: '合成模板语法', contentMode: 'ejs', content }),
    ] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['合成模板语法'] });
    expect(read.files[0].error).toBeUndefined();
    expect(read.files[0].content).toBe(expected);
  });

  it("reads complete and selected chat history as ordered text without changing messages", async () => {
    const history = Array.from({ length: 6 }, (_, index) => ({ id: `synthetic-${index}`,
      role: index % 2 ? 'assistant' : 'user', content: `Synthetic message ${index}` }));
    const runtime = await tools({ history, extraEntries: [entry({
      id: 'history-controller', title: '合成历史读取', contentMode: 'ejs',
      content: `<%= JSON.stringify({ recent: getChatMessages(-5), all: getChatMessages(),
        first: getChatMessages(2), none: getChatMessages(0), range: getChatMessages(0, 2),
        users: getChatMessages(-2, 'user'), assistants: getChatMessages(0, 2, 'assistant'),
        firstMessage: getChatMessage(0), lastMessage: getChatMessage(-1),
        lastUser: getChatMessage(-1, 'user'), missing: getChatMessage(99) }) %>`,
    })] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['合成历史读取'] });
    expect(read.files[0].error).toBeUndefined();
    const messages = history.map(item => item.content);
    expect(JSON.parse(read.files[0].content)).toEqual({ recent: messages.slice(-5), all: messages,
      first: messages.slice(0, 2), none: [], range: messages.slice(0, 2),
      users: [messages[2], messages[4]], assistants: [messages[1], messages[3]],
      firstMessage: messages[0], lastMessage: messages[5], lastUser: messages[4], missing: '' });
    expect(runtime.state().history).toEqual(history);
    expect(runtime.commitConversationRuntime).not.toHaveBeenCalled();
  });

  it("returns an empty chat history when the conversation has no messages", async () => {
    const runtime = await tools({ extraEntries: [entry({ id: 'empty-history', title: '合成空历史', contentMode: 'ejs',
      content: '<%= JSON.stringify([getChatMessages(-5), getChatMessages(), getChatMessage(-1)]) %>' })] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['合成空历史'] });
    expect(read.files[0].error).toBeUndefined();
    expect(JSON.parse(read.files[0].content)).toEqual([[], [], '']);
  });

  it("returns an independent variable copy when clone is requested", async () => {
    const variableState = { profile: { amount: 2 } };
    const runtime = await tools({ variableState, extraEntries: [entry({ id: 'clone-option', title: '合成变量克隆', contentMode: 'ejs',
      content: '<% const copy = getvar("profile", { clone: true }); copy.amount = 9; %><%= getvar("profile.amount") %>' })] });
    const read = await runtime.byName.get('eleckoi_read_setting_files').execute({ paths: ['合成变量克隆'] });
    expect(read.files[0].error).toBeUndefined();
    expect(read.files[0].content).toBe('2');
    expect(variableState.profile.amount).toBe(2);
  });

  it("maps the local-variable EJS helper to the current conversation state", async () => {
    const runtime = await tools({
      variableState: { 剧情: { 章节: 3 } },
      extraEntries: [entry({
        id: "local-variable-controller",
        title: "本地变量控制器",
        content: "<%= getLocalVar('剧情.章节') %>",
        contentMode: "ejs",
      })],
    });

    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["本地变量控制器"] });
    expect(read.files[0].content).toBe("3");
  });

  it("reads message-scoped EJS variables from the selected message snapshot", async () => {
    const runtime = await tools({
      variableState: { 剧情: { 章节: 9 } },
      history: [
        { id: "older", role: "assistant", content: "旧回复", variableState: { 剧情: { 章节: 2 } } },
        { id: "latest", role: "user", content: "当前输入", variableState: { 剧情: { 章节: 3 } } },
      ],
      extraEntries: [entry({
        id: "message-variable-controller",
        title: "消息变量控制器",
        content: "<%= getMessageVar('剧情.章节', { withMsg: { id: 'older' } }) %>",
        contentMode: "ejs",
      })],
    });

    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({ paths: ["消息变量控制器"] });
    expect(read.files[0].content).toBe("2");
  });

  it("isolates a failed EJS controller without blocking other required or keyword files", async () => {
    const runtime = await tools({
      history: [{ role: "user", content: "暴雨快来了。" }],
      extraEntries: [
        entry({
          id: "broken-controller",
          title: "坏掉的控制器",
          content: "<%= missingCompatibilityHelper() %>",
          contentMode: "ejs",
        }),
        entry({
          id: "matched-keyword",
          title: "暴雨设定",
          content: "暴雨设定正文。",
          agentReadStrategy: "keyword",
          keywords: ["暴雨"],
        }),
      ],
    });

    const found = await runtime.byName.get("eleckoi_glob_setting_files").execute({});
    expect(found.files.map((file) => file.path)).toContain("暴雨设定");
    expect(found.files.find((file) => file.path === "坏掉的控制器")).toMatchObject({ content_delivery: "tool_result" });
    expect(found.required_entries.map(file => file.path)).toEqual(["世界/总览", "暴雨设定"]);

    const read = await runtime.byName.get("eleckoi_read_setting_files").execute({
      paths: ["坏掉的控制器", "暴雨设定"],
    });
    expect(read.status).toBe("partial");
    expect(read.files.find((file) => file.path === "坏掉的控制器")).toMatchObject({
      content_delivery: "error",
      error: { code: "ejs_render_failed" },
    });
    expect(read.files.find((file) => file.path === "暴雨设定").content).toBe("暴雨设定正文。");
  });

  it("refreshes keyword requirements and the selected EJS body when variables change during the same turn", async () => {
    const runtime = await tools({
      history: [{ role: 'user', content: '查看章节。' }],
      variableState: { 剧情: { 章节: 1 } },
      liveVariableState: true,
      extraEntries: [
        entry({ id: "chapter-controller", title: "章节控制器", contentMode: "ejs",
          content: "<% if (getvar('剧情.章节') === 2) { %>第二章已开启。<% } %>" }),
        entry({ id: "chapter-keyword", title: "章节提示", contentMode: "ejs", agentReadStrategy: "keyword", keywords: ["章节"],
          content: "<% if (getvar('剧情.章节') === 2) { %>关键词正文。<% } %>" }),
      ],
    });
    const glob = runtime.byName.get("eleckoi_glob_setting_files");
    const read = runtime.byName.get("eleckoi_read_setting_files");
    const before = await glob.execute({});
    expect(before.required_entries.map((item) => item.path)).toEqual(["世界/总览"]);
    expect(before.files.map(file => file.path)).toContain("章节控制器");
    expect((await read.execute({ paths: ["章节控制器"] })).files[0].content).toBe("");

    runtime.updateVariables({ 剧情: { 章节: 2 } });
    const after = await glob.execute({});
    expect(after.required_entries.map((item) => item.path)).toEqual(["世界/总览", "章节提示"]);
    const selected = await read.execute({ paths: ["章节控制器", "章节提示"] });
    expect(selected.files.map(file => file.content)).toEqual(["第二章已开启。", "关键词正文。"]);
  });

  it("rejects invalid edits and unsafe paths without changing persisted state", async () => {
    const runtime = await tools();
    const patch = runtime.byName.get("eleckoi_apply_setting_patch");
    const before = JSON.stringify(runtime.state());

    await expect(patch.execute({ operation: "edit_file", path: "世界/总览", old_string: "不存在", new_string: "改写" }))
      .resolves.toMatchObject({ status: "change_rejected", state_unchanged: true });
    await expect(patch.execute({ operation: "write_file", path: "../越界", content: "禁止" }))
      .resolves.toMatchObject({ status: "change_rejected", state_unchanged: true });
    await expect(patch.execute({ operation: "write_file", path: "世界/非法:名称", content: "禁止" }))
      .resolves.toMatchObject({ status: "change_rejected", state_unchanged: true });
    await expect(patch.execute({ operation: "edit_file", path: "世界/总览", old_string: "晴天", new_string: "晴天" }))
      .resolves.toMatchObject({ status: "change_rejected", state_unchanged: true });
    expect(JSON.stringify(runtime.state())).toBe(before);
  });

  it("matches Android no-op and path-conflict semantics", async () => {
    const runtime = await tools();
    const patch = runtime.byName.get("eleckoi_apply_setting_patch");

    await expect(patch.execute({ operation: "make_directory", path: "世界/城市" }))
      .resolves.toMatchObject({ status: "ok", changed: false });
    await expect(patch.execute({ operation: "move_file", path: "世界/总览", destination: "世界/总览" }))
      .resolves.toMatchObject({ status: "ok", changed: false });
    await expect(patch.execute({ operation: "move_directory", path: "世界/城市", destination: "世界/城市" }))
      .resolves.toMatchObject({ status: "ok", changed: false });
    await expect(patch.execute({ operation: "write_file", path: "世界/城市", content: "禁止覆盖目录" }))
      .resolves.toMatchObject({ status: "change_rejected", state_unchanged: true });
    await expect(patch.execute({ operation: "move_file", path: "世界/总览", destination: "世界/城市" }))
      .resolves.toMatchObject({ status: "change_rejected", state_unchanged: true });
  });

  it("keeps the runtime-plugin failure code table verbatim equal to the contract table", () => {
    expect(PLUGIN_FAILURE_CODES).toEqual(CONTRACT_FAILURE_CODES);
    expect(Object.keys(PLUGIN_FAILURE_CODES)).toEqual(Object.keys(CONTRACT_FAILURE_CODES));
    expect(RUNTIME_PLUGIN_FAILURE_EVENT).toBe("eleckoi/runtime-plugin-failure");
  });

  it("logs one searchable coded line at the failure exit and still throws", async () => {
    const lines = [];
    const runtime = await tools({
      logger: { warn: (line) => lines.push(line) },
      extraEntries: [
        entry({ id: "ambiguous-colon", title: "Synthetic:a", content: "A" }),
        entry({ id: "ambiguous-underscore", title: "Synthetic_a", content: "B" }),
      ],
    });

    const rejection = await runtime.byName.get("eleckoi_read_setting_files")
      .execute({ paths: ["Synthetic_a"] }).then(() => undefined, (error) => error);

    // 出口不是吞掉：失败仍然抛出，而且是 Error（cordis 会把非 Error 的抛出包成 [object Object]）。
    expect(rejection).toBeInstanceOf(Error);
    expect(rejection.message).toContain("路径不唯一");
    expect(rejection.code).toBe(CONTRACT_FAILURE_CODES.lookupDuplicate);
    expect(rejection.details).toEqual({ what: "设定路径", path: "Synthetic_a" });
    expect(lines).toHaveLength(1);
    expect(failureRecord(lines[0])).toMatchObject({
      plugin: "eleckoi-setting-library-tools",
      operation: "eleckoi_read_setting_files",
      code: "eleckoi/lookup/duplicate",
      message: "设定路径不唯一：Synthetic_a。请修改冲突的条目或文件夹名称。",
      details: { what: "设定路径", path: "Synthetic_a" },
    });
    expect(typeof failureRecord(lines[0]).stack).toBe("string");
  });

  it("keeps the contract code on a rejected patch and logs the file operation name", async () => {
    const lines = [];
    const runtime = await tools({ logger: { warn: (line) => lines.push(line) } });

    await expect(runtime.byName.get("eleckoi_apply_setting_patch")
      .execute({ operation: "edit_file", path: "世界/总览", old_string: "不存在", new_string: "改写" }))
      .resolves.toMatchObject({ status: "change_rejected", state_unchanged: true, message: "正文中找不到 old_string。" });

    expect(lines).toHaveLength(1);
    expect(failureRecord(lines[0])).toMatchObject({
      plugin: "eleckoi-setting-library-tools",
      operation: "edit_file",
      code: "eleckoi/lookup/not-found",
      message: "正文中找不到 old_string。",
      details: { what: "要替换的原文片段" },
    });
  });
});

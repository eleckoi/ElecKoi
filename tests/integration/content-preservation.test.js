import { runtimeContextsFor } from '../helpers/runtime-contexts.js';
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteDatabase } from "../helpers/SqliteDatabase";
import { AgentPresetRepository } from "../../packages/host/product-data/src/domain/agentPresets";
import { CharacterRepository } from "../../packages/host/product-data/src/domain/personas/CharacterRepository";
import { ConversationRepository } from "../../packages/host/product-data/src/domain/conversations/ConversationRepository";
import { SettingLibraryRepository, emptyEntry } from "../../packages/host/product-data/src/domain/settingLibraries";
import { LocalMediaStore } from "../../packages/host/product-data/src/storage/media";
import { decodeCharacterCard } from "../../packages/host/product-data/src/domain/characterTransfer/characterCardFormats";
import { decodeRegexDocuments } from "../../packages/shared/src/foundation/regexRuleTransfer";
import { settingLibrarySchema } from "../../packages/shared/src/contracts/settingLibrary/schemas";
import { agentPresetSchema } from "../../packages/shared/src/contracts/presets/schemas";
import { apply as applyTavily } from "../../packages/host/web-search-tavily/src/index.js";
import { apply as applySettingTools } from "../../apps/desktop/resources/dsh/setting-library-tools.mjs";
import { importVariableConfig } from "../../apps/web/src/modules/variables/model/variableConfigTransfer.js";
import { parseSettingLibraryFile } from "../../apps/web/src/modules/settingLibraries/model/settingLibraryTransfer.js";
import { requestProjectionPlan, projectRequestMessages, sessionInstructions } from "../../packages/client/features/dsh-client-roleplay/src/host/conversation-context.mjs";
import { normalizeReleaseNotes } from "../../apps/desktop/src/main/modules/updates/UpdateService";

vi.mock('electron-updater', () => ({ default: { autoUpdater: {} } }));

const directories = [];
const databases = [];
const stamp = "2026-10-14T00:00:00.000Z";
function temp() {
  const root = mkdtempSync(join(tmpdir(), "eleckoi-truncation-audit-"));
  directories.push(root);
  return root;
}
function database() {
  const root = temp();
  const db = new SqliteDatabase(join(root, "synthetic.sqlite3"));
  db.open();
  databases.push(db);
  return { db, root };
}
function characters(db, root) {
  const repo = new CharacterRepository(db, new ConversationRepository(db), new LocalMediaStore(join(root, "media")));
  repo.replaceAll({ active_character_id: "synthetic-card", groups: [], items: [{
    id: "synthetic-card",
    name: "Synthetic character",
    persona: { assistant_name: "Synthetic assistant", assistant_avatar: "", assistant_cover: "", opening: "", show_opening: false }
  }] });
}
function document(value) {
  return { displayName: "synthetic.json", mimeType: "application/json", base64: Buffer.from(JSON.stringify(value)).toString("base64") };
}
function baseVariableConfig() {
  const version = { id: "synthetic-v1", name: "Synthetic variables", initialStateJson: "{}", schemaCode: "", objects: [], variables: [], expandedObjectIds: [], createdAt: stamp, updatedAt: stamp };
  return { characterId: "synthetic-card", ...version, activeVersionId: version.id, versions: [version] };
}
function settingTools(entries = []) {
  const id = "synthetic-audit-session";
  const library = { characterId: "synthetic-card", groups: [], entries };
  const contexts = runtimeContextsFor(id, { settings: { enabled: true, library, history: [], variableState: {} },
    settingLibraryBaseline: { source: library, projected: library } });
  const definitions = [];
  const commit = vi.fn();
  applySettingTools({
    eleckoiRuntimeContexts: contexts,
    tools: { register(def) {
      definitions.push(def);
      return () => {
      };
    } },
    eleckoiProductData: { commitConversationRuntime: commit },
    eleckoiCharacterConfigurationChanges: { publish() {
    } }
  });
  return { state: () => contexts.get(id).settings, commit, run: (name, args) => definitions.find((def) => def.name === name).execute(args, { agent: { session: { id } } }) };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  databases.splice(0).forEach((db) => db.close());
  directories.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
describe("complete authored content across requests, imports, and persistence", () => {
  it("sends every character of fixed settings in both prompt positions and system instructions", () => {
    const content = "b".repeat(47700) + "Z";
    const context = { history: [], settingLibrary: { entries: [{
      ...emptyEntry("synthetic-large", stamp),
      title: "Synthetic long setting",
      content,
      triggerMode: "always",
      position: "insert_point_1"
    }] } };
    expect(requestProjectionPlan(context)[0].content).toBe(content);
    context.settingLibrary.entries[0].position = "instructions";
    expect(sessionInstructions({ conversationContext: context })).toBe(content);
  });
  it("keeps distinct long setting IDs in actual request messages", () => {
    const prefix = "i".repeat(128);
    const context = { settingLibrary: { entries: ["A", "B"].map((suffix) => ({
      ...emptyEntry(prefix + suffix, stamp),
      title: `Synthetic ${suffix}`,
      content: `Synthetic ${suffix}`,
      triggerMode: "always",
      position: "insert_point_1"
    })) } };
    const messages = projectRequestMessages([], requestProjectionPlan(context));
    expect(new Set(messages.map((message) => message.id)).size).toBe(2);
  });
  it("imports an entire long regex and preserves its matching behavior through both entry points", () => {
    const pattern = "a".repeat(4e3) + "Z";
    const decoded = decodeRegexDocuments([{ displayName: "synthetic.json", json: JSON.stringify({ pattern, replacement: "Synthetic" }) }], "Global");
    expect(decoded.failedFileNames).toEqual([]);
    expect(decoded.rules[0].rule.pattern).toBe(pattern);
    expect(new RegExp(decoded.rules[0].rule.pattern).test("a".repeat(4e3) + "X")).toBe(false);
    const card = decodeCharacterCard(Buffer.from(JSON.stringify({
      format: "eleckoi.character-card",
      version: 1,
      character: { name: "Synthetic character" },
      assets: [],
      regex_rules: [{ name: "Synthetic long rule", pattern, replacement: "Synthetic" }]
    })), "eleckoi");
    expect(card.regexRules[0].pattern).toBe(pattern);
  });
  it("imports and reexports all preset versions, including history after version 100", () => {
    const { db } = database(), repo = new AgentPresetRepository(db);
    const versions = Array.from({ length: 102 }, (_, i) => ({ id: `synthetic-v${i + 1}`, number: i + 1, name: `Synthetic version ${i + 1}`, created_at_epoch_ms: i + 1 }));
    const imported = repo.import(document({ format: "eleckoi.agent-preset", version: 2, preset: {
      purpose: "roleplay",
      name: "Synthetic preset",
      active_version_id: "synthetic-v102",
      active_version_number: 102,
      versions
    } }), "eleckoi");
    const exported = JSON.parse(Buffer.from(repo.export(imported.preset.id, "json").base64, "base64").toString("utf8"));
    expect(exported.preset.versions.map((v) => v.number)).toEqual(versions.map((v) => v.number));
    expect(imported.preset.activeVersionNumber).toBe(102);
  }, 3e4);
  it("persists complete preset profile text, all records, and all tags", () => {
    const { db } = database(), repo = new AgentPresetRepository(db), initial = repo.create("Synthetic profile");
    const input = {
      ...initial,
      name: "n".repeat(61),
      modelTags: Array.from({ length: 9 }, (_, i) => ({ id: `synthetic-${i}`, label: `Synthetic ${i}`, providerId: "" })),
      profile: {
        ...initial.profile,
        authorName: "a".repeat(41),
        usageInstructions: "u".repeat(8e3) + "Z",
        timeline: Array.from({ length: 101 }, (_, i) => ({ id: `synthetic-note-${i}`, title: `Synthetic ${i}`, dateLabel: "d".repeat(25), note: "t".repeat(800) + "Z" }))
      }
    };
    expect(agentPresetSchema.safeParse(input).success).toBe(true);
    repo.save(input, initial.regexRules);
    const persisted = repo.get(initial.id);
    expect(persisted.name).toBe(input.name);
    expect(persisted.profile).toEqual(input.profile);
    expect(persisted.modelTags).toEqual(input.modelTags);
  }, 3e4);
  it("persists complete setting selection hints", () => {
    const { db, root } = database();
    characters(db, root);
    const repo = new SettingLibraryRepository(db), initial = repo.get("synthetic-card"), hint = "h".repeat(500) + "\nZ";
    const input = { ...initial, entries: [...initial.entries, { ...emptyEntry("synthetic-setting", stamp), title: "Synthetic setting", content: "Synthetic", agentSelectionHint: hint }] };
    expect(settingLibrarySchema.safeParse(input).success).toBe(true);
    expect(repo.save("synthetic-card", input).entries.find((e) => e.id === "synthetic-setting").agentSelectionHint).toBe(hint);
  }, 3e4);
  it("tool writes keep full hints and full bodies", async () => {
    const tools = settingTools(), hint = "h".repeat(600) + "\nZ", content = "b".repeat(5e4) + "Z";
    const result = await tools.run("eleckoi_apply_setting_patch", { operation: "write_file", path: "Synthetic setting", content, selection_hint: hint });
    expect(result.status).toBe("ok");
    const bridge = tools.state();
    expect(bridge.library.entries[0].agentSelectionHint).toBe(hint);
    expect((await tools.run("eleckoi_read_setting_files", { paths: ["Synthetic setting"] })).files[0].content).toBe(content);
  });
  it("reads and writes the correct long virtual setting path without shortening its title", async () => {
    const prefix = "s".repeat(72);
    const entries = ["A", "B"].map((suffix, i) => ({ ...emptyEntry(`synthetic-entry-${i}`, stamp), title: prefix + suffix, content: `Synthetic ${suffix}` }));
    const tools = settingTools(entries);
    const glob = await tools.run("eleckoi_glob_setting_files", {});
    expect(glob.files.map((file) => file.path)).toEqual([prefix + "A", prefix + "B"]);
    expect((await tools.run("eleckoi_read_setting_files", { paths: [prefix + "A"] })).files[0].content).toBe("Synthetic A");
    expect((await tools.run("eleckoi_apply_setting_patch", { operation: "write_file", path: prefix + "B", content: "Synthetic updated" })).status).toBe("ok");
    const saved = tools.state().library.entries;
    expect(saved.map((e) => [e.title, e.content])).toEqual([[prefix + "A", "Synthetic A"], [prefix + "B", "Synthetic updated"]]);
  });
  it("updates an existing virtual file without replacing its authored title with the path spelling", async () => {
    const tools = settingTools([{ ...emptyEntry('synthetic-punctuation', stamp), title: 'Synthetic: title', content: 'Synthetic original' }]);
    const listing = await tools.run('eleckoi_glob_setting_files', {});
    expect((await tools.run('eleckoi_apply_setting_patch', { operation: 'write_file', path: listing.files[0].path, content: 'Synthetic changed' })).status).toBe('ok');
    const saved = tools.state().library.entries[0];
    expect(saved.title).toBe('Synthetic: title');
    expect(saved.content).toBe('Synthetic changed');
  });
  it("rejects ambiguous sanitized paths before reading or mutating either setting", async () => {
    const tools = settingTools(["Synthetic:a", "Synthetic_a"].map((title, i) => ({ ...emptyEntry(`synthetic-${i}`, stamp), title, content: `Synthetic ${i}` })));
    const before = JSON.stringify(tools.state());
    await expect(tools.run("eleckoi_read_setting_files", { paths: ["Synthetic_a"] })).rejects.toThrow("\u8DEF\u5F84\u4E0D\u552F\u4E00");
    const write = await tools.run("eleckoi_apply_setting_patch", { operation: "write_file", path: "Synthetic_a", content: "Synthetic changed" });
    expect(write.status).not.toBe("ok");
    expect(JSON.stringify(tools.state())).toBe(before);
    expect(tools.commit).not.toHaveBeenCalled();
  });
  it("imports complete variable names with the exact original state path", () => {
    const objectName = "o".repeat(40) + "Z", fieldName = "f".repeat(60) + "Z";
    const imported = importVariableConfig(baseVariableConfig(), JSON.stringify({
      format: "eleckoi.variable-config",
      name: "Synthetic imported",
      initial_state: { [objectName]: { [fieldName]: 7 } },
      objects: [{ id: "synthetic-object", name: objectName }],
      variables: [{ id: "synthetic-field", title: fieldName, object_id: "synthetic-object", type: "number", default_value: "7" }]
    }));
    expect(imported.objects.find((o) => o.id === "synthetic-object").name).toBe(objectName);
    expect(imported.variables[0].title).toBe(fieldName);
    expect(JSON.parse(imported.initialStateJson)).toEqual({ [objectName]: { [fieldName]: 7 } });
  });
  it("keeps complete setting and character import metadata", () => {
    const title = "t".repeat(121), group = "g".repeat(81), position = "p".repeat(61);
    const imported = parseSettingLibraryFile(JSON.stringify({
      format: "eleckoi.workspace-setting-library",
      version: 3,
      name: "Synthetic library",
      entries: [{ id: "synthetic-entry", title, content: "Synthetic" }],
      groups: [{ id: "synthetic-group", name: group }],
      prompt_positions: [{ id: "synthetic-position", name: position }]
    }), "eleckoi");
    expect(imported.entries.find((e) => e.id === "synthetic-entry").title).toBe(title);
    expect(imported.groups[0].name).toBe(group);
    expect(imported.promptPositions[0].name).toBe(position);
    const card = decodeCharacterCard(Buffer.from(JSON.stringify({
      format: "eleckoi.character-card",
      version: 1,
      character: { name: title, group },
      assets: [],
      regex_rules: []
    })), "eleckoi");
    expect(card.packageData.character.name).toBe(title);
    expect(card.packageData.character).not.toHaveProperty('group');
  });
  it("imports duplicate 120-character worldbook titles with distinct suffixes and saves both", () => {
    const title = "t".repeat(120);
    const entries = [{ name: title, content: "Synthetic A", enabled: true }, { name: title, content: "Synthetic B", enabled: true }];
    const standalone = parseSettingLibraryFile(JSON.stringify({ name: "Synthetic worldbook", entries }), "sillytavern");
    expect(standalone.entries.map((e) => e.title)).toEqual([title, title + " (2)"]);
    const card = decodeCharacterCard(Buffer.from(JSON.stringify({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: { name: "Synthetic character", description: "", first_mes: "Synthetic opening", character_book: { entries } }
    })), "sillytavern");
    expect(card.settingLibrary.entries.filter((e) => e.kind === "normal").map((e) => e.title)).toEqual([title, title + " (2)"]);
    const { db, root } = database();
    characters(db, root);
    const repo = new SettingLibraryRepository(db), initial = repo.get("synthetic-card");
    expect(repo.save("synthetic-card", { ...initial, entries: [...initial.entries, ...standalone.entries], groups: standalone.groups }).entries.filter((e) => e.kind === "normal")).toHaveLength(2);
  }, 3e4);
  it("preserves the exact Tavily query, valid URL, title, and snippet", async () => {
    let provider;
    applyTavily(
      { web: { registerSearchProvider(value) {
        provider = value;
      } }, get: () => ({ resolve: async () => ({ value: "synthetic-key" }) }) },
      { apiKeyEnv: { get: () => "TAVILY_API_KEY" }, maxResults: { get: () => 5 } }
    );
    const query = "q".repeat(1e3) + "Z", url = "https://example.com/?q=" + "u".repeat(4200) + "Z", title = "t".repeat(501), content = "c".repeat(6001);
    const request = vi.fn(async (_url, _init) => new Response(JSON.stringify({ results: [{ url, title, content }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const result = await provider.search({ query, maxResults: 1 });
    expect(JSON.parse(request.mock.calls[0][1].body).query).toBe(query);
    expect(result.sources[0]).toEqual({ url, title, snippet: content });
  });
  it("keeps all desktop release notes visible in the returned update data", () => {
    const input = "Synthetic release notes\n" + "r".repeat(4e3) + "Z";
    expect(normalizeReleaseNotes(input)).toBe(input);
  });
});

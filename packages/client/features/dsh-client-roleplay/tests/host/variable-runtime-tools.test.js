import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { runtimeContextsFor } from '../../../../../../tests/helpers/runtime-contexts.js';
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import LlmRuntime, { LlmAdapter, ToolCallId, createUserMessage } from "@deepseek-ai/dsh-llm";
import SessionStore, { SessionId } from "@deepseek-ai/dsh-session";
import SessionProjectionRegistry from "@deepseek-ai/dsh-session-projection";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import AgentRegistry from "@deepseek-ai/dsh-agent";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import { apply as applyVariableTools } from "../../../../../../apps/desktop/resources/dsh/variable-tools.mjs";
import { ElecKoiVariableProcessing } from "../../../../../host/product-api/src/variable-processing.ts";

const directories = [];

afterEach(() => {
  delete process.env.ELECKOI_SESSION_SNAPSHOT_ROOT;
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function tools({ extraCount = 0, mapMarkerCount = 0, configured = true, logger } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "eleckoi-variable-tools-"));
  directories.push(directory);
  const extraNames = Array.from({ length: extraCount }, (_, index) => `指标${index}`);
  const mapMarkers = Object.fromEntries(Array.from({ length: mapMarkerCount }, (_, index) => [
    `marker-${index}`,
    { title: `地点 ${index}`, description: `地点说明 ${index} `.repeat(900), image: `https://example.invalid/${index}.webp` },
  ]));
  const bridge = configured ? {
    enabled: true,
    config: {
      defaultState: {
        状态: { 好感度: 0, 称呼: "陌生人", ...Object.fromEntries(extraNames.map((name) => [name, 0])) },
        ...(mapMarkerCount ? { 地图标记: mapMarkers } : {}),
      },
      schemaCode: "const Schema = z.object({ 状态: z.object({ 好感度: z.number().max(100), 称呼: z.string() }) })",
      objects: [
        { id: "status", name: "状态", parentId: "", enabled: true, description: "角色状态", updateRule: "仅在剧情明确变化时更新", dynamicKey: false },
      ],
      variables: [
        { id: "affinity", title: "好感度", objectId: "status", enabled: true, type: "number", defaultValue: "0", description: "当前好感", updateRule: "按互动结果小幅增减", readMode: "required" },
        { id: "address", title: "称呼", objectId: "status", enabled: true, type: "string", defaultValue: "陌生人", description: "当前称呼", updateRule: "关系变化后更新", readMode: "on_demand" },
        ...extraNames.map((name, index) => ({ id: `extra-${index}`, title: name, objectId: "status", enabled: true, type: "number", defaultValue: "0", description: "测试指标", updateRule: "按规则更新", readMode: "on_demand" })),
        ...(mapMarkerCount ? [{ id: "map-markers", title: "地图标记", objectId: "", enabled: true, type: "object", defaultValue: "{}", description: "地图资料", updateRule: "按剧情更新", readMode: "on_demand" }] : []),
      ],
    },
    state: {
      状态: { 好感度: 10, 称呼: "朋友" },
      ...(mapMarkerCount ? { 地图标记: mapMarkers } : {}),
    },
  } : { enabled: false, config: null, state: {} };
  const sessionId = "variable-tool-test-session";
  const contexts = runtimeContextsFor(sessionId, { variables: bridge });
  const registered = [];
  const processing = new ElecKoiVariableProcessing(null);
  applyVariableTools({
    eleckoiRuntimeContexts: contexts,
    eleckoiVariableProcessing: processing,
    tools: { register: (definition) => { registered.push(definition); return () => undefined; } },
    ...(logger ? { logger } : {}),
  });
  const execution = { agent: { session: { id: sessionId } } };
  return {
    contexts,
    state: () => contexts.get(sessionId).variables,
    replace: value => { contexts.get(sessionId).variables = value; },
    sessionId,
    processing,
    byName: new Map(registered.map((definition) => [definition.name, {
      ...definition,
      execute: (args) => definition.execute(args, execution),
    }])),
  };
}

describe("DSH character variable tools", () => {
  it.each([101, 1_001, 10_001])("returns all %i variable search hits without a hidden count cap", async count => {
    const runtime = await tools({ extraCount: count });
    const grep = runtime.byName.get("eleckoi_grep_variables");
    for (const output_mode of ["files_with_matches", "count"]) {
      const result = await grep.execute({ pattern: "指标", path: "/状态", glob: "指标*", output_mode });
      expect(result.matches).toHaveLength(count);
      expect(new Set(result.matches.map(item => item.path))).toEqual(new Set(Array.from({ length: count }, (_, index) => `/状态/指标${index}`)));
      expect(result).not.toHaveProperty("omitted");
    }
    expect(grep.parameters).not.toHaveProperty("limit");
  }, 30_000);

  it("preserves a search match at the end of a long single-line variable value", async () => {
    const runtime = await tools();
    const bridge = runtime.state();
    const content = "合成正文𠮷😀".repeat(20_001) + "末尾关键词";
    bridge.state.状态.称呼 = content;
    runtime.replace(bridge);
    const result = await runtime.byName.get("eleckoi_grep_variables").execute({ pattern: "末尾关键词", glob: "状态/称呼", output_mode: "content" });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].text).toContain(content);
    expect(result.matches[0]).not.toHaveProperty("text_truncated");
  });

  it("keeps every enabled preset tool registered when the character has no variable configuration", async () => {
    const runtime = await tools({ configured: false });
    const calls = [
      ["eleckoi_glob_variables", {}, { status: "ok", paths: [] }],
      ["eleckoi_grep_variables", { pattern: "状态" }, { status: "no_matches", matches: [] }],
      ["eleckoi_read_variables", { paths: ["/状态"] }, { status: "ok", variables: [] }],
      ["eleckoi_apply_variable_patch", { operations: [{ op: "replace", path: "/状态", value: {} }] }, { status: "ok", applied_operations: 0 }],
    ];
    expect([...runtime.byName.keys()]).toHaveLength(4);
    for (const [name, args, expected] of calls) {
      await expect(runtime.byName.get(name).execute(args)).resolves.toMatchObject(expected);
    }
  });

  it("discovers required variables and reads complete author metadata", async () => {
    const runtime = await tools();
    const found = await runtime.byName.get("eleckoi_glob_variables").execute({ pattern: "**" });
    expect(found.paths).toContain("/状态/好感度");
    expect(found.required_variables).toEqual([{ path: "/状态/好感度", read_mode: "required", title: "好感度" }]);
    const read = await runtime.byName.get("eleckoi_read_variables").execute({ paths: ["/状态/好感度"] });
    expect(read.variables[0]).toMatchObject({ default: 0, current: 10, current_present: true, update_rule: "按互动结果小幅增减" });

    const grep = await runtime.byName.get("eleckoi_grep_variables").execute({
      pattern: "description:[\\s\\S]*update_rule",
      multiline: true,
      output_mode: "count",
    });
    expect(grep).toMatchObject({ status: "ok", output_mode: "count" });
    expect(grep.matches.length).toBeGreaterThan(0);
  });

  it("lists every variable with the default Glob and reads more than 16 paths together", async () => {
    const runtime = await tools({ extraCount: 120 });
    const glob = runtime.byName.get("eleckoi_glob_variables");
    const found = await glob.execute({});
    expect(found.paths).toHaveLength(123);
    expect(found.required_variables.map((item) => item.path)).toEqual(["/状态/好感度"]);

    const scoped = await glob.execute({ path: "/状态", pattern: "**/不存在" });
    expect(scoped.paths).toEqual([]);
    expect(scoped.required_variables.map((item) => item.path)).toEqual(["/状态/好感度"]);

    const read = await runtime.byName.get("eleckoi_read_variables").execute({ paths: found.paths.slice(0, 20) });
    expect(read.variables).toHaveLength(20);
    expect(read.variables.map((item) => item.path)).toEqual(found.paths.slice(0, 20));
  });

  it("respects explicit pages without omitting the complete child values", async () => {
    const runtime = await tools({ mapMarkerCount: 60 });
    const readTool = runtime.byName.get("eleckoi_read_variables");
    const first = await readTool.execute({ paths: ["/地图标记"], limit: 10 });

    expect(first.variables[0].current).toMatchObject({
      kind: "object_page", total: 60, offset: 0, limit: 10, returned: 10, has_more: true, next_offset: 10,
    });
    const child = first.variables[0].current.entries[0];
    expect(child.path).toBe("/地图标记/marker-0");
    expect(child.value.description).toBe('地点说明 0 '.repeat(900));

    const detail = await readTool.execute({ paths: [child.path], limit: 2 });
    expect(detail.variables[0]).toMatchObject({ configured_path: "/地图标记" });
    expect(detail.variables[0].current).toMatchObject({ kind: "object_page", total: 3, returned: 2, has_more: true });
    expect(detail.variables[0].current.entries.find(item => item.key === 'description').value).toBe(child.value.description);

    const description = await readTool.execute({ paths: [`${child.path}/description`], char_limit: 500 });
    expect(description.variables[0].current).toMatchObject({ kind: "text_page", char_offset: 0, char_limit: 500, returned_chars: 500, has_more: true });
    expect(description.variables[0].current.text).toHaveLength(500);
  });

  it('reads all object children by default and does not clamp a requested page above one hundred', async () => {
    const runtime = await tools({ mapMarkerCount: 101 });
    const read = runtime.byName.get('eleckoi_read_variables');
    const full = await read.execute({ paths: ['/地图标记'] });
    const explicit = await read.execute({ paths: ['/地图标记'], limit: 1001 });
    for (const result of [full, explicit]) {
      expect(result.variables[0].current).toMatchObject({ returned: 101, has_more: false });
      for (const index of [0, 50, 100]) expect(result.variables[0].current.entries[index].value.description).toBe(`地点说明 ${index} `.repeat(900));
    }
    const text = await read.execute({ paths: ['/地图标记/marker-100/description'], char_limit: 10001 });
    expect(text.variables[0].current.text).toBe('地点说明 100 '.repeat(900));
  });

  it('commits more than two hundred variable operations in their original order', async () => {
    const runtime = await tools();
    const operations = Array.from({ length: 1001 }, (_, index) => ({ op: 'replace', path: '/状态/称呼', value: `Synthetic ${index}` }));
    const result = await runtime.byName.get('eleckoi_apply_variable_patch').execute({ operations });
    expect(result).toMatchObject({ status: 'ok', applied_operations: 1001 });
    expect(runtime.state().state.状态.称呼).toBe('Synthetic 1000');
  });

  it("commits valid patches to the bridge and rejects Zod-invalid changes atomically", async () => {
    const runtime = await tools();
    const patch = runtime.byName.get("eleckoi_apply_variable_patch");
    const accepted = await patch.execute({ operations: [{ op: "delta", path: "/状态/好感度", value: 5 }] });
    expect(accepted).toMatchObject({ status: "ok", applied_operations: 1 });
    expect(runtime.state().state.状态.好感度).toBe(15);

    const rejected = await patch.execute({ operations: [{ op: "replace", path: "/状态/好感度", value: 101 }] });
    expect(rejected).toMatchObject({ status: "validation_error", state_unchanged: true });
    expect(rejected).toMatchObject({ error_stage: "validation", issues: [{ path: "/状态/好感度", code: "too_big" }] });
    expect(runtime.state().state.状态.好感度).toBe(15);

    const stripped = await patch.execute({ operations: [{
      op: "replace",
      path: "/状态",
      value: { 好感度: 20, 称呼: "朋友", 未声明字段: true },
    }] });
    expect(stripped).toMatchObject({ status: "normalization_conflict", state_unchanged: true });
    expect(stripped.paths).toContain("/状态/未声明字段");
    expect(runtime.state().state.状态).toEqual({ 好感度: 15, 称呼: "朋友" });
  });

  it("returns an invalid attempt to the caller and accepts a corrected attempt without replaying successful changes", async () => {
    const runtime = await tools();
    const patch = runtime.byName.get("eleckoi_apply_variable_patch");
    const original = JSON.stringify(runtime.state());
    const failure = await patch.execute({ operations: [{ op: "delta", path: "/状态/好感度", value: 100 }] });
    expect(failure).toMatchObject({ status: "validation_error", state_unchanged: true,
      error_stage: "validation", issues: [{ path: "/状态/好感度", code: "too_big" }] });
    expect(JSON.stringify(runtime.state())).toBe(original);
    const accepted = await patch.execute({ operations: [{ op: "delta", path: "/状态/好感度", value: 5 }] });
    expect(accepted).toMatchObject({ status: "ok", applied_operations: 1 });
    expect(runtime.state().state.状态.好感度).toBe(15);
  });

  it.each(["validation", "afterSchema"])("delivers %s feedback to the next model request and completes a corrected call in the same Agent turn", async failureStage => {
    const runtime = await tools();
    const original = JSON.stringify(runtime.state());
    let calculations = 0;
    if (failureStage === "afterSchema") runtime.processing.register({ open: () => ({
      async apply(stage, state) {
        if (stage === "afterSchema") {
          calculations++;
          await Promise.resolve();
          if (state.状态.好感度 > 15) throw new Error("Synthetic post-schema rule failure");
          state.状态.称呼 = "熟人";
        }
        return state;
      }, close() {},
    }) });
    const ctx = new Context();
    const requests = [];
    class Adapter extends LlmAdapter {
      async resolveModel(provider, id) { return { provider, id, name: id }; }
      async *stream(options) {
        requests.push(options);
        const step = requests.length;
        if (step === 2) {
          const feedback = options.messages.find(message => message.role === "tool" && message.toolCallId === "invalid-attempt");
          const value = JSON.parse(feedback.content[0].text);
          expect(value).toMatchObject(failureStage === "validation"
            ? { status: "validation_error", state_unchanged: true, issues: [{ path: "/状态/好感度", code: "too_big" }] }
            : { status: "rule_error", state_unchanged: true, error_stage: "execution", detail: "Synthetic post-schema rule failure" });
          expect(JSON.stringify(runtime.state())).toBe(original);
        }
        if (step <= 2) {
          const id = ToolCallId(step === 1 ? "invalid-attempt" : "corrected-attempt");
          const name = "eleckoi_apply_variable_patch";
          const argumentsJson = JSON.stringify({ operations: [{ op: "delta", path: "/状态/好感度", value: step === 1 ? failureStage === "validation" ? 100 : 20 : 5 }] });
          yield { type: "block-start", index: 0, blockType: "tool-call" };
          yield { type: "tool-call-delta", index: 0, id, name, argumentsDelta: argumentsJson };
          yield { type: "block-end", index: 0, block: { type: "tool-call", id, name, arguments: argumentsJson } };
          yield { type: "finish", reason: { kind: "tool-calls" } };
        } else {
          const result = options.messages.find(message => message.role === "tool" && message.toolCallId === "corrected-attempt");
          expect(JSON.parse(result.content[0].text)).toMatchObject({ status: "ok", applied_operations: 1 });
          yield { type: "block-start", index: 0, blockType: "text" };
          yield { type: "text-delta", index: 0, text: "Synthetic completed reply" };
          yield { type: "block-end", index: 0, block: { type: "text", text: "Synthetic completed reply" } };
          yield { type: "finish", reason: { kind: "stop" } };
        }
      }
    }
    try {
      for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, NativeToolExecutor, AgentRegistry]) await ctx.plugin(plugin);
      await ctx.plugin(AgentLoop, { agents: [] });
      ctx.llm.registerAdapter(["synthetic"], new Adapter());
      ctx.provide("eleckoiVariableProcessing", runtime.processing);
      ctx.provide("eleckoiRuntimeContexts", runtime.contexts);
      applyVariableTools(ctx);
      const handle = await ctx.agents.create({ sessionId: SessionId(runtime.sessionId),
        agentOptions: { provider: "synthetic", model: "synthetic" } });
      handle.agent.followup(createUserMessage({ content: [{ type: "text", text: "Synthetic variable update" }], source: { kind: "user" } }));
      await handle.agent.whenIdle();
      expect(requests).toHaveLength(3);
      const events = handle.agent.session.snapshotEvents();
      expect(events.filter(event => event.type === "tool/result")).toHaveLength(2);
      expect(events.filter(event => event.type === "turn/start")).toHaveLength(1);
      expect(events.at(-1)).toMatchObject({ type: "turn/end", data: { reason: { kind: "completed" } } });
      expect(runtime.state().state.状态.好感度).toBe(15);
      if (failureStage === "afterSchema") {
        expect(runtime.state().state.状态.称呼).toBe("熟人");
        expect(calculations).toBe(2);
      }
    } finally { await ctx.fiber.dispose(); }
  }, 30000);

  it.each([
    ["const Schema = ;", "schema"],
    ["z.object({}).transform(() => { throw new Error('calculation failed') })", "execution"],
    ["z.object({}).transform(() => ({ value: NaN }))", "output"],
  ])("reports author rule failures as tool results without changing state: %s", async (schemaCode, stage) => {
    const runtime = await tools();
    const bridge = runtime.state();
    bridge.config.schemaCode = schemaCode;
    runtime.replace(bridge);
    const original = JSON.stringify(runtime.state());
    await expect(runtime.byName.get("eleckoi_apply_variable_patch").execute({
      operations: [{ op: "delta", path: "/状态/好感度", value: 5 }],
    })).resolves.toMatchObject({ status: "rule_error", error_stage: stage, state_unchanged: true });
    expect(JSON.stringify(runtime.state())).toBe(original);
  });

  it("awaits author calculations before accepting a patch and exposes a failed attempt for retry", async () => {
    const runtime = await tools();
    const original = JSON.stringify(runtime.state());
    const trace = [];
    runtime.processing.register({ open: () => ({
      async apply(stage, state, before) {
        trace.push(stage);
        if (stage === "after") {
          await Promise.resolve();
          if (state.状态.好感度 - before.状态.好感度 > 10) throw new Error("Synthetic author increment constraint");
          state.状态.称呼 = "熟人";
        }
        return state;
      }, close() { trace.push("closed"); },
    }) });
    const patch = runtime.byName.get("eleckoi_apply_variable_patch");
    await expect(patch.execute({ operations: [{ op: "delta", path: "/状态/好感度", value: 20 }] })).resolves.toMatchObject({
      status: "rule_error", error_stage: "execution", detail: "Synthetic author increment constraint", state_unchanged: true,
    });
    expect(JSON.stringify(runtime.state())).toBe(original);
    await expect(patch.execute({ operations: [{ op: "delta", path: "/状态/好感度", value: 5 }] })).resolves.toMatchObject({ status: "ok" });
    expect(runtime.state().state.状态).toEqual({ 好感度: 15, 称呼: "熟人" });
    expect(trace).toEqual(["before", "after", "closed", "before", "after", "afterSchema", "closed"]);
  });

  it('rejects a suspended patch when a newer shared variable state commits first', async () => {
    const runtime = await tools();
    let entered, resume;
    const waiting = new Promise(resolve => { entered = resolve; });
    const released = new Promise(resolve => { resume = resolve; });
    runtime.processing.process = async ({ before, apply }) => {
      const patched = apply(structuredClone(before));
      entered();
      await released;
      return { state: patched, patched };
    };
    const pending = runtime.byName.get('eleckoi_apply_variable_patch').execute({ operations: [{ op: 'delta', path: '/状态/好感度', value: 5 }] });
    await waiting;
    runtime.replace({ ...runtime.state(), state: { 状态: { 好感度: 30, 称呼: '新状态' } } });
    resume();
    await expect(pending).resolves.toMatchObject({ status: 'state_conflict', state_unchanged: true });
    expect(runtime.state().state.状态).toEqual({ 好感度: 30, 称呼: '新状态' });
  });

  it("logs one searchable coded line at the failure exit and still throws", async () => {
    const lines = [];
    const runtime = await tools({ logger: { warn: (line) => lines.push(line) } });

    // 非法 JSON Pointer 转义在外面只会变成一条 patch_error 结果；带码失败要走边界④：日志 + 再抛。
    const rejection = await runtime.byName.get("eleckoi_apply_variable_patch")
      .execute({ operations: [{ op: "replace", path: "/状态/~2", value: 1 }] })
      .then(() => undefined, (error) => error);

    expect(rejection).toBeInstanceOf(Error);
    expect(rejection.message).toBe("path 包含无效的 JSON Pointer 转义");
    expect(rejection.code).toBe("eleckoi/input/invalid");
    expect(rejection.details).toEqual({ field: "path" });
    expect(lines).toHaveLength(1);
    const line = lines[0];
    const prefix = "eleckoi/runtime-plugin-failure ";
    expect(line.startsWith(prefix)).toBe(true);
    expect(JSON.parse(line.slice(prefix.length))).toMatchObject({
      plugin: "eleckoi-variable-tools",
      operation: "eleckoi_apply_variable_patch",
      code: "eleckoi/input/invalid",
      message: "path 包含无效的 JSON Pointer 转义",
      details: { field: "path" },
    });
    expect(runtime.state().state.状态.好感度).toBe(10);
  });
});

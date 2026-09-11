import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { apply as applyVariableTools } from "../resources/dsh/variable-tools.mjs";

const directories = [];

afterEach(() => {
  delete process.env.ELECKOI_VARIABLE_STATE_FILE;
  delete process.env.ELECKOI_VARIABLES_ENABLED;
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function tools() {
  const directory = mkdtempSync(join(tmpdir(), "eleckoi-variable-tools-"));
  directories.push(directory);
  const file = join(directory, "state.json");
  writeFileSync(file, JSON.stringify({
    enabled: true,
    config: {
      initialState: { 状态: { 好感度: 0, 称呼: "陌生人" } },
      schemaCode: "const Schema = z.object({ 状态: z.object({ 好感度: z.number().max(100), 称呼: z.string() }) })",
      objects: [
        { id: "status", name: "状态", parentId: "", enabled: true, description: "角色状态", updateRule: "仅在剧情明确变化时更新", dynamicKey: false },
      ],
      variables: [
        { id: "affinity", title: "好感度", objectId: "status", enabled: true, type: "number", defaultValue: "0", description: "当前好感", updateRule: "按互动结果小幅增减", readMode: "required" },
        { id: "address", title: "称呼", objectId: "status", enabled: true, type: "string", defaultValue: "陌生人", description: "当前称呼", updateRule: "关系变化后更新", readMode: "on_demand" },
      ],
    },
    state: { 状态: { 好感度: 10, 称呼: "朋友" } },
  }, null, 2));
  process.env.ELECKOI_VARIABLE_STATE_FILE = file;
  process.env.ELECKOI_VARIABLES_ENABLED = "1";
  const registered = [];
  applyVariableTools({ tools: { register: (definition) => { registered.push(definition); return () => undefined; } } });
  return { file, byName: new Map(registered.map((definition) => [definition.name, definition])) };
}

describe("DSH character variable tools", () => {
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

  it("commits valid patches to the bridge and rejects Zod-invalid changes atomically", async () => {
    const runtime = await tools();
    const patch = runtime.byName.get("eleckoi_apply_variable_patch");
    const accepted = await patch.execute({ operations: [{ op: "delta", path: "/状态/好感度", value: 5 }] });
    expect(accepted).toMatchObject({ status: "ok", applied_operations: 1 });
    expect(JSON.parse(readFileSync(runtime.file, "utf8")).state.状态.好感度).toBe(15);

    const rejected = await patch.execute({ operations: [{ op: "replace", path: "/状态/好感度", value: 101 }] });
    expect(rejected).toMatchObject({ status: "validation_error", state_unchanged: true });
    expect(JSON.parse(readFileSync(runtime.file, "utf8")).state.状态.好感度).toBe(15);

    const stripped = await patch.execute({ operations: [{
      op: "replace",
      path: "/状态",
      value: { 好感度: 20, 称呼: "朋友", 未声明字段: true },
    }] });
    expect(stripped).toMatchObject({ status: "normalization_conflict", state_unchanged: true });
    expect(stripped.paths).toContain("/状态/未声明字段");
    expect(JSON.parse(readFileSync(runtime.file, "utf8")).state.状态).toEqual({ 好感度: 15, 称呼: "朋友" });
  });
});

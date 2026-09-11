import { describe, expect, it } from "vitest";
import {
  copyVariableNode,
  createObjectDraft,
  createVariableDraft,
  deleteVariableNode,
  ensureInitializationObject,
  moveVariableNode,
  replaceObjectContentsFromJson,
  variablePointerPath,
  syncActiveVersion,
  withGeneratedInitialState,
} from "../src/renderer/src/modules/variables/model/variableConfigEditing.js";
import {
  createVariableVersion,
  importVariableConfig,
  serializeVariableConfig,
  switchVariableVersion,
} from "../src/renderer/src/modules/variables/model/variableConfigTransfer.js";
import { variableTreeNodes } from "../src/renderer/src/modules/variables/model/variableConfigTree.js";

const stamp = "2026-09-06T00:00:00.000Z";
function config() {
  const objects = [
    { id: "status", name: "状态", parentId: "", enabled: true, description: "", updateRule: "", dynamicKey: false, order: 1, treeViewOrder: 1, createdAt: stamp, updatedAt: stamp },
    { id: "detail", name: "详情/资料", parentId: "status", enabled: true, description: "保留", updateRule: "保留规则", dynamicKey: false, order: 2, treeViewOrder: 1, createdAt: stamp, updatedAt: stamp },
  ];
  const variables = [
    { id: "mood", title: "心情~值", objectId: "detail", enabled: true, type: "string", defaultValue: "平静", description: "保留变量", updateRule: "变化时更新", readMode: "required", order: 1, treeViewOrder: 1, createdAt: stamp, updatedAt: stamp },
  ];
  const version = { id: "v1", name: "正式版", initialStateJson: "{}", schemaCode: "z.object({})", objects, variables, expandedObjectIds: ["status"], createdAt: stamp, updatedAt: stamp };
  return withGeneratedInitialState({ characterId: "card-a", ...version, activeVersionId: "v1", versions: [version] });
}

describe("variable configuration editing", () => {
  it("always exposes the fixed runtime configuration node, including an empty version", () => {
    const empty = { ...config(), schemaCode: "", objects: [], variables: [] };
    const prepared = ensureInitializationObject(empty);
    expect(variableTreeNodes(prepared)).toEqual([
      expect.objectContaining({
        recordId: "fixed-variable-initialization-object",
        label: "变量运行配置",
        fixed: true,
      }),
    ]);
    expect(ensureInitializationObject(prepared).objects).toHaveLength(1);
  });

  it("creates a variable group with the same user-facing term as Android", () => {
    const created = createObjectDraft(config(), "");
    expect(created).toMatchObject({ name: "新建变量组", dynamicKey: false });
  });

  it("keeps a new variable type unselected until the author chooses a JSON structure", () => {
    const created = createVariableDraft(config(), "status");
    expect(created).toMatchObject({ objectId: "status", type: "" });
  });

  it("keeps JSON Pointer paths escaped and prevents object cycles", () => {
    const source = config();
    expect(variablePointerPath(source, { kind: "variable", value: source.variables[0] })).toBe("/状态/详情~1资料/心情~0值");
    expect(moveVariableNode(source, { kind: "object", id: "status" }, "detail", 0)).toEqual(source);
  });

  it("copies and deletes complete object subtrees", () => {
    const copied = copyVariableNode(config(), { kind: "object", id: "status" }, "");
    expect(copied.config.objects).toHaveLength(4);
    expect(copied.config.variables).toHaveLength(2);
    const copiedRoot = copied.config.objects.find((item) => item.name === "状态 副本");
    expect(copiedRoot).toBeTruthy();
    const removed = deleteVariableNode(copied.config, { kind: "object", id: copiedRoot.id });
    expect(removed.objects).toHaveLength(2);
    expect(removed.variables).toHaveLength(1);
  });

  it("rebuilds an object from JSON while preserving metadata at matching paths", () => {
    const source = config();
    const rebuilt = replaceObjectContentsFromJson(source, "status", '{"详情/资料":{"心情~值":"开心","计数":2}}');
    expect(rebuilt.objects.find((item) => item.id === "detail")).toMatchObject({ description: "保留", updateRule: "保留规则" });
    expect(rebuilt.variables.find((item) => item.id === "mood")).toMatchObject({ defaultValue: "开心", readMode: "required", description: "保留变量" });
    expect(JSON.parse(rebuilt.initialStateJson)).toEqual({ 状态: { "详情/资料": { "心情~值": "开心", 计数: 2 } } });
  });

  it("preserves authored initial state when a dynamic-key object owns runtime keys", () => {
    const source = config();
    const dynamic = {
      ...source,
      initialStateJson: '{"角色":{"测试角色":{"好感度":8}}}',
      objects: source.objects.map((item) => item.id === "status" ? { ...item, name: "角色", dynamicKey: true } : item),
    };
    expect(withGeneratedInitialState(dynamic).initialStateJson).toBe(dynamic.initialStateJson);
    expect(syncActiveVersion(dynamic).initialStateJson).toBe(dynamic.initialStateJson);
  });

  it("projects a disabled object to all descendants", () => {
    const source = config();
    source.objects = source.objects.map((item) => item.id === "status" ? { ...item, enabled: false } : item);
    const root = variableTreeNodes(source).find((item) => item.recordId === "status");
    expect(root.enabled).toBe(false);
    expect(root.children[0]).toMatchObject({ enabled: false, ancestorEnabled: false });
    expect(root.children[0].children[0]).toMatchObject({ enabled: false, ancestorEnabled: false });
  });
});

describe("variable configuration versions and transfer", () => {
  it("creates and switches explicit versions without overwriting the active snapshot", () => {
    const source = config();
    const created = createVariableVersion(source);
    expect(created.versions).toHaveLength(2);
    expect(created.name).toBe("");
    expect(created.objects).toEqual([]);
    const restored = switchVariableVersion(created, "v1");
    expect(restored.name).toBe("正式版");
    expect(restored.objects).toHaveLength(2);
  });

  it("exports the Android-compatible document and imports it as a new draft version", () => {
    const source = config();
    const exported = JSON.parse(serializeVariableConfig(source));
    expect(exported).toMatchObject({ format: "eleckoi.variable-config", version: 1, active_version_id: "v1" });
    expect(exported.objects[0]).toMatchObject({ parent_id: "", dynamic_key: false, tree_view_order: 1 });
    expect(exported.variables[0]).toMatchObject({ object_id: "detail", default_value: "平静", read_mode: "required" });
    const imported = importVariableConfig(source, JSON.stringify(exported));
    expect(imported.versions).toHaveLength(2);
    expect(imported.variables[0]).toMatchObject({ title: "心情~值", defaultValue: "平静", readMode: "required" });
  });
});

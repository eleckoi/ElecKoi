import { DEFAULT_VARIABLE_CONFIG_VERSION_ID, VARIABLE_INITIALIZATION_OBJECT_ID } from "../../../../../shared/contracts/variables/schemas.ts";
import { createVariableId, syncActiveVersion, uniqueVariableName, withGeneratedInitialState } from "./variableConfigEditing.js";

function stamp() {
  return new Date().toISOString();
}

function objectJson(item) {
  return {
    id: item.id, name: item.name, parent_id: item.parentId, enabled: item.enabled,
    description: item.description, update_rule: item.updateRule, dynamic_key: item.dynamicKey,
    order: item.order, tree_view_order: item.treeViewOrder,
    created_at: item.createdAt, updated_at: item.updatedAt,
  };
}

function variableJson(item) {
  return {
    id: item.id, title: item.title, object_id: item.objectId, enabled: item.enabled,
    type: item.type, default_value: item.defaultValue, description: item.description,
    update_rule: item.updateRule, read_mode: item.readMode, order: item.order,
    tree_view_order: item.treeViewOrder, created_at: item.createdAt, updated_at: item.updatedAt,
  };
}

function parsedInitialState(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || "{}") : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function versionJson(version) {
  return {
    id: version.id,
    name: version.name,
    initial_state: parsedInitialState(version.initialStateJson),
    schema_code: version.schemaCode,
    objects: version.objects.map(objectJson),
    variables: version.variables.map(variableJson),
    expanded_object_ids: version.expandedObjectIds,
    created_at: version.createdAt,
    updated_at: version.updatedAt,
  };
}

export function serializeVariableConfig(config) {
  const synced = syncActiveVersion(config);
  return JSON.stringify({
    format: "eleckoi.variable-config",
    version: 1,
    character_id: synced.characterId,
    name: synced.name,
    active_version_id: synced.activeVersionId,
    updated_at: stamp(),
    initial_state: parsedInitialState(synced.initialStateJson),
    schema_code: synced.schemaCode,
    objects: synced.objects.map(objectJson),
    variables: synced.variables.map(variableJson),
    expanded_object_ids: synced.expandedObjectIds,
    versions: synced.versions.map(versionJson),
  }, null, 2);
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function integer(value, fallback, min = 0) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(min, number) : fallback;
}

function parseObject(value, index, idMap) {
  const sourceId = text(value?.id);
  const id = sourceId || createVariableId("object");
  if (sourceId) idMap.set(sourceId, id);
  return {
    id, name: text(value?.name).slice(0, 40), parentId: text(value?.parent_id),
    enabled: value?.enabled !== false, description: text(value?.description), updateRule: text(value?.update_rule),
    dynamicKey: value?.dynamic_key === true, order: integer(value?.order, index + 1),
    treeViewOrder: integer(value?.tree_view_order, index + 1), createdAt: text(value?.created_at) || stamp(),
    updatedAt: text(value?.updated_at) || stamp(),
  };
}

function parseVariable(value, index, objectIdMap) {
  const type = ["", "number", "string", "boolean", "array"].includes(value?.type) ? value.type : "";
  return {
    id: text(value?.id) || createVariableId("variable"), title: text(value?.title).slice(0, 60),
    objectId: objectIdMap.get(text(value?.object_id)) || "", enabled: value?.enabled !== false,
    type, defaultValue: text(value?.default_value), description: text(value?.description),
    updateRule: text(value?.update_rule), readMode: value?.read_mode === "required" ? "required" : "on_demand",
    order: integer(value?.order, index + 1, 1), treeViewOrder: integer(value?.tree_view_order, index + 1),
    createdAt: text(value?.created_at) || stamp(), updatedAt: text(value?.updated_at) || stamp(),
  };
}

function parseVersion(value, existingNames, requestedName = "") {
  const sourceObjects = Array.isArray(value?.objects)
    ? value.objects.filter((item) => item && typeof item === "object" && text(item.id) !== VARIABLE_INITIALIZATION_OBJECT_ID)
    : [];
  const objectIdMap = new Map();
  const objects = sourceObjects.map((item, index) => parseObject(item, index, objectIdMap));
  for (const object of objects) object.parentId = objectIdMap.get(object.parentId) || "";
  const variables = (Array.isArray(value?.variables) ? value.variables : []).filter((item) => item && typeof item === "object")
    .map((item, index) => parseVariable(item, index, objectIdMap));
  const name = uniqueVariableName(requestedName || text(value?.name) || "导入版本", existingNames).slice(0, 60);
  const createdAt = text(value?.created_at) || stamp();
  return withGeneratedInitialState({
    id: createVariableId("variable-version"), name,
    initialStateJson: JSON.stringify(parsedInitialState(value?.initial_state), null, 2),
    schemaCode: text(value?.schema_code), objects, variables,
    expandedObjectIds: (Array.isArray(value?.expanded_object_ids) ? value.expanded_object_ids : []).map(text).map((id) => objectIdMap.get(id)).filter(Boolean),
    createdAt, updatedAt: text(value?.updated_at) || createdAt,
  });
}

export function importVariableConfig(config, sourceText) {
  let data;
  try { data = JSON.parse(sourceText); } catch (error) { throw new Error("变量配置文件不是有效的 JSON。", { cause: error }); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("变量配置文件格式不正确。");
  if (data.format && data.format !== "eleckoi.variable-config") throw new Error("这不是 ElecKoi 变量配置文件。");
  const synced = syncActiveVersion(config);
  const names = new Set(synced.versions.map((item) => item.name));
  const imported = parseVersion(data, names);
  return {
    ...synced,
    ...imported,
    characterId: synced.characterId,
    activeVersionId: imported.id,
    versions: [...synced.versions, imported],
  };
}

export function switchVariableVersion(config, versionId) {
  const synced = syncActiveVersion(config);
  const target = synced.versions.find((item) => item.id === versionId);
  if (!target) return config;
  return { ...synced, ...target, characterId: synced.characterId, activeVersionId: target.id, versions: synced.versions };
}

export function createVariableVersion(config, { name = "", copyCurrent = false } = {}) {
  const synced = syncActiveVersion(config);
  const names = new Set(synced.versions.map((item) => item.name));
  const requestedName = name.trim();
  const versionName = requestedName ? uniqueVariableName(requestedName, names).slice(0, 60) : "";
  const createdAt = stamp();
  const version = copyCurrent ? {
    ...synced.versions.find((item) => item.id === synced.activeVersionId),
    id: createVariableId("variable-version"), name: versionName,
    objects: synced.objects.filter((item) => item.id !== VARIABLE_INITIALIZATION_OBJECT_ID).map((item) => ({ ...item })),
    variables: synced.variables.map((item) => ({ ...item })),
    expandedObjectIds: [...synced.expandedObjectIds], createdAt, updatedAt: createdAt,
  } : {
    id: createVariableId("variable-version"), name: versionName, initialStateJson: "{}", schemaCode: "",
    objects: [], variables: [], expandedObjectIds: [], createdAt, updatedAt: createdAt,
  };
  return { ...synced, ...version, characterId: synced.characterId, activeVersionId: version.id, versions: [...synced.versions, version] };
}

export function deleteActiveVariableVersion(config) {
  const synced = syncActiveVersion(config);
  const remaining = synced.versions.filter((item) => item.id !== synced.activeVersionId);
  if (remaining.length) {
    const target = remaining[0];
    return { ...synced, ...target, characterId: synced.characterId, activeVersionId: target.id, versions: remaining };
  }
  const createdAt = stamp();
  const empty = { id: DEFAULT_VARIABLE_CONFIG_VERSION_ID, name: "", initialStateJson: "{}", schemaCode: "", objects: [], variables: [], expandedObjectIds: [], createdAt, updatedAt: createdAt };
  return { ...synced, ...empty, characterId: synced.characterId, activeVersionId: empty.id, versions: [empty] };
}

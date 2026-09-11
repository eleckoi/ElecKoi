import {
  DEFAULT_VARIABLE_CONFIG_VERSION_ID,
  VARIABLE_INITIALIZATION_OBJECT_ID,
  VARIABLE_INITIALIZATION_OBJECT_NAME,
} from "../../../../../shared/contracts/variables/schemas.ts";
import { generatedInitialStateJson } from "../../../../../shared/foundation/variables/initialState.ts";

export const VARIABLE_NODE_KINDS = Object.freeze({ object: "object", variable: "variable" });

export function createVariableId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function uniqueVariableName(base, names) {
  const clean = String(base || "").trim();
  if (!names.has(clean)) return clean;
  let index = 2;
  while (names.has(`${clean} ${index}`)) index += 1;
  return `${clean} ${index}`;
}

function now() {
  return new Date().toISOString();
}

export function ensureInitializationObject(config) {
  if (config.objects.some((item) => item.id === VARIABLE_INITIALIZATION_OBJECT_ID)) return config;
  const stamp = now();
  return {
    ...config,
    objects: [{
      id: VARIABLE_INITIALIZATION_OBJECT_ID,
      name: VARIABLE_INITIALIZATION_OBJECT_NAME,
      parentId: "",
      enabled: true,
      description: "",
      updateRule: "",
      dynamicKey: false,
      order: 0,
      treeViewOrder: 0,
      createdAt: stamp,
      updatedAt: stamp,
    }, ...config.objects],
  };
}

export function nodeKey(kind, id) {
  return `${kind}:${id}`;
}

export function parseNodeKey(key) {
  const [kind, ...id] = String(key || "").split(":");
  return { kind, id: id.join(":") };
}

export function createObjectDraft(config, parentId = "") {
  const names = new Set(config.objects.filter((item) => item.parentId === parentId).map((item) => item.name));
  const stamp = now();
  return {
    id: createVariableId("object"),
    name: uniqueVariableName("新建变量组", names),
    parentId,
    enabled: true,
    description: "",
    updateRule: "",
    dynamicKey: false,
    order: config.objects.length + 1,
    treeViewOrder: nextTreeOrder(config, parentId),
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function createVariableDraft(config, objectId = "") {
  const names = new Set(config.variables.filter((item) => item.objectId === objectId).map((item) => item.title));
  const stamp = now();
  return {
    id: createVariableId("variable"),
    title: uniqueVariableName("新建变量", names),
    objectId,
    enabled: true,
    type: "",
    defaultValue: "",
    description: "",
    updateRule: "",
    readMode: "on_demand",
    order: config.variables.length + 1,
    treeViewOrder: nextTreeOrder(config, objectId),
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function selectedVariableNode(config, key) {
  const parsed = parseNodeKey(key);
  if (parsed.kind === "object") return { kind: "object", value: config.objects.find((item) => item.id === parsed.id) || null };
  if (parsed.kind === "variable") return { kind: "variable", value: config.variables.find((item) => item.id === parsed.id) || null };
  return { kind: "", value: null };
}

export function nextTreeOrder(config, parentId) {
  return 1 + Math.max(0,
    ...config.objects.filter((item) => item.parentId === parentId && item.id !== VARIABLE_INITIALIZATION_OBJECT_ID).map((item) => item.treeViewOrder),
    ...config.variables.filter((item) => item.objectId === parentId).map((item) => item.treeViewOrder),
  );
}

export function descendantsOf(config, objectId) {
  const ids = new Set([objectId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of config.objects) {
      if (!ids.has(object.id) && ids.has(object.parentId)) {
        ids.add(object.id);
        changed = true;
      }
    }
  }
  return ids;
}

function siblingRecords(config, parentId, omittedKey = "") {
  return [
    ...config.objects
      .filter((item) => item.parentId === parentId && item.id !== VARIABLE_INITIALIZATION_OBJECT_ID && nodeKey("object", item.id) !== omittedKey)
      .map((item) => ({ kind: "object", id: item.id, treeViewOrder: item.treeViewOrder, order: item.order })),
    ...config.variables
      .filter((item) => item.objectId === parentId && nodeKey("variable", item.id) !== omittedKey)
      .map((item) => ({ kind: "variable", id: item.id, treeViewOrder: item.treeViewOrder, order: item.order })),
  ].sort((left, right) => left.treeViewOrder - right.treeViewOrder || left.order - right.order);
}

function reorderParent(config, parentId, preferred = null) {
  const siblings = preferred || siblingRecords(config, parentId);
  const positions = new Map(siblings.map((item, index) => [nodeKey(item.kind, item.id), index + 1]));
  return {
    ...config,
    objects: config.objects.map((item) => positions.has(nodeKey("object", item.id)) ? { ...item, treeViewOrder: positions.get(nodeKey("object", item.id)) } : item),
    variables: config.variables.map((item) => positions.has(nodeKey("variable", item.id)) ? { ...item, treeViewOrder: positions.get(nodeKey("variable", item.id)) } : item),
  };
}

export function moveVariableNode(config, moved, destinationParentId, destinationIndex) {
  if (!moved?.id || moved.id === VARIABLE_INITIALIZATION_OBJECT_ID || destinationParentId === VARIABLE_INITIALIZATION_OBJECT_ID) return config;
  const source = moved.kind === "object"
    ? config.objects.find((item) => item.id === moved.id)
    : config.variables.find((item) => item.id === moved.id);
  if (!source) return config;
  if (destinationParentId && !config.objects.some((item) => item.id === destinationParentId && item.id !== VARIABLE_INITIALIZATION_OBJECT_ID)) return config;
  if (moved.kind === "object" && descendantsOf(config, moved.id).has(destinationParentId)) return config;
  const sourceParentId = moved.kind === "object" ? source.parentId : source.objectId;
  const movedKey = nodeKey(moved.kind, moved.id);
  let next = {
    ...config,
    objects: config.objects.map((item) => item.id === moved.id && moved.kind === "object" ? { ...item, parentId: destinationParentId } : item),
    variables: config.variables.map((item) => item.id === moved.id && moved.kind === "variable" ? { ...item, objectId: destinationParentId } : item),
  };
  const destination = siblingRecords(next, destinationParentId, movedKey);
  destination.splice(Math.max(0, Math.min(destination.length, destinationIndex)), 0, { ...moved, treeViewOrder: 0, order: source.order });
  next = reorderParent(next, destinationParentId, destination);
  if (sourceParentId !== destinationParentId) next = reorderParent(next, sourceParentId);
  return withGeneratedInitialState(next);
}

export function deleteVariableNode(config, target) {
  if (!target?.id || target.id === VARIABLE_INITIALIZATION_OBJECT_ID) return config;
  if (target.kind === "variable") return withGeneratedInitialState({ ...config, variables: config.variables.filter((item) => item.id !== target.id) });
  const removed = descendantsOf(config, target.id);
  return withGeneratedInitialState({
    ...config,
    objects: config.objects.filter((item) => !removed.has(item.id)),
    variables: config.variables.filter((item) => !removed.has(item.objectId)),
    expandedObjectIds: config.expandedObjectIds.filter((id) => !removed.has(id)),
  });
}

export function copyVariableNode(config, target, destinationParentId) {
  if (!target?.id || target.id === VARIABLE_INITIALIZATION_OBJECT_ID) return { config, key: "" };
  if (target.kind === "variable") {
    const source = config.variables.find((item) => item.id === target.id);
    if (!source) return { config, key: "" };
    const copy = { ...source, id: createVariableId("variable"), objectId: destinationParentId, title: uniqueVariableName(`${source.title} 副本`, new Set(config.variables.filter((item) => item.objectId === destinationParentId).map((item) => item.title))), treeViewOrder: nextTreeOrder(config, destinationParentId), createdAt: now(), updatedAt: now() };
    return { config: withGeneratedInitialState({ ...config, variables: [...config.variables, copy] }), key: nodeKey("variable", copy.id) };
  }
  const source = config.objects.find((item) => item.id === target.id);
  if (!source) return { config, key: "" };
  const subtree = descendantsOf(config, source.id);
  const idMap = new Map([...subtree].map((id) => [id, createVariableId("object")]));
  const stamp = now();
  const copiedRootName = uniqueVariableName(`${source.name} 副本`, new Set(config.objects.filter((item) => item.parentId === destinationParentId).map((item) => item.name)));
  const objects = config.objects.filter((item) => subtree.has(item.id)).map((item) => ({
    ...item,
    id: idMap.get(item.id),
    name: item.id === source.id ? copiedRootName : item.name,
    parentId: item.id === source.id ? destinationParentId : idMap.get(item.parentId),
    treeViewOrder: item.id === source.id ? nextTreeOrder(config, destinationParentId) : item.treeViewOrder,
    createdAt: stamp,
    updatedAt: stamp,
  }));
  const variables = config.variables.filter((item) => subtree.has(item.objectId)).map((item) => ({ ...item, id: createVariableId("variable"), objectId: idMap.get(item.objectId), createdAt: stamp, updatedAt: stamp }));
  return {
    config: withGeneratedInitialState({ ...config, objects: [...config.objects, ...objects], variables: [...config.variables, ...variables] }),
    key: nodeKey("object", idMap.get(source.id)),
  };
}

export function variablePointerPath(config, target) {
  if (!target?.value || target.value.id === VARIABLE_INITIALIZATION_OBJECT_ID) return "/";
  const escape = (value) => String(value).replaceAll("~", "~0").replaceAll("/", "~1");
  const names = [];
  if (target.kind === "variable") names.unshift(target.value.title);
  let objectId = target.kind === "object" ? target.value.id : target.value.objectId;
  const visited = new Set();
  while (objectId && !visited.has(objectId)) {
    visited.add(objectId);
    const object = config.objects.find((item) => item.id === objectId);
    if (!object || object.id === VARIABLE_INITIALIZATION_OBJECT_ID) break;
    names.unshift(object.dynamicKey ? `<${object.name}>` : object.name);
    objectId = object.parentId;
  }
  return `/${names.map(escape).join("/")}`;
}

function valueDraft(config, title, objectId, value, treeViewOrder, preserved) {
  const stamp = now();
  let type = "string";
  let defaultValue = value == null ? "" : String(value);
  if (Array.isArray(value)) { type = "array"; defaultValue = JSON.stringify(value, null, 2); }
  else if (typeof value === "number") type = "number";
  else if (typeof value === "boolean") type = "boolean";
  return {
    id: preserved?.id || createVariableId("variable"), title, objectId, enabled: preserved?.enabled ?? true,
    type, defaultValue, description: preserved?.description || "", updateRule: preserved?.updateRule || "",
    readMode: preserved?.readMode || "on_demand", order: preserved?.order || config.variables.length + 1,
    treeViewOrder, createdAt: preserved?.createdAt || stamp, updatedAt: stamp,
  };
}

export function replaceObjectContentsFromJson(config, objectId, sourceText) {
  const parsed = JSON.parse(sourceText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("对象内容必须是 JSON 对象。");
  const removedObjects = new Set();
  for (const child of config.objects.filter((item) => item.parentId === objectId)) for (const id of descendantsOf(config, child.id)) removedObjects.add(id);
  const oldVariables = config.variables.filter((item) => item.objectId === objectId || removedObjects.has(item.objectId));
  const oldObjects = config.objects.filter((item) => removedObjects.has(item.id));
  const variableByPath = new Map(oldVariables.map((item) => [variablePointerPath(config, { kind: "variable", value: item }).replace(variablePointerPath(config, { kind: "object", value: config.objects.find((object) => object.id === objectId) }), ""), item]));
  const objectByPath = new Map(oldObjects.map((item) => [variablePointerPath(config, { kind: "object", value: item }).replace(variablePointerPath(config, { kind: "object", value: config.objects.find((object) => object.id === objectId) }), ""), item]));
  const stamp = now();
  const objects = config.objects.filter((item) => !removedObjects.has(item.id));
  const variables = config.variables.filter((item) => item.objectId !== objectId && !removedObjects.has(item.objectId));
  const append = (record, parentId, path) => {
    let treeViewOrder = 1;
    for (const [rawKey, value] of Object.entries(record)) {
      const segment = `/${String(rawKey).replaceAll("~", "~0").replaceAll("/", "~1")}`;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const dynamicKey = rawKey.startsWith("<") && rawKey.endsWith(">");
        const name = dynamicKey ? rawKey.slice(1, -1) : rawKey;
        const preserved = objectByPath.get(`${path}${segment}`);
        const object = { id: preserved?.id || createVariableId("object"), name, parentId, enabled: preserved?.enabled ?? true, description: preserved?.description || "", updateRule: preserved?.updateRule || "", dynamicKey, order: preserved?.order || objects.length + 1, treeViewOrder, createdAt: preserved?.createdAt || stamp, updatedAt: stamp };
        objects.push(object);
        append(value, object.id, `${path}${segment}`);
      } else {
        variables.push(valueDraft(config, rawKey, parentId, value, treeViewOrder, variableByPath.get(`${path}${segment}`)));
      }
      treeViewOrder += 1;
    }
  };
  append(parsed, objectId, "");
  return withGeneratedInitialState({ ...config, objects, variables, expandedObjectIds: config.expandedObjectIds.filter((id) => !removedObjects.has(id)) });
}

export function convertVariableToObject(config, variableId) {
  const source = config.variables.find((item) => item.id === variableId);
  if (!source) return { config, key: "" };
  const stamp = now();
  const object = {
    id: createVariableId("object"), name: source.title, parentId: source.objectId, enabled: source.enabled,
    description: source.description, updateRule: source.updateRule, dynamicKey: false, order: config.objects.length + 1,
    treeViewOrder: source.treeViewOrder, createdAt: stamp, updatedAt: stamp,
  };
  return { config: withGeneratedInitialState({ ...config, objects: [...config.objects, object], variables: config.variables.filter((item) => item.id !== variableId) }), key: nodeKey("object", object.id) };
}

export function withGeneratedInitialState(config) {
  if (config.objects.some((item) => item.id !== VARIABLE_INITIALIZATION_OBJECT_ID && item.dynamicKey)) {
    return config;
  }
  return { ...config, initialStateJson: generatedInitialStateJson(config.objects, config.variables) };
}

export function syncActiveVersion(config) {
  const initialStateJson = config.objects.some((item) => item.id !== VARIABLE_INITIALIZATION_OBJECT_ID && item.dynamicKey)
    ? config.initialStateJson
    : generatedInitialStateJson(config.objects, config.variables);
  const active = {
    ...(config.versions.find((item) => item.id === config.activeVersionId) || { id: config.activeVersionId || DEFAULT_VARIABLE_CONFIG_VERSION_ID, createdAt: now(), updatedAt: now() }),
    name: config.name,
    initialStateJson,
    schemaCode: config.schemaCode,
    objects: config.objects,
    variables: config.variables,
    expandedObjectIds: config.expandedObjectIds,
  };
  const versions = config.versions.some((item) => item.id === active.id)
    ? config.versions.map((item) => item.id === active.id ? active : item)
    : [...config.versions, active];
  return { ...config, ...active, characterId: config.characterId, activeVersionId: active.id, versions };
}

import { VARIABLE_INITIALIZATION_OBJECT_ID } from "../../../../../shared/contracts/variables/schemas.ts";
import { nodeKey } from "./variableConfigEditing.js";

function ordered(items) {
  return items.sort((left, right) => left.treeViewOrder - right.treeViewOrder || left.order - right.order);
}

export function variableTreeNodes(config) {
  const objectsByParent = new Map();
  const variablesByParent = new Map();
  for (const object of config.objects) {
    const siblings = objectsByParent.get(object.parentId) || [];
    siblings.push(object);
    objectsByParent.set(object.parentId, siblings);
  }
  for (const variable of config.variables) {
    const siblings = variablesByParent.get(variable.objectId) || [];
    siblings.push(variable);
    variablesByParent.set(variable.objectId, siblings);
  }
  const build = (parentId, ancestorEnabled = true) => ordered([
    ...(objectsByParent.get(parentId) || []).map((object) => ({ ...object, kind: "object" })),
    ...(variablesByParent.get(parentId) || []).map((variable) => ({ ...variable, kind: "variable" })),
  ]).map((item) => {
    if (item.kind === "object") {
      const fixed = item.id === VARIABLE_INITIALIZATION_OBJECT_ID;
      const enabled = ancestorEnabled && (fixed || item.enabled);
      return {
        id: nodeKey("object", item.id),
        nodeKind: "object",
        recordId: item.id,
        label: item.name,
        enabled,
        ownEnabled: item.enabled,
        ancestorEnabled,
        fixed,
        dynamicKey: item.dynamicKey,
        searchText: `${item.name} ${item.description} ${item.updateRule}`.toLocaleLowerCase(),
        childCount: (objectsByParent.get(item.id) || []).length + (variablesByParent.get(item.id) || []).length,
        children: build(item.id, enabled),
      };
    }
    return {
      id: nodeKey("variable", item.id),
      nodeKind: "variable",
      recordId: item.id,
      label: item.title,
      enabled: ancestorEnabled && item.enabled,
      ownEnabled: item.enabled,
      ancestorEnabled,
      fixed: false,
      valueType: item.type,
      readMode: item.readMode,
      searchText: `${item.title} ${item.description} ${item.updateRule} ${item.type}`.toLocaleLowerCase(),
    };
  });
  return build("");
}

export function hasVariableSearchResults(config, query) {
  if (!query.trim()) return true;
  const term = query.trim().toLocaleLowerCase();
  return config.objects.some((item) => `${item.name} ${item.description} ${item.updateRule}`.toLocaleLowerCase().includes(term))
    || config.variables.some((item) => `${item.title} ${item.description} ${item.updateRule} ${item.type}`.toLocaleLowerCase().includes(term));
}

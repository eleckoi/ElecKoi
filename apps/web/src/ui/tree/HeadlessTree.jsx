import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  dragAndDropFeature,
  hotkeysCoreFeature,
  isOrderedDragTarget,
  keyboardDragAndDropFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { AssistiveTreeDescription, useTree } from "@headless-tree/react";
import "./headless-tree.css";
import { useTouchReorder } from './useTouchReorder.js';
import {
  HEADLESS_TREE_ROOT_ID,
  canDropAtHeadlessTarget,
  createHeadlessTreeIndex,
  expandedTreeIdsForSearch,
  resolveHeadlessTreeDrop,
  visibleTreeNodes,
} from "./headlessTreeModel.js";

const TREE_FEATURES = [
  syncDataLoaderFeature,
  selectionFeature,
  hotkeysCoreFeature,
  dragAndDropFeature,
  keyboardDragAndDropFeature,
];

const ROOT_DATA = Object.freeze({
  id: HEADLESS_TREE_ROOT_ID,
  label: "根目录",
  nodeKind: "root",
  fixed: false,
});

function resolvedValue(value, current) {
  return typeof value === "function" ? value(current) : value;
}

export function HeadlessTree({
  nodes,
  query = "",
  selectedId = "",
  expandedIds = [],
  indent = 18,
  ariaLabel,
  dragLineClassName,
  onSelectedIdChange,
  onExpandedIdsChange,
  onMove,
  renderItem,
  touchReorder = false,
  dragEnabled = true,
}) {
  const tUi = useProductTranslation();
  const nestedDropRef = useRef(null);
  const [nestedDrop, setNestedDrop] = useState(null);
  const expandedSignature = expandedIds.join("\u0000");
  const stableExpandedIds = useMemo(() => [...expandedIds], [expandedSignature]);
  const visibleNodes = useMemo(() => visibleTreeNodes(nodes, query), [nodes, query]);
  const index = useMemo(() => createHeadlessTreeIndex(visibleNodes), [visibleNodes]);
  const renderedExpandedIds = useMemo(
    () => expandedTreeIdsForSearch(visibleNodes, query, stableExpandedIds),
    [query, stableExpandedIds, visibleNodes],
  );

  const tree = useTree({
    rootItemId: HEADLESS_TREE_ROOT_ID,
    dataLoader: {
      getItem: (id) => id === HEADLESS_TREE_ROOT_ID ? ROOT_DATA : index.items.get(id) || { ...ROOT_DATA, id },
      getChildren: (id) => index.children.get(id) || [],
    },
    getItemName: (item) => item.getItemData().nodeKind === 'root'
      ? tUi(item.getItemData().label) : item.getItemData().label || tUi("未命名条目"),
    isItemFolder: (item) => ["group", "object", "root"].includes(item.getItemData().nodeKind),
    indent,
    canReorder: true,
    reorderAreaPercentage: 0.32,
    openOnDropDelay: 500,
    canDrag: (items) => dragEnabled && !query.trim() && items.length === 1 && !items[0].getItemData().fixed,
    canDrop: (items, target) => {
      const parent = target.item.getItemData();
      const siblings = target.item.getChildren().map((item) => item.getItemData());
      return canDropAtHeadlessTarget({
        query,
        draggedNodes: items.map((item) => item.getItemData()),
        parentNode: parent,
        insertionIndex: isOrderedDragTarget(target) ? target.insertionIndex : null,
        siblings,
      });
    },
    onDrop: (items, target) => {
      const siblings = target.item.getChildren().map((item) => item.getItemData());
      const drop = resolveHeadlessTreeDrop({
        dragIds: items.map((item) => item.getId()),
        parentId: target.item.getId(),
        insertionIndex: isOrderedDragTarget(target) ? target.insertionIndex : siblings.length,
        siblings,
        nestedParentId: nestedDropRef.current?.parentId || "",
      });
      nestedDropRef.current = null;
      setNestedDrop(null);
      if (drop.dragId) onMove?.(drop);
    },
    onPrimaryAction: () => {},
    state: {
      expandedItems: renderedExpandedIds,
      selectedItems: selectedId ? [selectedId] : [],
    },
    setExpandedItems: (next) => {
      if (query.trim()) return;
      onExpandedIdsChange?.(resolvedValue(next, stableExpandedIds));
    },
    setSelectedItems: (next) => {
      const ids = resolvedValue(next, selectedId ? [selectedId] : []);
      onSelectedIdChange?.(ids.at(-1) || "");
    },
    features: TREE_FEATURES,
  });

  useEffect(() => {
    tree.rebuildTree();
  }, [index, renderedExpandedIds, tree]);

  const dragLine = tree.getDragLineData();
  const isTreeDragging = Boolean(tree.getState().dnd?.draggedItems?.length);

  function updateNestedDrop(next) {
    const current = nestedDropRef.current;
    if (current?.parentId === next?.parentId && current?.top === next?.top && current?.left === next?.left) return;
    nestedDropRef.current = next;
    setNestedDrop(next);
  }

  function updateNestedDropFromPointer(clientX, clientY, rootTail = false) {
    const draggedIds = new Set(tree.getState().dnd?.draggedItems?.map((item) => item.getId()) || []);
    const target = rootTail ? { item: tree.getRootItem() } : tree.getDragTarget();
    const treeRect = tree.getElement()?.getBoundingClientRect();
    if (!target || !treeRect || (!rootTail && !isOrderedDragTarget(target))) {
      updateNestedDrop(null);
      return;
    }

    const siblings = target.item.getChildren().filter((item) => !draggedIds.has(item.getId()));
    const slot = isOrderedDragTarget(target)
      ? Math.max(0, Math.min(target.insertionIndex, siblings.length))
      : siblings.length;
    const previous = siblings[slot - 1];
    const data = previous?.getItemData();
    if (!previous?.isFolder() || data?.fixed || previous.getChildren().length) {
      updateNestedDrop(null);
      return;
    }

    const line = isOrderedDragTarget(target) ? tree.getDragLineData() : null;
    const previousRect = previous.getElement()?.getBoundingClientRect();
    const left = line
      ? line.left + indent
      : (previous.getItemMeta().level + 1) * indent;
    const top = line?.top ?? (previousRect ? previousRect.bottom - treeRect.top : 0);
    const insideTailBand = !rootTail || (previousRect && clientY >= previousRect.bottom - 5 && clientY <= previousRect.bottom + 30);
    if (!insideTailBand || clientX < treeRect.left + left) {
      updateNestedDrop(null);
      return;
    }

    updateNestedDrop({ parentId: previous.getId(), top, left });
  }

  useEffect(() => {
    if (!isTreeDragging && nestedDropRef.current) updateNestedDrop(null);
  }, [isTreeDragging]);

  const touch = useTouchReorder({ enabled: touchReorder && dragEnabled && !query.trim(), onSelect: onSelectedIdChange, onMove });

  const generatedContainerProps = tree.getContainerProps(ariaLabel);
  const { onDragOver: generatedContainerDragOver, ...containerProps } = generatedContainerProps;
  const visualDragLine = nestedDrop || dragLine;

  return (
    <div
      {...containerProps}
      {...touch.handlers}
      className="headless-tree-surface"
      onDragOver={(event) => {
        generatedContainerDragOver?.(event);
        updateNestedDropFromPointer(event.clientX, event.clientY, true);
      }}
    >
      {tree.getItems().map((item) => {
        const generatedProps = item.getProps();
        const { onClick: _generatedClick, onDragOver: generatedItemDragOver, ...itemProps } = generatedProps;
        const data = item.getItemData();
        const meta = item.getItemMeta();
        const parent = item.getParent();
        return renderItem({
          key: item.getKey(),
          item,
          data,
          level: meta.level,
          isSelected: item.isSelected(),
          isExpanded: item.isExpanded(),
          isDropTarget: item.isUnorderedDragTarget(),
          isDragging: touch.preview?.dragId === item.getId() || Boolean(tree.getState().dnd?.draggedItems?.some((dragged) => dragged.getId() === item.getId())),
          itemProps: {
            ...itemProps,
            'data-reorder-id': item.getId(),
            'data-reorder-parent': parent.getId() === HEADLESS_TREE_ROOT_ID ? '' : parent.getId(),
            'data-reorder-fixed': String(Boolean(data.fixed)),
            'data-reorder-target': touch.preview?.targetId === item.getId() ? (touch.preview.after ? 'after' : 'before') : undefined,
            draggable: dragEnabled && !query.trim() && !data.fixed,
            onDragOver: (event) => {
              generatedItemDragOver?.(event);
              updateNestedDropFromPointer(event.clientX, event.clientY);
            },
            onClick: (event) => {
              event.stopPropagation();
              item.setFocused();
              tree.setSelectedItems([item.getId()]);
            },
          },
          style: { paddingLeft: meta.level * indent },
        });
      })}
      {visualDragLine ? (
        <div
          className={`headless-tree-drop-cursor${dragLineClassName ? ` ${dragLineClassName}` : ""}`}
          style={{
            top: visualDragLine.top - 1,
            "--tree-drop-left": `${visualDragLine.left}px`,
          }}
          aria-hidden="true"
        ><span /></div>
      ) : null}
      <AssistiveTreeDescription tree={tree} />
    </div>
  );
}

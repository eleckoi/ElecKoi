package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.lazy.LazyListItemInfo
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isPinnedEntry

@Stable
internal class SettingTreeInternalReorderState(
    private val listState: LazyListState,
    private var nodes: List<SettingTreeNode>,
    private var entries: List<SettingLibraryEntry>,
    private var groups: List<SettingLibraryGroup>,
    private var enabled: Boolean,
    private var onTreeChange: (List<SettingLibraryEntry>, List<SettingLibraryGroup>) -> Unit,
    private val onDragStarted: () -> Unit,
    private val onDragHaptic: () -> Unit,
    private var onFolderDragStarted: (String) -> Unit,
    private var onDragStopped: () -> Unit,
    private var itemKeyPrefix: String,
) {
    var draggingNodeId by mutableStateOf<String?>(null)
        private set

    private var pointerY by mutableFloatStateOf(0f)
    private var grabOffsetY by mutableFloatStateOf(0f)
    private var draggedItemHeight by mutableFloatStateOf(0f)
    private var activeTarget by mutableStateOf<InternalDropTarget?>(null)
    private var predictedDraggingTop by mutableStateOf<Float?>(null)
    private var locallyCollapsedNodeId by mutableStateOf<String?>(null)

    fun updateInputs(
        nodes: List<SettingTreeNode>,
        entries: List<SettingLibraryEntry>,
        groups: List<SettingLibraryGroup>,
        enabled: Boolean,
        onTreeChange: (List<SettingLibraryEntry>, List<SettingLibraryGroup>) -> Unit,
        onFolderDragStarted: (String) -> Unit,
        onDragStopped: () -> Unit,
        itemKeyPrefix: String,
    ) {
        this.nodes = nodes
        this.entries = entries
        this.groups = groups
        this.enabled = enabled
        this.onTreeChange = onTreeChange
        this.onFolderDragStarted = onFolderDragStarted
        this.onDragStopped = onDragStopped
        this.itemKeyPrefix = itemKeyPrefix
    }

    fun isDragging(node: SettingTreeNode): Boolean = draggingNodeId == node.id

    fun displayNodes(): List<SettingTreeNode> {
        val collapsedNodeId = locallyCollapsedNodeId ?: return nodes
        return nodes.withoutNodeDescendants(collapsedNodeId)
    }

    fun dragOffsetY(node: SettingTreeNode): Float {
        if (!isDragging(node)) return 0f
        val sourceTop = predictedDraggingTop ?: visibleItem(node.id)?.offset?.toFloat() ?: return 0f
        return pointerY - grabOffsetY - sourceTop
    }

    fun dragModifier(node: SettingTreeNode): Modifier {
        if (!enabled || !node.canReorderInternally()) return Modifier
        return Modifier.pointerInput(enabled, node.id) {
            detectDragGesturesAfterLongPress(
                onDragStart = { offset ->
                    val item = visibleItem(node.id) ?: return@detectDragGesturesAfterLongPress
                    draggingNodeId = node.id
                    pointerY = item.offset + offset.y
                    grabOffsetY = offset.y
                    draggedItemHeight = item.size.toFloat()
                    activeTarget = null
                    predictedDraggingTop = null
                    if (node is SettingTreeNode.Folder) {
                        locallyCollapsedNodeId = node.id
                        onFolderDragStarted(node.group.id)
                    }
                    onDragStarted()
                },
                onDrag = { change, dragAmount ->
                    if (draggingNodeId == node.id) {
                        change.consume()
                        pointerY += dragAmount.y
                        val nextTarget = internalDropTarget(node)
                        if (nextTarget != null && nextTarget != activeTarget && moveInternally(node, nextTarget)) {
                            activeTarget = nextTarget
                            onDragHaptic()
                        }
                    }
                },
                onDragEnd = {
                    clearDrag()
                },
                onDragCancel = ::clearDrag,
            )
        }
    }

    private fun clearDrag() {
        val hadDrag = draggingNodeId != null
        draggingNodeId = null
        pointerY = 0f
        grabOffsetY = 0f
        draggedItemHeight = 0f
        activeTarget = null
        predictedDraggingTop = null
        locallyCollapsedNodeId = null
        if (hadDrag) {
            onDragStopped()
        }
    }

    private fun visibleItem(nodeId: String): LazyListItemInfo? {
        val itemKey = settingTreeLazyItemKey(nodeId, itemKeyPrefix)
        return listState.layoutInfo.visibleItemsInfo.firstOrNull { it.key == itemKey }
    }

    private fun moveInternally(source: SettingTreeNode, target: InternalDropTarget): Boolean {
        val sourceItem = visibleItem(source.id) ?: return false
        val targetItem = visibleItem(target.node.id) ?: return false
        val result = moveSettingNodeInTree(
            entries = entries,
            groups = groups,
            sourceId = source.id,
            targetId = target.node.id,
            placement = target.placement,
        ) ?: return false
        predictedDraggingTop = predictedDraggingTop(sourceItem, targetItem, target)
        onTreeChange(result.entries, result.groups)
        return true
    }

    private fun internalDropTarget(source: SettingTreeNode): InternalDropTarget? {
        val dragTop = pointerY - grabOffsetY
        val dragBottom = dragTop + draggedItemHeight
        val displayNodes = displayNodes()
        val movedDown = dragTop > (predictedDraggingTop ?: visibleItem(source.id)?.offset?.toFloat() ?: dragTop)
        val candidates = listState.layoutInfo.visibleItemsInfo.mapNotNull { item ->
            val id = settingTreeNodeIdFromLazyItemKey(item.key, itemKeyPrefix) ?: return@mapNotNull null
            if (id == source.id) return@mapNotNull null
            val node = displayNodes.firstOrNull { it.id == id } ?: return@mapNotNull null
            if (!sameInternalSortScope(source, node)) return@mapNotNull null
            val placement = if (movedDown) SettingTreeDropPlacement.After else SettingTreeDropPlacement.Before
            if (!canMoveSettingNodeInTree(entries, groups, source.id, node.id, placement)) return@mapNotNull null
            InternalDropTarget(node, placement) to item
        }
        if (candidates.isEmpty()) return null
        val sourceIndex = displayNodes.indexOfFirst { it.id == source.id }
        val directionalCandidates = candidates.filter { (target, item) ->
            val targetIndex = displayNodes.indexOfFirst { it.id == target.node.id }
            when {
                movedDown -> targetIndex > sourceIndex && targetIndex >= 0 && item.offset + item.size / 2f in dragTop..dragBottom
                else -> targetIndex < sourceIndex && targetIndex >= 0 && item.offset + item.size / 2f in dragTop..dragBottom
            }
        }
        if (directionalCandidates.isEmpty()) return null
        val (target, _) = if (movedDown) {
            directionalCandidates.first()
        } else {
            directionalCandidates.last()
        }
        return target
    }

    private fun predictedDraggingTop(
        sourceItem: LazyListItemInfo,
        targetItem: LazyListItemInfo,
        target: InternalDropTarget,
    ): Float {
        return if (targetItem.index > sourceItem.index) {
            targetBlockBottom(target.node, targetItem) - draggedItemHeight
        } else {
            targetItem.offset.toFloat()
        }
    }

    private fun targetBlockBottom(targetNode: SettingTreeNode, targetItem: LazyListItemInfo): Float {
        val displayNodes = displayNodes()
        val targetIndex = displayNodes.indexOfFirst { it.id == targetNode.id }
        if (targetIndex < 0) return (targetItem.offset + targetItem.size).toFloat()
        if (displayNodes.getOrNull(targetIndex + 1)?.depth?.let { it > targetNode.depth } != true) {
            return (targetItem.offset + targetItem.size).toFloat()
        }
        val targetDepth = displayNodes[targetIndex].depth
        val nextSiblingOrAncestorIndex = (targetIndex + 1 until displayNodes.size)
            .firstOrNull { index -> displayNodes[index].depth <= targetDepth }
            ?: displayNodes.size
        val lastBlockNode = displayNodes.getOrNull(nextSiblingOrAncestorIndex - 1)
            ?: return (targetItem.offset + targetItem.size).toFloat()
        val lastItem = visibleItem(lastBlockNode.id) ?: return (targetItem.offset + targetItem.size).toFloat()
        return (lastItem.offset + lastItem.size).toFloat()
    }
}

@Composable
internal fun rememberSettingTreeInternalReorderState(
    listState: LazyListState,
    nodes: List<SettingTreeNode>,
    entries: List<SettingLibraryEntry>,
    groups: List<SettingLibraryGroup>,
    enabled: Boolean,
    onTreeChange: (List<SettingLibraryEntry>, List<SettingLibraryGroup>) -> Unit,
    onFolderDragStarted: (String) -> Unit = {},
    onDragStopped: () -> Unit = {},
    itemKeyPrefix: String = "",
): SettingTreeInternalReorderState {
    val haptic = LocalHapticFeedback.current
    val state = remember(listState) {
        SettingTreeInternalReorderState(
            listState = listState,
            nodes = nodes,
            entries = entries,
            groups = groups,
            enabled = enabled,
            onTreeChange = onTreeChange,
            onDragStarted = { haptic.performHapticFeedback(HapticFeedbackType.LongPress) },
            onDragHaptic = { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) },
            onFolderDragStarted = onFolderDragStarted,
            onDragStopped = onDragStopped,
            itemKeyPrefix = itemKeyPrefix,
        )
    }
    state.updateInputs(
        nodes = nodes,
        entries = entries,
        groups = groups,
        enabled = enabled,
        onTreeChange = onTreeChange,
        onFolderDragStarted = onFolderDragStarted,
        onDragStopped = onDragStopped,
        itemKeyPrefix = itemKeyPrefix,
    )
    return state
}

private data class InternalDropTarget(
    val node: SettingTreeNode,
    val placement: SettingTreeDropPlacement,
)

private fun SettingTreeNode.canReorderInternally(): Boolean {
    return this !is SettingTreeNode.File || !entry.isPinnedEntry()
}

private fun sameInternalSortScope(source: SettingTreeNode, target: SettingTreeNode): Boolean {
    return source.treeParentId == target.treeParentId
}

private val SettingTreeNode.treeParentId: String
    get() = when (this) {
        is SettingTreeNode.File -> entry.groupId
        is SettingTreeNode.Folder -> group.parentId
    }

private fun List<SettingTreeNode>.withoutNodeDescendants(nodeId: String): List<SettingTreeNode> {
    val nodeIndex = indexOfFirst { it.id == nodeId }
    if (nodeIndex < 0) return this
    val nodeDepth = this[nodeIndex].depth
    val nextSiblingOrAncestorIndex = (nodeIndex + 1 until size)
        .firstOrNull { index -> this[index].depth <= nodeDepth }
        ?: size
    return filterIndexed { index, _ ->
        index <= nodeIndex || index >= nextSiblingOrAncestorIndex
    }
}

internal fun settingTreeLazyItemKey(nodeId: String, prefix: String): String = "$prefix$nodeId"

internal fun settingTreeNodeIdFromLazyItemKey(key: Any?, prefix: String): String? {
    val stringKey = key as? String ?: return null
    if (!stringKey.startsWith(prefix)) return null
    return stringKey.removePrefix(prefix).takeIf(String::isNotEmpty)
}

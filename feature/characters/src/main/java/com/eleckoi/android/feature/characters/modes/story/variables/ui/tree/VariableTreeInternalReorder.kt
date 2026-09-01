package com.eleckoi.android.feature.characters.modes.story.variables.ui

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
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.isInitializationObject

@Stable
internal class VariableTreeInternalReorderState(
    private val listState: LazyListState,
    private var nodes: List<VariableTreeNode>,
    private var variables: List<VariableItemConfig>,
    private var objects: List<VariableObjectConfig>,
    private var enabled: Boolean,
    private var onTreeChange: (List<VariableItemConfig>, List<VariableObjectConfig>) -> Unit,
    private val onDragStarted: () -> Unit,
    private val onDragHaptic: () -> Unit,
    private var onObjectDragStarted: (String) -> Unit,
    private var onDragStopped: () -> Unit,
) {
    var draggingNodeId by mutableStateOf<String?>(null)
        private set

    private var pointerY by mutableFloatStateOf(0f)
    private var grabOffsetY by mutableFloatStateOf(0f)
    private var draggedItemHeight by mutableFloatStateOf(0f)
    private var activeTarget by mutableStateOf<InternalVariableDropTarget?>(null)
    private var predictedDraggingTop by mutableStateOf<Float?>(null)
    private var locallyCollapsedObjectId by mutableStateOf<String?>(null)

    fun updateInputs(
        nodes: List<VariableTreeNode>,
        variables: List<VariableItemConfig>,
        objects: List<VariableObjectConfig>,
        enabled: Boolean,
        onTreeChange: (List<VariableItemConfig>, List<VariableObjectConfig>) -> Unit,
        onObjectDragStarted: (String) -> Unit,
        onDragStopped: () -> Unit,
    ) {
        this.nodes = nodes
        this.variables = variables
        this.objects = objects
        this.enabled = enabled
        this.onTreeChange = onTreeChange
        this.onObjectDragStarted = onObjectDragStarted
        this.onDragStopped = onDragStopped
    }

    fun isDragging(node: VariableTreeNode): Boolean = draggingNodeId == node.id

    fun displayNodes(): List<VariableTreeNode> {
        val collapsedObjectId = locallyCollapsedObjectId ?: return nodes
        return nodes.withoutObjectDescendants(collapsedObjectId)
    }

    fun dragOffsetY(node: VariableTreeNode): Float {
        if (!isDragging(node)) return 0f
        val sourceTop = predictedDraggingTop ?: visibleItem(node.id)?.offset?.toFloat() ?: return 0f
        return pointerY - grabOffsetY - sourceTop
    }

    fun dragModifier(node: VariableTreeNode): Modifier {
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
                    if (node is VariableTreeNode.ObjectNode) {
                        locallyCollapsedObjectId = node.variableObject.id
                        onObjectDragStarted(node.variableObject.id)
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
                onDragEnd = { clearDrag() },
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
        locallyCollapsedObjectId = null
        if (hadDrag) onDragStopped()
    }

    private fun visibleItem(nodeId: String): LazyListItemInfo? {
        return listState.layoutInfo.visibleItemsInfo.firstOrNull { it.key == nodeId }
    }

    private fun moveInternally(source: VariableTreeNode, target: InternalVariableDropTarget): Boolean {
        val sourceItem = visibleItem(source.id) ?: return false
        val targetItem = visibleItem(target.node.id) ?: return false
        val result = moveVariableNodeInTree(
            variables = variables,
            objects = objects,
            sourceId = source.id,
            targetId = target.node.id,
            placement = target.placement,
        ) ?: return false
        predictedDraggingTop = predictedDraggingTop(sourceItem, targetItem, target)
        onTreeChange(result.variables, result.objects)
        return true
    }

    private fun internalDropTarget(source: VariableTreeNode): InternalVariableDropTarget? {
        val dragTop = pointerY - grabOffsetY
        val dragBottom = dragTop + draggedItemHeight
        val displayNodes = displayNodes()
        val movedDown = dragTop > (predictedDraggingTop ?: visibleItem(source.id)?.offset?.toFloat() ?: dragTop)
        val candidates = listState.layoutInfo.visibleItemsInfo.mapNotNull { item ->
            val id = item.key as? String ?: return@mapNotNull null
            if (id == source.id) return@mapNotNull null
            val node = displayNodes.firstOrNull { it.id == id } ?: return@mapNotNull null
            if (!sameInternalSortScope(source, node)) return@mapNotNull null
            val placement = if (movedDown) VariableTreeDropPlacement.After else VariableTreeDropPlacement.Before
            if (!canMoveVariableNodeInTree(variables, objects, source.id, node.id, placement)) return@mapNotNull null
            InternalVariableDropTarget(node, placement) to item
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
        val (target, _) = if (movedDown) directionalCandidates.first() else directionalCandidates.last()
        return target
    }

    private fun predictedDraggingTop(
        sourceItem: LazyListItemInfo,
        targetItem: LazyListItemInfo,
        target: InternalVariableDropTarget,
    ): Float {
        return if (targetItem.index > sourceItem.index) {
            targetBlockBottom(target.node, targetItem) - draggedItemHeight
        } else {
            targetItem.offset.toFloat()
        }
    }

    private fun targetBlockBottom(targetNode: VariableTreeNode, targetItem: LazyListItemInfo): Float {
        if (targetNode !is VariableTreeNode.ObjectNode) {
            return (targetItem.offset + targetItem.size).toFloat()
        }
        val displayNodes = displayNodes()
        val targetIndex = displayNodes.indexOfFirst { it.id == targetNode.id }
        if (targetIndex < 0) return (targetItem.offset + targetItem.size).toFloat()
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
internal fun rememberVariableTreeInternalReorderState(
    listState: LazyListState,
    nodes: List<VariableTreeNode>,
    variables: List<VariableItemConfig>,
    objects: List<VariableObjectConfig>,
    enabled: Boolean,
    onTreeChange: (List<VariableItemConfig>, List<VariableObjectConfig>) -> Unit,
    onObjectDragStarted: (String) -> Unit = {},
    onDragStopped: () -> Unit = {},
): VariableTreeInternalReorderState {
    val haptic = LocalHapticFeedback.current
    val state = remember(listState) {
        VariableTreeInternalReorderState(
            listState = listState,
            nodes = nodes,
            variables = variables,
            objects = objects,
            enabled = enabled,
            onTreeChange = onTreeChange,
            onDragStarted = { haptic.performHapticFeedback(HapticFeedbackType.LongPress) },
            onDragHaptic = { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) },
            onObjectDragStarted = onObjectDragStarted,
            onDragStopped = onDragStopped,
        )
    }
    state.updateInputs(
        nodes = nodes,
        variables = variables,
        objects = objects,
        enabled = enabled,
        onTreeChange = onTreeChange,
        onObjectDragStarted = onObjectDragStarted,
        onDragStopped = onDragStopped,
    )
    return state
}

private data class InternalVariableDropTarget(
    val node: VariableTreeNode,
    val placement: VariableTreeDropPlacement,
)

private fun VariableTreeNode.canReorderInternally(): Boolean {
    return when (this) {
        is VariableTreeNode.ObjectNode -> !variableObject.isInitializationObject()
        is VariableTreeNode.VariableNode -> true
    }
}

private fun sameInternalSortScope(source: VariableTreeNode, target: VariableTreeNode): Boolean {
    return source.treeParentId == target.treeParentId
}

private val VariableTreeNode.treeParentId: String
    get() = when (this) {
        is VariableTreeNode.ObjectNode -> variableObject.parentId
        is VariableTreeNode.VariableNode -> variable.objectId
    }

private fun List<VariableTreeNode>.withoutObjectDescendants(objectId: String): List<VariableTreeNode> {
    val objectNodeId = variableObjectNodeId(objectId)
    val objectIndex = indexOfFirst { it.id == objectNodeId }
    if (objectIndex < 0) return this
    val objectDepth = this[objectIndex].depth
    val firstAfterObject = (objectIndex + 1 until size)
        .firstOrNull { index -> this[index].depth <= objectDepth }
        ?: size
    return filterIndexed { index, _ -> index <= objectIndex || index >= firstAfterObject }
}

package com.eleckoi.android.feature.characters.modes.story.variables.ui

import com.eleckoi.android.engine.story.variables.model.VariableInitializationObjectId
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.isInitializationObject

internal data class VariableTreeMixedMoveResult(
    val variables: List<VariableItemConfig>,
    val objects: List<VariableObjectConfig>,
)

internal enum class VariableTreeDropPlacement {
    Before,
    After,
}

internal fun canMoveVariableNodeInTree(
    variables: List<VariableItemConfig>,
    objects: List<VariableObjectConfig>,
    sourceId: String,
    targetId: String,
    placement: VariableTreeDropPlacement,
): Boolean {
    return variableTreeMovePlan(variables, objects, sourceId, targetId, placement) != null
}

internal fun moveVariableNodeInTree(
    variables: List<VariableItemConfig>,
    objects: List<VariableObjectConfig>,
    sourceId: String,
    targetId: String,
    placement: VariableTreeDropPlacement,
): VariableTreeMixedMoveResult? {
    val plan = variableTreeMovePlan(variables, objects, sourceId, targetId, placement) ?: return null
    val targetSiblings = orderedVariableNodeIdsForParent(
        parentId = plan.parentId,
        variables = variables,
        objects = objects,
    ).filterNot { it == sourceId }
    val targetIndex = targetSiblings.indexOf(targetId)
    if (targetIndex < 0) return null
    val insertIndex = targetIndex + if (plan.placement == VariableTreeDropPlacement.After) 1 else 0
    val targetOrder = targetSiblings.toMutableList().apply {
        add(insertIndex.coerceIn(0, size), sourceId)
    }
    return applyVariableTreeOrder(
        variables = variables,
        objects = objects,
        orderedIds = targetOrder,
    )
}

private data class VariableTreeMovePlan(
    val parentId: String,
    val placement: VariableTreeDropPlacement,
)

private sealed interface VariableMoveNode {
    val nodeId: String

    data class Variable(val variable: VariableItemConfig) : VariableMoveNode {
        override val nodeId: String = variableItemNodeId(variable.id)
    }

    data class ObjectNode(val variableObject: VariableObjectConfig) : VariableMoveNode {
        override val nodeId: String = variableObjectNodeId(variableObject.id)
    }
}

private fun variableTreeMovePlan(
    variables: List<VariableItemConfig>,
    objects: List<VariableObjectConfig>,
    sourceId: String,
    targetId: String,
    placement: VariableTreeDropPlacement,
): VariableTreeMovePlan? {
    if (sourceId == targetId) return null
    val source = variableMoveNode(sourceId, variables, objects) ?: return null
    val target = variableMoveNode(targetId, variables, objects) ?: return null
    if (!source.canReorderInternally() || !target.canReorderInternally()) return null
    if (source.parentId != target.parentId) return null
    return VariableTreeMovePlan(parentId = source.parentId, placement = placement)
}

private fun variableMoveNode(
    nodeId: String,
    variables: List<VariableItemConfig>,
    objects: List<VariableObjectConfig>,
): VariableMoveNode? {
    nodeId.removePrefixOrNull("variable:")?.let { variableId ->
        return variables.firstOrNull { it.id == variableId }?.let(VariableMoveNode::Variable)
    }
    nodeId.removePrefixOrNull("object:")?.let { objectId ->
        return objects.firstOrNull { it.id == objectId }?.let(VariableMoveNode::ObjectNode)
    }
    return null
}

private fun orderedVariableNodeIdsForParent(
    parentId: String,
    variables: List<VariableItemConfig>,
    objects: List<VariableObjectConfig>,
): List<String> {
    val objectNodes = objects
        .filter { variableObject -> variableObject.parentId == parentId }
        .map { variableObject ->
            OrderedVariableTreeNode(
                id = variableObjectNodeId(variableObject.id),
                order = if (variableObject.id == VariableInitializationObjectId) Int.MIN_VALUE else variableObject.treeViewOrder,
                kindOrder = 0,
            )
        }
    val variableNodes = variables
        .filter { variable -> variable.objectId == parentId }
        .map { variable ->
            OrderedVariableTreeNode(
                id = variableItemNodeId(variable.id),
                order = variable.treeViewOrder,
                kindOrder = 1,
            )
        }
    return (objectNodes + variableNodes)
        .sortedWith(compareBy<OrderedVariableTreeNode> { it.order }.thenBy { it.kindOrder })
        .map { it.id }
}

private fun applyVariableTreeOrder(
    variables: List<VariableItemConfig>,
    objects: List<VariableObjectConfig>,
    orderedIds: List<String>,
): VariableTreeMixedMoveResult {
    val orderById = orderedIds.mapIndexed { index, nodeId -> nodeId to (index + 1) }.toMap()
    val nextVariables = variables.map { variable ->
        val order = orderById[variableItemNodeId(variable.id)]
        if (order == null) variable else variable.copy(treeViewOrder = order)
    }
    val nextObjects = objects.map { variableObject ->
        val order = orderById[variableObjectNodeId(variableObject.id)]
        if (order == null || variableObject.isInitializationObject()) variableObject else variableObject.copy(treeViewOrder = order)
    }
    return VariableTreeMixedMoveResult(variables = nextVariables, objects = nextObjects)
}

private data class OrderedVariableTreeNode(
    val id: String,
    val order: Int,
    val kindOrder: Int,
)

private val VariableMoveNode.parentId: String
    get() = when (this) {
        is VariableMoveNode.Variable -> variable.objectId
        is VariableMoveNode.ObjectNode -> variableObject.parentId
    }

private fun VariableMoveNode.canReorderInternally(): Boolean {
    return when (this) {
        is VariableMoveNode.Variable -> variable.objectId != VariableInitializationObjectId
        is VariableMoveNode.ObjectNode -> !variableObject.isInitializationObject()
    }
}

private fun String.removePrefixOrNull(prefix: String): String? {
    return if (startsWith(prefix)) removePrefix(prefix) else null
}

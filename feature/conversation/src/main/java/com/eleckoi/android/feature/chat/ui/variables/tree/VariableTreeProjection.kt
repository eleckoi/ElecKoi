package com.eleckoi.android.feature.chat.ui.variables

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

internal data class VariableTreeDisplayRow(
    val path: String,
    val name: String,
    val breadcrumb: List<String>,
    val depth: Int,
    val value: JsonElement,
    val container: Boolean,
    val expanded: Boolean,
    val opensFocusedSubtree: Boolean,
    val changed: Boolean,
    val hasInlineChildren: Boolean,
    val ancestorPaths: List<String>,
    val guides: List<VariableTreeGuide>,
)

internal data class VariableTreeGuide(
    val above: Boolean,
    val below: Boolean,
)

internal fun flattenVariableTree(
    root: JsonElement,
    basePath: String,
    baseBreadcrumb: List<String>,
    expandedPaths: Map<String, Boolean>,
    visiblePaths: Set<String>?,
    changedPaths: Set<String>,
): List<VariableTreeDisplayRow> {
    val rows = buildList {
        appendVariableChildren(
            parent = root,
            parentPath = basePath,
            parentBreadcrumb = baseBreadcrumb,
            depth = 0,
            ancestorPaths = emptyList(),
            expandedPaths = expandedPaths,
            visiblePaths = visiblePaths,
            changedPaths = changedPaths,
        )
    }
    val firstChildIndex = mutableMapOf<String, Int>()
    val lastChildIndex = mutableMapOf<String, Int>()
    rows.forEachIndexed { index, row ->
        row.ancestorPaths.forEachIndexed { level, ancestorPath ->
            if (row.depth == level + 1) {
                firstChildIndex.putIfAbsent(ancestorPath, index)
                lastChildIndex[ancestorPath] = index
            }
        }
    }
    return rows.mapIndexed { index, row ->
        row.copy(
            guides = row.ancestorPaths.map { ancestorPath ->
                val first = firstChildIndex.getValue(ancestorPath)
                val last = lastChildIndex.getValue(ancestorPath)
                VariableTreeGuide(
                    above = index > first && index <= last,
                    below = index >= first && index < last,
                )
            },
        )
    }
}

private fun MutableList<VariableTreeDisplayRow>.appendVariableChildren(
    parent: JsonElement,
    parentPath: String,
    parentBreadcrumb: List<String>,
    depth: Int,
    ancestorPaths: List<String>,
    expandedPaths: Map<String, Boolean>,
    visiblePaths: Set<String>?,
    changedPaths: Set<String>,
) {
    val children = when (parent) {
        is JsonObject -> parent.entries.map { (key, value) ->
            VariableChild(
                name = key,
                path = variablePath(parentPath, key),
                value = value,
            )
        }
        else -> emptyList()
    }.filter { child -> visiblePaths == null || visiblePaths.any { it.isAtOrBelow(child.path) } }

    children.forEach { child ->
        val container = child.value.isVariableContainer()
        val opensFocusedSubtree = container && depth >= InlineTreeDepth - 1
        val expanded = container && !opensFocusedSubtree && expandedPaths[child.path] == true
        val breadcrumb = parentBreadcrumb + child.name
        add(
            VariableTreeDisplayRow(
                path = child.path,
                name = child.name,
                breadcrumb = breadcrumb,
                depth = depth,
                value = child.value,
                container = container,
                expanded = expanded,
                opensFocusedSubtree = opensFocusedSubtree,
                changed = !container && child.path in changedPaths,
                hasInlineChildren = expanded && child.value.hasVisibleVariableChildren(
                    parentPath = child.path,
                    visiblePaths = visiblePaths,
                ),
                ancestorPaths = ancestorPaths,
                guides = emptyList(),
            ),
        )
        if (expanded) {
            appendVariableChildren(
                parent = child.value,
                parentPath = child.path,
                parentBreadcrumb = breadcrumb,
                depth = depth + 1,
                ancestorPaths = ancestorPaths + child.path,
                expandedPaths = expandedPaths,
                visiblePaths = visiblePaths,
                changedPaths = changedPaths,
            )
        }
    }
}

private data class VariableChild(
    val name: String,
    val path: String,
    val value: JsonElement,
)

private fun JsonElement.hasVisibleVariableChildren(
    parentPath: String,
    visiblePaths: Set<String>?,
): Boolean = when (this) {
    is JsonObject -> entries.any { (key, _) ->
        val childPath = variablePath(parentPath, key)
        visiblePaths == null || visiblePaths.any { it.isAtOrBelow(childPath) }
    }
    else -> false
}

private fun String.isAtOrBelow(parentPath: String): Boolean =
    this == parentPath || startsWith("$parentPath/")

private const val InlineTreeDepth = 3

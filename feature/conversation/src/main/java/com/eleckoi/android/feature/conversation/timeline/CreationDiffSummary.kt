package com.eleckoi.android.feature.conversation.timeline

import com.eleckoi.android.engine.agent.api.AgentFileChange
import com.eleckoi.android.engine.agent.api.AgentFileChangeKind
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem

data class CreationFileDiffStat(
    val path: String,
    val additions: Int,
    val deletions: Int,
    val countsKnown: Boolean = true,
)

data class CreationFileSummary(
    val diff: String,
    val stats: List<CreationFileDiffStat>,
)

/**
 * The Harness tracks structured patch deltas, but deliberately does not guess what an arbitrary shell command
 * changed. Reconcile the safe, provable net-zero case against the final workspace: `/dev/null` in
 * the tracked baseline plus a missing final path means the temporary addition left no result.
 */
fun reconcileCreationTurnDiffWithWorkspaceSnapshot(
    diff: String,
    afterPaths: List<String>,
): String {
    if (!diff.isUnifiedCreationDiff()) return diff
    val after = normalizeCreationWorkspacePaths(afterPaths).toSet()
    val sections = UnifiedDiffSectionBoundary.split(diff).filter(String::isNotEmpty)
    var removedSection = false
    val remaining = sections.filterNot { section ->
        val oldHeader = section.lineSequence()
            .firstOrNull { it.startsWith("--- ") }
            ?.removePrefix("--- ")
            ?.substringBefore('\t')
            ?.trim()
            .orEmpty()
        val newHeader = section.lineSequence()
            .firstOrNull { it.startsWith("+++ ") }
            ?.removePrefix("+++ ")
            ?.substringBefore('\t')
            ?.trim()
            .orEmpty()
        val addedPath = newHeader
            .takeIf { oldHeader == "/dev/null" && it != "/dev/null" }
            ?.removeDiffPrefix()
            .orEmpty()
        // `--- /dev/null` already proves that the tracked baseline did not contain this file.
        val canceledAdd = addedPath.isNotBlank() && addedPath !in after
        if (canceledAdd) removedSection = true
        canceledAdd
    }
    if (!removedSection) return diff
    return remaining.joinToString(separator = "").trimEnd()
}

/** Uses the authoritative latest turn diff once the Harness has emitted one, including an empty reset. */
fun creationFinalFileSummary(
    turnDiff: String,
    turnDiffObserved: Boolean,
    turnPaths: List<String>,
    fileItems: List<CreationTimelineItem>,
    finalWorkspacePaths: List<String>? = null,
): CreationFileSummary {
    val diff = if (turnDiffObserved) {
        finalWorkspacePaths?.let { paths ->
            reconcileCreationTurnDiffWithWorkspaceSnapshot(turnDiff, paths)
        } ?: turnDiff
    } else {
        turnDiff.ifBlank { fileItems.lastOrNull { it.diff.isNotBlank() }?.diff.orEmpty() }
    }
    val stats = if (turnDiffObserved && diff.isBlank()) {
        emptyList()
    } else {
        creationFileDiffStats(
            diff = diff,
            fallbackPaths = (turnPaths + fileItems.flatMap(CreationTimelineItem::paths)).distinct(),
        )
    }
    return CreationFileSummary(diff = diff, stats = stats)
}

/** Small unified-diff projection used only for the final result summary. */
fun creationFileDiffStats(
    diff: String,
    fallbackPaths: List<String> = emptyList(),
): List<CreationFileDiffStat> {
    val normalizedFallbackPaths = normalizeCreationWorkspacePaths(fallbackPaths)
    if (!diff.isUnifiedCreationDiff()) {
        return normalizedFallbackPaths.map {
            CreationFileDiffStat(it, additions = 0, deletions = 0, countsKnown = false)
        }
    }

    data class MutableStat(
        var path: String = "",
        var additions: Int = 0,
        var deletions: Int = 0,
    )

    val completed = mutableListOf<MutableStat>()
    var current: MutableStat? = null

    fun flush() {
        current?.takeIf { it.path.isNotBlank() }?.let(completed::add)
        current = null
    }

    diff.lineSequence().forEach { line ->
        when {
            line.startsWith("diff --git ") -> {
                flush()
                val parts = line.removePrefix("diff --git ").split(' ', limit = 2)
                val preferred = parts.getOrNull(1).orEmpty().removeDiffPrefix()
                val fallback = parts.firstOrNull().orEmpty().removeDiffPrefix()
                current = MutableStat(path = preferred.ifBlank { fallback })
            }
            line.startsWith("+++ ") -> {
                val path = line.removePrefix("+++ ").substringBefore('\t').trim().removeDiffPrefix()
                if (path != "/dev/null" && path.isNotBlank()) {
                    val target = current ?: MutableStat().also { current = it }
                    target.path = path
                }
            }
            line.startsWith("--- ") -> {
                val path = line.removePrefix("--- ").substringBefore('\t').trim().removeDiffPrefix()
                if (path != "/dev/null" && path.isNotBlank() && current?.path.isNullOrBlank()) {
                    val target = current ?: MutableStat().also { current = it }
                    target.path = path
                }
            }
            line.startsWith("+") && !line.startsWith("+++") -> {
                (current ?: MutableStat(path = normalizedFallbackPaths.firstOrNull().orEmpty()).also {
                    current = it
                }).additions++
            }
            line.startsWith("-") && !line.startsWith("---") -> {
                (current ?: MutableStat(path = normalizedFallbackPaths.firstOrNull().orEmpty()).also {
                    current = it
                }).deletions++
            }
        }
    }
    flush()

    val merged = linkedMapOf<String, CreationFileDiffStat>()
    completed.forEach { stat ->
        val path = normalizeCreationWorkspacePath(stat.path)
        if (path.isBlank()) return@forEach
        val prior = merged[path]
        merged[path] = CreationFileDiffStat(
            path = path,
            additions = prior?.additions.orZero() + stat.additions,
            deletions = prior?.deletions.orZero() + stat.deletions,
        )
    }
    normalizedFallbackPaths.forEach { path ->
        merged.putIfAbsent(
            path,
            CreationFileDiffStat(path, additions = 0, deletions = 0, countsKnown = false),
        )
    }
    return merged.values.toList()
}

/**
 * Projects Harness file-change values into display statistics.
 * Add/delete payloads contain the complete file body; update payloads contain a unified diff.
 */
fun creationFileDiffStats(
    fileChanges: List<AgentFileChange>,
    fallbackDiff: String = "",
    fallbackPaths: List<String> = emptyList(),
): List<CreationFileDiffStat> {
    if (fileChanges.isEmpty()) return creationFileDiffStats(fallbackDiff, fallbackPaths)

    val merged = linkedMapOf<String, CreationFileDiffStat>()
    fileChanges.forEach { change ->
        val path = normalizeCreationWorkspacePath(change.movePath ?: change.path)
        if (path.isBlank()) return@forEach
        val stat = when (change.kind) {
            AgentFileChangeKind.Add -> CreationFileDiffStat(
                path = path,
                additions = change.diff.contentLineCount(),
                deletions = 0,
            )
            AgentFileChangeKind.Delete -> CreationFileDiffStat(
                path = path,
                additions = 0,
                deletions = change.diff.contentLineCount(),
            )
            AgentFileChangeKind.Update -> {
                val parsed = creationFileDiffStats(change.diff)
                CreationFileDiffStat(
                    path = path,
                    additions = parsed.sumOf(CreationFileDiffStat::additions),
                    deletions = parsed.sumOf(CreationFileDiffStat::deletions),
                    countsKnown = parsed.isNotEmpty() && parsed.all(CreationFileDiffStat::countsKnown),
                )
            }
        }
        val prior = merged[path]
        merged[path] = if (prior == null) {
            stat
        } else {
            CreationFileDiffStat(
                path = path,
                additions = prior.additions + stat.additions,
                deletions = prior.deletions + stat.deletions,
                countsKnown = prior.countsKnown && stat.countsKnown,
            )
        }
    }
    normalizeCreationWorkspacePaths(fallbackPaths).forEach { path ->
        val represented = merged.keys.any { it.matchesCreationPath(path) }
        if (!represented) {
            merged[path] = CreationFileDiffStat(
                path = path,
                additions = 0,
                deletions = 0,
                countsKnown = false,
            )
        }
    }
    return merged.values.toList()
}

/**
 * File-change items can contain a complete replacement body while the turn carries the real
 * unified diff. Only prefer an item payload when it is itself countable as a unified diff.
 */
fun preferredCreationDiff(itemDiff: String, turnDiff: String): String = when {
    itemDiff.isUnifiedCreationDiff() -> itemDiff
    turnDiff.isUnifiedCreationDiff() -> turnDiff
    itemDiff.isBlank() -> turnDiff
    else -> itemDiff
}

fun String.isUnifiedCreationDiff(): Boolean {
    if (isBlank()) return false
    var hasOldHeader = false
    var hasNewHeader = false
    lineSequence().forEach { line ->
        if (line.startsWith("diff --git ")) return true
        if (line.startsWith("--- ")) hasOldHeader = true
        if (line.startsWith("+++ ")) hasNewHeader = true
    }
    return hasOldHeader && hasNewHeader
}

fun creationFileTypeLabel(path: String): String {
    val extension = path.substringAfterLast('.', missingDelimiterValue = "")
        .lowercase()
    return when (extension) {
        "html", "htm" -> "HTML"
        "css" -> "CSS"
        "js", "mjs", "cjs" -> "JS"
        "ts" -> "TS"
        "jsx" -> "JSX"
        "tsx" -> "TSX"
        "json" -> "JSON"
        "kt" -> "KT"
        "kts" -> "KTS"
        "md", "markdown" -> "MD"
        "py" -> "PY"
        "rs" -> "RS"
        "go" -> "GO"
        "java" -> "JAVA"
        "xml" -> "XML"
        "yaml", "yml" -> "YAML"
        "txt" -> "TXT"
        else -> extension.uppercase().take(4).ifBlank { "FILE" }
    }
}

fun normalizeCreationWorkspacePaths(paths: List<String>): List<String> =
    paths.asSequence()
        .map(::normalizeCreationWorkspacePath)
        .filter(String::isNotBlank)
        .distinct()
        .toList()

fun normalizeCreationWorkspacePath(path: String): String {
    var normalized = path.trim().trim('"').replace('\\', '/')
    normalized = normalized.replace(RepeatedSlashRegex, "/")
    while (normalized.startsWith("./")) normalized = normalized.removePrefix("./")
    normalized = when {
        normalized == "/workspace" || normalized == "workspace" -> ""
        normalized.startsWith("/workspace/") -> normalized.removePrefix("/workspace/")
        normalized.startsWith("workspace/") -> normalized.removePrefix("workspace/")
        else -> normalized
    }
    return normalized.trim()
}

private fun String.removeDiffPrefix(): String =
    normalizeCreationWorkspacePath(trim().trim('"').removePrefix("a/").removePrefix("b/"))

private fun String.contentLineCount(): Int {
    if (isEmpty()) return 0
    val normalized = replace("\r\n", "\n").replace('\r', '\n')
    return normalized.count { it == '\n' } + if (normalized.endsWith('\n')) 0 else 1
}

private fun String.matchesCreationPath(other: String): Boolean =
    this == other || endsWith("/$other") || other.endsWith("/$this")

private fun Int?.orZero(): Int = this ?: 0

private val RepeatedSlashRegex = Regex("/{2,}")
private val UnifiedDiffSectionBoundary = Regex("(?m)(?=^diff --git )")

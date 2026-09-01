package com.eleckoi.android.engine.agent.api

private const val DefaultCommandSummaryLength = 72

fun commandActionSummary(
    actions: List<AgentCommandAction>,
    rawCommand: String,
    maxLength: Int = DefaultCommandSummaryLength,
): String {
    val summary = when {
        actions.isEmpty() -> rawCommand.conciseShellCommand(maxLength)
            .takeIf(String::isNotBlank)
            ?.let { "运行 $it" }
            ?: "执行命令"
        actions.all { it.type == AgentCommandActionType.Read } -> {
            val targets = actions.mapNotNull(AgentCommandAction::readTarget).distinct()
            when (targets.size) {
                0 -> "读取文件"
                1 -> "读取 ${targets.single().shortDisplayPath()}"
                else -> "读取 ${targets.size} 个文件"
            }
        }
        actions.all { it.type == AgentCommandActionType.ListFiles } -> {
            val paths = actions.mapNotNull(AgentCommandAction::path).filter(String::isNotBlank).distinct()
            when (paths.size) {
                0 -> "查看当前目录"
                1 -> "查看目录 ${paths.single().shortDisplayPath()}"
                else -> "查看 ${paths.size} 个目录"
            }
        }
        actions.all { it.type == AgentCommandActionType.Search } -> {
            val targets = actions.mapNotNull(AgentCommandAction::searchTarget).distinct()
            when (targets.size) {
                0 -> "搜索项目"
                1 -> "搜索 ${targets.single()}"
                else -> "执行 ${targets.size} 次搜索"
            }
        }
        actions.all { it.type == AgentCommandActionType.Unknown } -> {
            if (actions.size == 1) {
                val command = actions.single().command.ifBlank { rawCommand }.conciseShellCommand(maxLength)
                if (command.isBlank()) "执行命令" else "运行 $command"
            } else {
                "运行 ${actions.size} 条命令"
            }
        }
        else -> {
            val parts = actions.take(2).map { action -> action.singleActionSummary(maxLength / 2) }
            buildString {
                append(parts.joinToString("；"))
                if (actions.size > parts.size) append("等 ${actions.size} 项")
            }.ifBlank { "执行 ${actions.size} 项操作" }
        }
    }
    return summary.ellipsize(maxLength)
}

fun runningCommandActionSummary(
    actions: List<AgentCommandAction>,
    rawCommand: String,
    maxLength: Int = DefaultCommandSummaryLength,
): String = "正在${commandActionSummary(actions, rawCommand, maxLength)}"

fun List<AgentCommandAction>.singleTypeOrNull(): AgentCommandActionType? =
    map(AgentCommandAction::type).distinct().singleOrNull()

fun List<AgentCommandAction>.primaryTarget(rawCommand: String): String = when (singleTypeOrNull()) {
    AgentCommandActionType.Read -> mapNotNull(AgentCommandAction::readTarget)
        .distinct()
        .singleOrNull()
        ?.shortDisplayPath()
        .orEmpty()
    AgentCommandActionType.ListFiles -> mapNotNull(AgentCommandAction::path)
        .filter(String::isNotBlank)
        .distinct()
        .singleOrNull()
        ?.shortDisplayPath()
        ?: "当前目录"
    AgentCommandActionType.Search -> mapNotNull(AgentCommandAction::searchTarget)
        .distinct()
        .singleOrNull()
        .orEmpty()
    AgentCommandActionType.Unknown, null -> firstOrNull()
        ?.command
        .orEmpty()
        .ifBlank { rawCommand }
        .conciseShellCommand()
}

fun String.conciseShellCommand(maxLength: Int = DefaultCommandSummaryLength): String {
    var value = trim().replace(Regex("\\s+"), " ")
    val shellPayload = ShellWrapper.matchEntire(value)?.groupValues?.getOrNull(1)
    if (!shellPayload.isNullOrBlank()) {
        value = shellPayload.trim()
        if (
            value.length >= 2 &&
            ((value.first() == '"' && value.last() == '"') ||
                (value.first() == '\'' && value.last() == '\''))
        ) {
            value = value.substring(1, value.lastIndex).trim()
        }
    }
    return value.ellipsize(maxLength)
}

private fun AgentCommandAction.singleActionSummary(maxLength: Int): String = when (type) {
    AgentCommandActionType.Read -> readTarget()
        ?.shortDisplayPath()
        ?.let { "读取 $it" }
        ?: "读取文件"
    AgentCommandActionType.ListFiles -> path
        ?.takeIf(String::isNotBlank)
        ?.shortDisplayPath()
        ?.let { "查看目录 $it" }
        ?: "查看当前目录"
    AgentCommandActionType.Search -> searchTarget()?.let { "搜索 $it" } ?: "搜索项目"
    AgentCommandActionType.Unknown -> command.conciseShellCommand(maxLength)
        .takeIf(String::isNotBlank)
        ?.let { "运行 $it" }
        ?: "执行命令"
}

private fun AgentCommandAction.readTarget(): String? =
    path?.takeIf(String::isNotBlank) ?: name?.takeIf(String::isNotBlank)

private fun AgentCommandAction.searchTarget(): String? =
    query?.takeIf(String::isNotBlank)
        ?: path?.takeIf(String::isNotBlank)?.shortDisplayPath()
        ?: command.conciseShellCommand().takeIf(String::isNotBlank)

private fun String.shortDisplayPath(): String {
    val normalized = replace('\\', '/').trimEnd('/')
    return normalized.substringAfterLast('/').ifBlank { normalized }
}

private fun String.ellipsize(maxLength: Int): String {
    if (length <= maxLength) return this
    if (maxLength <= 1) return "…"
    return take(maxLength - 1).trimEnd() + "…"
}

private val ShellWrapper = Regex("""^(?:(?:/usr)?/bin/)?(?:bash|sh)\s+-lc\s+(.+)$""")

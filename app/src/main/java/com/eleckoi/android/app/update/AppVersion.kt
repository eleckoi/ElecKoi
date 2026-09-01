package com.eleckoi.android.app.update

/** Version ordering for GitHub release tags such as `v0.2.1` and `0.2.1-rc.1`. */
internal object AppVersion {
    fun isNewer(candidate: String, installed: String): Boolean = compare(candidate, installed) > 0

    fun compare(left: String, right: String): Int {
        val leftVersion = parse(left)
        val rightVersion = parse(right)
        val partCount = maxOf(leftVersion.parts.size, rightVersion.parts.size)
        repeat(partCount) { index ->
            val comparison = leftVersion.parts.getOrElse(index) { 0 }
                .compareTo(rightVersion.parts.getOrElse(index) { 0 })
            if (comparison != 0) return comparison
        }
        return comparePreRelease(leftVersion.preRelease, rightVersion.preRelease)
    }

    fun display(raw: String): String = raw.trim().removePrefix("v").removePrefix("V")

    private fun parse(raw: String): ParsedVersion {
        val normalized = display(raw).substringBefore('+')
        val core = normalized.substringBefore('-')
        val parts = core.split('.')
            .map { part -> part.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
        val preRelease = normalized.substringAfter('-', missingDelimiterValue = "")
            .takeIf(String::isNotBlank)
            ?.split('.')
        return ParsedVersion(parts = parts, preRelease = preRelease)
    }

    private fun comparePreRelease(left: List<String>?, right: List<String>?): Int {
        if (left == null && right == null) return 0
        if (left == null) return 1
        if (right == null) return -1
        val partCount = maxOf(left.size, right.size)
        repeat(partCount) { index ->
            val leftPart = left.getOrNull(index) ?: return -1
            val rightPart = right.getOrNull(index) ?: return 1
            val leftNumber = leftPart.toIntOrNull()
            val rightNumber = rightPart.toIntOrNull()
            val comparison = when {
                leftNumber != null && rightNumber != null -> leftNumber.compareTo(rightNumber)
                leftNumber != null -> -1
                rightNumber != null -> 1
                else -> leftPart.compareTo(rightPart, ignoreCase = true)
            }
            if (comparison != 0) return comparison
        }
        return 0
    }

    private data class ParsedVersion(
        val parts: List<Int>,
        val preRelease: List<String>?,
    )
}

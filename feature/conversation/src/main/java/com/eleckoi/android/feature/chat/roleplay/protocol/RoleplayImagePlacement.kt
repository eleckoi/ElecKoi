package com.eleckoi.android.feature.chat.roleplay.protocol

internal const val RoleplayImageMarkerPrefix: String = "[[IMAGE:"

internal sealed interface RoleplayImagePlacementPart {
    data class Text(val value: String) : RoleplayImagePlacementPart
    data class Images(val frameIndexes: List<Int>) : RoleplayImagePlacementPart
}

internal fun roleplayImageMarker(frameIndex: Int): String =
    "$RoleplayImageMarkerPrefix${frameIndex.coerceAtLeast(1)}]]"

internal fun stripRoleplayImageMarkers(raw: String): String =
    parseRoleplayImagePlacements(raw = raw, streaming = false)
        .filterIsInstance<RoleplayImagePlacementPart.Text>()
        .joinToString(separator = "", transform = RoleplayImagePlacementPart.Text::value)

/**
 * Splits invisible image placement markers out of the final reply.
 *
 * Adjacent markers, with only whitespace between them, intentionally become one gallery. During
 * streaming an incomplete marker suffix is withheld so protocol characters never flash in the
 * visible reply before the next provider chunk arrives.
 */
internal fun parseRoleplayImagePlacements(
    raw: String,
    streaming: Boolean,
): List<RoleplayImagePlacementPart> {
    val visible = if (streaming) raw.withoutIncompleteImageMarkerSuffix() else raw
    if (visible.isEmpty()) return emptyList()
    val parts = mutableListOf<RoleplayImagePlacementPart>()
    var cursor = 0
    ImageMarkerPattern.findAll(visible).forEach { match ->
        val between = visible.substring(cursor, match.range.first)
        val previous = parts.lastOrNull()
        if (previous is RoleplayImagePlacementPart.Images && between.isBlank()) {
            parts[parts.lastIndex] = previous.copy(
                frameIndexes = previous.frameIndexes + match.groupValues[1].toInt(),
            )
        } else {
            if (between.isNotBlank()) parts += RoleplayImagePlacementPart.Text(between)
            parts += RoleplayImagePlacementPart.Images(
                frameIndexes = listOf(match.groupValues[1].toInt()),
            )
        }
        cursor = match.range.last + 1
    }
    val remainder = visible.substring(cursor)
    if (remainder.isNotBlank()) parts += RoleplayImagePlacementPart.Text(remainder)
    if (parts.isEmpty() && visible.isNotBlank()) {
        parts += RoleplayImagePlacementPart.Text(visible)
    }
    return parts
}

private fun String.withoutIncompleteImageMarkerSuffix(): String {
    val start = lastIndexOf("[[")
    if (start < 0) return this
    val suffix = substring(start)
    val incomplete = when {
        RoleplayImageMarkerPrefix.startsWith(suffix) -> true
        !suffix.startsWith(RoleplayImageMarkerPrefix) -> false
        suffix.endsWith("]]") -> false
        else -> suffix.removePrefix(RoleplayImageMarkerPrefix).matches(PartialFrameIndexPattern)
    }
    return if (incomplete) substring(0, start) else this
}

private val ImageMarkerPattern = Regex("""\[\[IMAGE:(\d{1,3})]]""")
private val PartialFrameIndexPattern = Regex("""\d{0,3}]?""")

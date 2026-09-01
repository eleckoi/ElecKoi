package com.eleckoi.android.feature.chat.ui.blocks.rich

import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.eleckoi.android.feature.chat.data.rich.RichMessageDocumentKind
import java.security.MessageDigest
import kotlin.math.roundToInt

internal object RichMessageHeightCache {
    private const val MaxEntries = 96
    private const val PreferencesName = "rich_message_height_cache"
    private const val HeightPrefix = "height:"
    private const val TouchedPrefix = "touched:"
    private val values = object : LinkedHashMap<String, Dp>(16, 0.75f, true) {}

    @Synchronized
    fun get(context: Context, key: String): Dp? {
        values[key]?.let { return it }
        val stored = preferences(context).getFloat(heightStorageKey(key), Float.NaN)
        if (!stored.isFinite() || stored <= 0f) return null
        return stored.dp.also { values[key] = it }
    }

    @Synchronized
    fun put(context: Context, key: String, value: Dp) {
        values[key] = value
        while (values.size > MaxEntries) values.remove(values.entries.first().key)

        val preferences = preferences(context)
        val heightKey = heightStorageKey(key)
        val touchedKey = touchedStorageKey(key)
        val existingEntry = preferences.contains(heightKey)
        val editor = preferences.edit()
            .putFloat(heightKey, value.value)
            .putLong(touchedKey, System.currentTimeMillis())
        if (!existingEntry) {
            val overflow = preferences.all.entries
                .asSequence()
                .filter { (storedKey, storedValue) ->
                    storedKey.startsWith(TouchedPrefix) && storedValue is Long
                }
                .sortedBy { (_, storedValue) -> storedValue as Long }
                .map { (storedKey, _) -> storedKey.removePrefix(TouchedPrefix) }
                .toList()
                .take((preferences.all.count { it.key.startsWith(HeightPrefix) } - MaxEntries + 1).coerceAtLeast(0))
            overflow.forEach { suffix ->
                editor.remove("$HeightPrefix$suffix")
                editor.remove("$TouchedPrefix$suffix")
            }
        }
        editor.apply()
    }

    private fun preferences(context: Context) = context.applicationContext.getSharedPreferences(
        PreferencesName,
        Context.MODE_PRIVATE,
    )

    private fun heightStorageKey(key: String): String = "$HeightPrefix${sha256Prefix(key)}"

    private fun touchedStorageKey(key: String): String = "$TouchedPrefix${sha256Prefix(key)}"
}

internal fun richMessageOrigin(messageId: String): String {
    val hash = sha256Prefix(messageId)
    return "https://rich-$hash.eleckoi.invalid"
}

internal fun richMessageSnapshotKey(variableStateJson: String): String =
    "${variableStateJson.length}:${sha256Prefix(variableStateJson)}"

private fun sha256Prefix(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .take(12)
    .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }

internal fun Color.toCssColor(): String {
    val argb = toArgb()
    val alpha = ((argb ushr 24) and 0xff) / 255f
    val red = (argb ushr 16) and 0xff
    val green = (argb ushr 8) and 0xff
    val blue = argb and 0xff
    return "rgba($red,$green,$blue,${(alpha * 1000).roundToInt() / 1000f})"
}

internal fun RichMessageDocumentKind.initialHeight(): Dp = when (this) {
    RichMessageDocumentKind.FullDocument -> 420.dp
    RichMessageDocumentKind.Fragment -> 160.dp
}

internal val MinRichMessageHeight = 1.dp
internal val MaxRichMessageHeight = 24_000.dp

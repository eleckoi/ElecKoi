package com.eleckoi.android.feature.chat.ui.roleplay.web.model

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.eleckoi.android.feature.preferences.ChatAvatarShape
import kotlin.math.roundToInt

internal fun com.eleckoi.android.feature.characters.model.AvatarSet.pathFor(
    shape: ChatAvatarShape,
): String = when (shape) {
    ChatAvatarShape.Portrait -> portrait
    ChatAvatarShape.RoundedSquare -> square
    ChatAvatarShape.Circle -> circle
}

internal fun Color.toCssColor(): String {
    val argb = toArgb()
    val alpha = ((argb ushr 24) and 0xff) / 255f
    val red = (argb ushr 16) and 0xff
    val green = (argb ushr 8) and 0xff
    val blue = argb and 0xff
    return "rgba($red,$green,$blue,${(alpha * 1000).roundToInt() / 1000f})"
}

internal const val RoleplayTranscriptOrigin = "https://roleplay.eleckoi.invalid"
internal const val RoleplayTranscriptMediaPath = "/media/"
internal const val RoleplayTranscriptAssetPath = "/asset/"

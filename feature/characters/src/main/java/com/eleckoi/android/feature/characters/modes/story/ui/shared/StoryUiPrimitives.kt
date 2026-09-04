package com.eleckoi.android.feature.characters.modes.story.ui.shared

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppSwitch

internal data class DropdownOption(
    val title: String,
    val description: String,
    val leadingText: String = "",
    val leadingIcon: List<String> = emptyList(),
    val leadingImageVector: ImageVector? = null,
)

internal object StoryEditorShapes {
    val Card = RoundedCornerShape(13.dp)
    val Control = RoundedCornerShape(10.dp)
    val Small = RoundedCornerShape(8.dp)
}

/** Shared vertical rhythm between adjacent white cards on character-setting surfaces. */
internal val StoryEditorCardSpacing = 16.dp

internal fun parseKeywords(value: String): List<String> {
    return value
        .split(',', '，', '\n', '、')
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .distinct()
}

@Composable
internal fun StoryToolSwitch(
    checked: Boolean,
    appearance: AppearanceTheme,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    AppSwitch(
        checked = checked,
        onCheckedChange = onCheckedChange,
        appearance = appearance,
        modifier = modifier,
    )
}

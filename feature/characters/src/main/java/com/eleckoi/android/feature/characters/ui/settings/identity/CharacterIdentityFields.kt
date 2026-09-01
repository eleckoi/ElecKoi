package com.eleckoi.android.feature.characters.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AvatarCircle
import com.eleckoi.android.foundation.design.components.noRippleClickable
import kotlin.math.roundToInt

@Composable
internal fun CharacterIdentityHero(
    name: String,
    fallbackName: String,
    avatarPath: String,
    coverPath: String,
    appearance: AppearanceTheme,
    colors: ScrapbookPalette,
    scale: Float,
    onAvatarClick: () -> Unit,
    onCoverClick: () -> Unit,
    onNameChange: (String) -> Unit,
) {
    fun u(value: Float): Dp = (value * scale).dp
    val visibleName = name.ifBlank { fallbackName.ifBlank { "未命名角色" } }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(u(224f)),
    ) {
        CharacterAvatar(
            name = visibleName,
            avatarPath = avatarPath,
            appearance = appearance,
            scale = scale,
            onClick = onAvatarClick,
            modifier = Modifier.offset(x = u(18f), y = u(18f)),
        )

        ScrapbookPolaroid(
            name = visibleName,
            avatarPath = avatarPath,
            coverPath = coverPath,
            colors = colors,
            scale = scale,
            onClick = onCoverClick,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = u(-7f), y = u(4f)),
        )

        CharacterNameField(
            name = name,
            fallbackName = fallbackName,
            colors = colors,
            scale = scale,
            onNameChange = onNameChange,
            modifier = Modifier
                .offset(x = u(16f), y = u(133f))
                // Leave a deliberate gutter before the stacked portrait so the underline
                // never paints across either photo when the rear sheet is offset left.
                .width(u(150f))
                .height(u(66f)),
        )
    }
}

@Composable
private fun CharacterAvatar(
    name: String,
    avatarPath: String,
    appearance: AppearanceTheme,
    scale: Float,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val imageSize = (94f * scale).dp
    val ring = (5f * scale).dp
    val typeScale = scale / LocalDensity.current.fontScale
    Box(
        modifier = modifier
            .size(imageSize + ring * 2f)
            .semantics { contentDescription = "编辑角色圆形头像" }
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .shadow((7f * scale).dp, CircleShape, clip = false)
                .background(androidx.compose.ui.graphics.Color.White, CircleShape),
        )
        AvatarCircle(
            name = name,
            size = imageSize.value.roundToInt(),
            fontSize = (29f * typeScale).roundToInt(),
            appearance = appearance,
            avatarPath = avatarPath,
        )
    }
}

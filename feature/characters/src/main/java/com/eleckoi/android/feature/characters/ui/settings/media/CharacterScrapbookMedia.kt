package com.eleckoi.android.feature.characters.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.BubbleActionMenu
import com.eleckoi.android.foundation.design.components.MobileHeaderMenuAction
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.SvgCircle
import com.eleckoi.android.foundation.design.components.noRippleClickable
import java.io.File

@Composable
internal fun ScrapbookPolaroid(
    name: String,
    avatarPath: String,
    coverPath: String,
    colors: ScrapbookPalette,
    scale: Float,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    fun u(value: Float): Dp = (value * scale).dp
    val typeScale = scale / LocalDensity.current.fontScale
    val avatarFile = remember(avatarPath) {
        avatarPath.takeIf { it.isNotBlank() }
            ?.let(::File)
            ?.takeIf { it.exists() }
    }
    val coverFile = remember(coverPath) {
        coverPath.takeIf { it.isNotBlank() }
            ?.let(::File)
            ?.takeIf { it.exists() }
    }
    val shape = RoundedCornerShape(u(1.5f))

    Box(
        modifier = modifier
            .size(width = u(150f), height = u(198f))
            .semantics { contentDescription = "编辑角色立绘封面" }
            .noRippleClickable(onClick = onClick),
    ) {
        // Keep the scrapbook's original layered-photo gesture: the avatar is the
        // quiet rear print, while the full cover sits above it at a slight angle.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .offset(x = u(-7f), y = u(7f))
                .rotate(-4.5f)
                .shadow(u(4f), shape, clip = false)
                .background(Color.White, shape)
                .padding(start = u(8f), top = u(8f), end = u(8f), bottom = u(14f))
                .clip(shape),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(colors.coverTint),
                contentAlignment = Alignment.Center,
            ) {
                if (avatarFile != null) {
                    AsyncImage(
                        model = avatarFile,
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                } else {
                    Text(
                        text = name.firstOrNull()?.toString() ?: "?",
                        color = colors.inkSoft.copy(alpha = 0.52f),
                        fontSize = (34f * typeScale).sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .rotate(1.8f)
                .shadow(u(7f), shape, clip = false)
                .background(Color.White, shape)
                .padding(start = u(8f), top = u(8f), end = u(8f), bottom = u(14f))
                .clip(shape),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(u(1f)))
                    .background(colors.coverTint),
                contentAlignment = Alignment.Center,
            ) {
                if (coverFile != null) {
                    AsyncImage(
                        model = coverFile,
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                } else {
                    Text(
                        text = name.firstOrNull()?.toString() ?: "?",
                        color = colors.inkSoft.copy(alpha = 0.66f),
                        fontSize = (38f * typeScale).sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}

@Composable
internal fun ScrapbookBackButton(
    appearance: AppearanceTheme,
    scale: Float,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val visualSize = (34f * scale).dp
    Box(
        modifier = modifier
            .size(48.dp)
            .semantics { contentDescription = "返回" }
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(visualSize)
                .shadow((4f * scale).dp, CircleShape, clip = false)
                .background(Color.White.copy(alpha = 0.96f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            StrokeSvgIcon(
                paths = AppIconPaths.Back,
                color = Color(0xFF52657A),
                iconSize = (17f * scale).dp,
                strokeWidth = 2.1f,
            )
        }
    }
}

private val CharacterSettingsMoreDots = listOf(
    SvgCircle(12f, 5.4f, 1.75f, fill = true),
    SvgCircle(12f, 12f, 1.75f, fill = true),
    SvgCircle(12f, 18.6f, 1.75f, fill = true),
)

@Composable
internal fun CharacterSettingsOverflow(
    appearance: AppearanceTheme,
    scale: Float,
    onExport: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val menuOpen = remember { androidx.compose.runtime.mutableStateOf(false) }
    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .semantics { contentDescription = "更多角色操作" }
                .noRippleClickable { menuOpen.value = true },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size((34f * scale).dp)
                    .shadow((4f * scale).dp, CircleShape, clip = false)
                    .background(Color.White.copy(alpha = 0.96f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                StrokeSvgIcon(
                    paths = emptyList(),
                    color = Color(0xFF52657A),
                    iconSize = (17f * scale).dp,
                    circles = CharacterSettingsMoreDots,
                )
            }
        }
        BubbleActionMenu(
            expanded = menuOpen.value,
            actions = listOf(
                MobileHeaderMenuAction(
                    label = "导出角色",
                    icon = AppIconPaths.Export,
                    onClick = onExport,
                ),
                MobileHeaderMenuAction(
                    label = "删除角色",
                    icon = AppIconPaths.Trash,
                    tint = ElecKoiDanger,
                    dividerBefore = true,
                    onClick = onDelete,
                ),
            ),
            appearance = appearance,
            onDismiss = { menuOpen.value = false },
        )
    }
}

package com.eleckoi.android.app.shell

import com.eleckoi.android.foundation.design.components.*
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.vector.ImageVector
import coil3.compose.AsyncImage
import com.eleckoi.android.foundation.design.R as DesignR
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.characters.model.UserProfile
import com.eleckoi.android.foundation.design.overlayScrim
import java.io.File

/**
 * A drawer row that leads somewhere off this screen. A blank [url] can still be supplied with a
 * local click action; with neither one, the row remains visibly unavailable.
 */
internal data class MoreLinkRow(
    val label: String,
    val icon: List<String>,
    val url: String = "",
)

private val MoreCommunityRow = MoreLinkRow("社区", AppIconPaths.UsersGroup)

private val MoreDiscoverRows = listOf(
    MoreLinkRow("设计资源平台", AppIconPaths.CardStack),
)

@Composable
internal fun MobileMorePanel(
    visible: Boolean,
    user: UserProfile,
    appearance: AppearanceTheme,
    appUpdateAvailable: Boolean,
    onClose: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenUpdate: () -> Unit,
) {
    var showCommunityDialog by rememberSaveable { mutableStateOf(false) }
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val panelWidth = minOf(maxWidth * 0.84f, 360.dp)
        AnimatedVisibility(
            visible = visible,
            enter = fadeIn(animationSpec = drawerFadeTween()),
            exit = fadeOut(animationSpec = drawerFadeTween()),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(appearance.overlayScrim())
                    .noRippleClickable(onClick = onClose),
            )
        }
        AnimatedVisibility(
            visible = visible,
            enter = slideInHorizontally(animationSpec = drawerSlideTween()) { -it } + fadeIn(animationSpec = drawerFadeTween(), initialAlpha = 0.98f),
            exit = slideOutHorizontally(animationSpec = drawerSlideTween()) { -it } + fadeOut(animationSpec = drawerFadeTween(), targetAlpha = 0.98f),
        ) {
            Column(
                modifier = Modifier
                    .width(panelWidth)
                    .fillMaxHeight()
                    // Only the edge facing the dimmed page is rounded. The other three sit on
                    // screen edges, where a radius would just leak a sliver of wallpaper.
                    .clip(RoundedCornerShape(topEnd = 22.dp, bottomEnd = 22.dp))
                    .background(appearance.mobileSurface),
            ) {
                val coverFile = remember(user.userCover) {
                    user.userCover.takeIf { it.isNotBlank() }
                        ?.let(::File)
                        ?.takeIf(File::exists)
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(panelWidth / ProfileCoverAspectRatio)
                        .background(appearance.mobileSurface),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .fillMaxHeight()
                            .background(appearance.mobilePinnedBg),
                    ) {
                        AsyncImage(
                            model = coverFile ?: DesignR.raw.default_user_profile_cover,
                            contentDescription = null,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop,
                        )
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(
                                    Brush.verticalGradient(
                                        colors = listOf(
                                            Color.Black.copy(alpha = 0.24f),
                                            Color.Transparent,
                                            appearance.mobileSurface.copy(alpha = 0.20f),
                                            appearance.mobileSurface.copy(alpha = 0.72f),
                                            appearance.mobileSurface,
                                        ),
                                        startY = 0f,
                                    ),
                                ),
                        )
                    }
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .statusBarsPadding()
                            .padding(top = 4.dp, end = 6.dp),
                    ) {
                        IconButton(onClick = onClose) {
                            Icon(
                                Icons.Rounded.Close,
                                contentDescription = "关闭",
                                tint = Color.White,
                            )
                        }
                    }
                    Row(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .fillMaxWidth()
                            .padding(start = 20.dp, end = 52.dp, bottom = 18.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        // A white ring seats the avatar into the cover instead of leaving it
                        // floating on top of whatever the photo happens to be behind it.
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.92f))
                                .noRippleClickable(onClick = onOpenProfile),
                            contentAlignment = Alignment.Center,
                        ) {
                            AvatarCircle(
                                name = user.userName.ifBlank { "用户" },
                                size = 58,
                                fontSize = 22,
                                appearance = appearance,
                                avatarPath = user.userAvatar,
                                fallbackImage = DesignR.raw.default_user_avatar_circle,
                            )
                        }
                        Column(modifier = Modifier.padding(start = 13.dp)) {
                            Text(
                                text = user.userName.ifBlank { "用户" },
                                color = appearance.mobileText,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.SemiBold,
                                lineHeight = 23.sp,
                            )
                            Text(
                                "在线 - WiFi",
                                color = appearance.mobileMuted,
                                fontSize = 14.sp,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                    }
                }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState()),
                ) {
                    MoreLinkRow(
                        row = MoreCommunityRow,
                        appearance = appearance,
                        onClose = onClose,
                        onClick = { showCommunityDialog = true },
                    )
                    MoreDiscoverRows.forEach { row ->
                        MoreLinkRow(row = row, appearance = appearance, onClose = onClose)
                    }
                }
                // Laid out across rather than stacked: these are utilities, not destinations, and a
                // horizontal strip claims a third of the height a list of full-width rows does.
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 8.dp, top = 6.dp, bottom = 10.dp),
                ) {
                    MoreFooterAction(
                        label = "设置",
                        icon = AppIconPaths.Gear,
                        appearance = appearance,
                        onClick = onOpenSettings,
                    )
                    MoreFooterImageAction(
                        label = "更新",
                        icon = if (appUpdateAvailable) {
                            Icons.Rounded.ErrorOutline
                        } else {
                            Icons.Rounded.SystemUpdate
                        },
                        tint = if (appUpdateAvailable) {
                            MaterialTheme.colorScheme.error
                        } else {
                            appearance.mobileText
                        },
                        onClick = onOpenUpdate,
                    )
                }
                Spacer(modifier = Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
            }
        }
    }
    if (showCommunityDialog) {
        MobileCommunityDialog(
            appearance = appearance,
            onDismiss = { showCommunityDialog = false },
        )
    }
}

@Composable
private fun MoreFooterImageAction(
    label: String,
    icon: ImageVector,
    tint: Color,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .width(72.dp)
            .noRippleClickable(onClick = onClick)
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(23.dp),
        )
        Text(
            text = label,
            color = tint,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 5.dp),
        )
    }
}

@Composable
private fun MoreLinkRow(
    row: MoreLinkRow,
    appearance: AppearanceTheme,
    onClose: () -> Unit,
    onClick: (() -> Unit)? = null,
) {
    val uriHandler = LocalUriHandler.current
    val action = onClick ?: row.url.takeIf(String::isNotBlank)?.let { url ->
        {
            onClose()
            uriHandler.openUri(url)
        }
    }
    val ready = action != null
    val tint = if (ready) appearance.mobileText else appearance.mobileSoft
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .then(
                if (ready) {
                    Modifier.noRippleClickable(onClick = action)
                } else {
                    Modifier
                },
            )
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StrokeSvgIcon(row.icon, tint, iconSize = 21.dp)
        Text(
            text = row.label,
            color = tint,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier
                .padding(start = 13.dp)
                .weight(1f),
        )
        if (ready) {
            StrokeSvgIcon(AppIconPaths.ExternalLink, appearance.mobileSoft, iconSize = 16.dp)
        } else {
            Text(
                text = "敬请期待",
                color = appearance.mobileSoft,
                fontSize = 11.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(appearance.mobileSearchBg)
                    .padding(horizontal = 7.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun MoreFooterAction(
    label: String,
    icon: List<String>,
    appearance: AppearanceTheme,
    onClick: (() -> Unit)?,
) {
    Column(
        modifier = Modifier
            .width(72.dp)
            .then(if (onClick != null) Modifier.noRippleClickable(onClick = onClick) else Modifier)
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        StrokeSvgIcon(icon, appearance.mobileText, iconSize = 23.dp)
        Text(
            text = label,
            color = appearance.mobileText,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 5.dp),
        )
    }
}

private fun drawerSlideTween() = tween<IntOffset>(durationMillis = 300, easing = CubicBezierEasing(0.2f, 0f, 0f, 1f))

private fun drawerFadeTween() = tween<Float>(durationMillis = 180, easing = CubicBezierEasing(0.2f, 0f, 0f, 1f))

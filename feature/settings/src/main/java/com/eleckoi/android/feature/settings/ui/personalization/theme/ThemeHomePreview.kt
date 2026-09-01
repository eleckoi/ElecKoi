package com.eleckoi.android.feature.settings.ui.personalization.theme

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AnimatedNavIcon
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.BottomTab
import com.eleckoi.android.foundation.design.components.MobileRootBackdrop
import com.eleckoi.android.foundation.design.components.MobileRootGlassBar
import com.eleckoi.android.foundation.design.components.MobileRootGlassPlacement
import com.eleckoi.android.foundation.design.components.MobileRootGlassProvider
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon

@Composable
internal fun ProportionalHomePreview(
    appearance: AppearanceTheme,
    previewBitmap: Bitmap?,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(
        modifier = modifier.clipToBounds(),
        contentAlignment = Alignment.Center,
    ) {
        val scale = minOf(maxWidth.value / 360f, maxHeight.value / 800f).coerceAtMost(1f)
        val previewShape = RoundedCornerShape(18.dp)
        Box(
            modifier = Modifier
                .size(width = 360.dp * scale, height = 800.dp * scale)
                .clip(previewShape)
                .border(1.dp, appearance.mobileMuted.copy(alpha = 0.18f), previewShape),
        ) {
            MobileRootGlassProvider(modifier = Modifier.fillMaxSize()) {
                MobileRootBackdrop(
                    appearance = appearance,
                    previewModel = previewBitmap,
                )
                HomePreviewMock(appearance = appearance, scale = scale)
            }
        }
    }
}

@Composable
private fun HomePreviewMock(
    appearance: AppearanceTheme,
    scale: Float,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        MobileRootGlassBar(
            appearance = appearance,
            placement = MobileRootGlassPlacement.Top,
            modifier = Modifier
                .fillMaxWidth()
                .height(84.dp * scale),
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(30.dp * scale)
                        .padding(horizontal = 18.dp * scale),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "06:05",
                        modifier = Modifier.weight(1f),
                        color = appearance.mobileText,
                        fontSize = 12.sp * scale,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text("5G", color = appearance.mobileText, fontSize = 9.5.sp * scale, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.width(7.dp * scale))
                    Box(
                        modifier = Modifier
                            .size(width = 18.dp * scale, height = 9.dp * scale)
                            .clip(RoundedCornerShape(2.dp * scale))
                            .border(1.dp, appearance.mobileText.copy(alpha = 0.70f), RoundedCornerShape(2.dp * scale))
                            .padding(2.dp * scale),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(appearance.mobileText.copy(alpha = 0.70f)),
                        )
                    }
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp * scale)
                        .padding(horizontal = 17.dp * scale),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PlaceholderAvatar(40.dp * scale, appearance)
                    Column(
                        modifier = Modifier
                            .padding(start = 10.dp * scale)
                            .weight(1f),
                    ) {
                        Text("ElecKoi", color = appearance.mobileText, fontSize = 17.sp * scale, fontWeight = FontWeight.Medium)
                        Text("在线 - WiFi", color = appearance.mobileMuted, fontSize = 12.sp * scale)
                    }
                    StrokeSvgIcon(AppIconPaths.Search, appearance.mobileText, iconSize = 24.dp * scale)
                    Spacer(modifier = Modifier.width(18.dp * scale))
                    StrokeSvgIcon(AppIconPaths.Plus, appearance.mobileText, iconSize = 25.dp * scale)
                }
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            MockConversationRow("吃白饭的大肥鱼", "一脸震惊地盯着屏幕…", "22:12", appearance, scale)
            MockConversationRow("星见绫音", "教室里安静下来，只剩窗外的雨…", "22:11", appearance, scale)
            MockConversationRow("示例角色", "新的消息会显示在这里", "19:03", appearance, scale)
            MockConversationRow("还是好鱼嘛", "你好呀，小鱼～", "11:57", appearance, scale)
        }
        MockTabBar(appearance, scale)
    }
}

@Composable
private fun PlaceholderAvatar(size: Dp, appearance: AppearanceTheme) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(appearance.mobileSurface.copy(alpha = 0.70f)),
        contentAlignment = Alignment.Center,
    ) {
        StrokeSvgIcon(AppIconPaths.User, appearance.mobileMuted, iconSize = size * 0.56f)
    }
}

@Composable
private fun MockConversationRow(
    title: String,
    subtitle: String,
    sideText: String,
    appearance: AppearanceTheme,
    scale: Float,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp * scale)
            .padding(horizontal = 17.dp * scale),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlaceholderAvatar(43.dp * scale, appearance)
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 11.dp * scale),
        ) {
            Text(
                title,
                color = appearance.mobileText,
                fontSize = 16.sp * scale,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                subtitle,
                color = appearance.mobileMuted,
                fontSize = 12.sp * scale,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(sideText, color = appearance.mobileSoft, fontSize = 11.5.sp * scale)
    }
}

@Composable
private fun MockTabBar(
    appearance: AppearanceTheme,
    scale: Float,
) {
    MobileRootGlassBar(
        appearance = appearance,
        placement = MobileRootGlassPlacement.Bottom,
        modifier = Modifier
            .fillMaxWidth()
            .height(70.dp * scale),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp * scale)
                    .padding(horizontal = 20.dp * scale),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BottomTab.DefaultTabs.forEach { tab ->
                    val active = tab == BottomTab.Messages
                    Column(
                        modifier = Modifier.weight(1f),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        AnimatedNavIcon(
                            tab = tab.icon,
                            active = active,
                            activeColor = appearance.mobileBlue,
                            baseColor = appearance.mobileText,
                            modifier = Modifier.size(23.dp * scale),
                        )
                        Text(
                            tab.label,
                            color = if (active) appearance.mobileBlue else appearance.mobileText,
                            fontSize = 10.5.sp * scale,
                        )
                    }
                }
            }
            Box(
                modifier = Modifier
                    .width(92.dp * scale)
                    .height(4.dp * scale)
                    .align(Alignment.CenterHorizontally)
                    .clip(CircleShape)
                    .background(appearance.mobileText.copy(alpha = 0.24f)),
            )
        }
    }
}

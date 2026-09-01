package com.eleckoi.android.feature.chat.ui.background

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import androidx.compose.foundation.background

internal enum class BackgroundOrigin {
    AppDefault,
    CharacterCard,
    Global,
    CharacterCustom,
}

@Composable
internal fun BackgroundModePicker(
    origin: BackgroundOrigin,
    characterCardEnabled: Boolean,
    globalEnabled: Boolean,
    appearance: AppearanceTheme,
    onSelect: (BackgroundOrigin) -> Unit,
) {
    val choices = listOf(
        Triple(BackgroundOrigin.AppDefault, "默认", true),
        Triple(BackgroundOrigin.CharacterCustom, "自定义", true),
        Triple(BackgroundOrigin.CharacterCard, "角色立绘", characterCardEnabled),
        Triple(BackgroundOrigin.Global, "全局背景", globalEnabled),
    )
    Text(
        text = "背景来源",
        color = appearance.mobileText,
        fontSize = 13.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(bottom = 8.dp),
    )
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        choices.chunked(2).forEach { rowChoices ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                rowChoices.forEach { (choice, label, enabled) ->
                    BackgroundModeOption(
                        label = label,
                        selected = origin == choice,
                        enabled = enabled,
                        appearance = appearance,
                        modifier = Modifier.weight(1f),
                        onClick = { onSelect(choice) },
                    )
                }
            }
        }
    }
    Text(
        text = when (origin) {
            BackgroundOrigin.AppDefault -> "App 默认背景色，不显示图片"
            BackgroundOrigin.CharacterCustom -> "为当前角色选择一张独立背景"
            BackgroundOrigin.CharacterCard -> "使用当前角色卡的立绘"
            BackgroundOrigin.Global -> "使用所有选择全局背景的角色共享图片"
        },
        color = appearance.mobileMuted,
        fontSize = 12.sp,
        modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
    )
}

@Composable
private fun BackgroundModeOption(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .height(50.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(
                if (selected) appearance.mobileText else appearance.mobileSearchBg,
            )
            .noRippleClickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (selected) {
            StrokeSvgIcon(
                paths = AppIconPaths.Check,
                color = appearance.mobileSurface,
                iconSize = 14.dp,
                strokeWidth = 2.5f,
            )
            Spacer(modifier = Modifier.size(7.dp))
        }
        Text(
            text = label,
            color = when {
                selected -> appearance.mobileSurface
                enabled -> appearance.mobileText
                else -> appearance.mobileSoft
            },
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
            textAlign = TextAlign.Center,
            maxLines = 1,
        )
    }
}

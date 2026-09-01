package com.eleckoi.android.feature.characters.modes.story.variables.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ViewList
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorHeader
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryHeaderSearchAction
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
internal fun VariableConfigHeader(
    title: String,
    managerOpen: Boolean,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onOpenManager: () -> Unit,
) {
    val gearRotation by animateFloatAsState(
        targetValue = if (managerOpen) 90f else 0f,
        animationSpec = tween(durationMillis = 220),
        label = "variable_config_gear_rotation",
    )
    StoryEditorHeader(
        title = title,
        appearance = appearance,
        onBack = onBack,
        actionWidth = 96.dp,
        action = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StoryHeaderSearchAction(appearance = appearance, onClick = onSearch)
                Box(
                    modifier = Modifier.size(48.dp).noRippleClickable(onClick = onOpenManager),
                    contentAlignment = Alignment.Center,
                ) {
                    StrokeSvgIcon(
                        AppIconPaths.Gear,
                        appearance.mobileText,
                        modifier = Modifier.rotate(gearRotation),
                        iconSize = 25.dp,
                        strokeWidth = 1.75f,
                    )
                }
            }
        },
    )
}

@Composable
internal fun EmptyVariableRootGuide(
    appearance: AppearanceTheme,
    onCreateRoot: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxWidth().height(420.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.ViewList,
                contentDescription = null,
                tint = appearance.mobileMuted.copy(alpha = 0.55f),
                modifier = Modifier.size(42.dp),
            )
            Text(
                "还没有变量组",
                color = appearance.mobileText,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(top = 10.dp),
            )
            Text(
                "从零创建第一个变量组",
                color = appearance.mobileMuted,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 4.dp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(
                modifier = Modifier
                    .padding(top = 16.dp)
                    .height(38.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(appearance.mobileBlue)
                    .noRippleClickable(onClick = onCreateRoot)
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StrokeSvgIcon(
                    AppIconPaths.Plus,
                    appearance.mobileSurface,
                    iconSize = 16.dp,
                    strokeWidth = 1.8f,
                )
                Text(
                    "新建变量组",
                    color = appearance.mobileSurface,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
    }
}

@Composable
internal fun EmptyVariableSearchResult(appearance: AppearanceTheme) {
    Box(
        modifier = Modifier.fillMaxWidth().height(260.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text("没有找到匹配的变量", color = appearance.mobileMuted, fontSize = 14.sp)
    }
}

internal fun Modifier.clearVariableTreeSelectionOnBlankTap(
    enabled: Boolean,
    onClear: () -> Unit,
): Modifier {
    if (!enabled) return this
    return pointerInput(onClear) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false)
            val up = waitForUpOrCancellation()
            if (up != null && !down.isConsumed && !up.isConsumed) onClear()
        }
    }
}

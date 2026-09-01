package com.eleckoi.android.feature.characters.ui.list

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.characters.model.CharacterSlot
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.AvatarCircle
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.mobileRootBackdropSample
import com.eleckoi.android.foundation.design.components.themedListRowClickable

@Composable
internal fun CharacterGroupHeader(
    title: String,
    count: Int,
    appearance: AppearanceTheme,
    collapsed: Boolean,
    modifier: Modifier = Modifier,
    trailingText: String? = null,
    clickEnabled: Boolean = true,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(46.dp)
            .mobileRootBackdropSample(appearance)
            .characterHeaderTap(enabled = clickEnabled, onClick = onClick)
            .padding(start = 17.dp, end = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StrokeSvgIcon(
            paths = AppIconPaths.ChevronRight,
            color = appearance.mobileSoft,
            iconSize = 17.dp,
            strokeWidth = 1.9f,
            modifier = Modifier.graphicsLayer(rotationZ = if (collapsed) 0f else 90f),
        )
        Text(
            "$title ($count)",
            modifier = Modifier.weight(1f).padding(start = 7.dp),
            color = appearance.mobileMuted,
            fontSize = 16.sp,
            fontWeight = FontWeight.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (trailingText != null) {
            Text(trailingText, color = appearance.mobileMuted, fontSize = 11.sp, maxLines = 1)
        }
    }
}

private fun Modifier.characterHeaderTap(
    enabled: Boolean,
    onClick: () -> Unit,
): Modifier = pointerInput(enabled, onClick) {
    awaitEachGesture {
        val down = awaitFirstDown(
            requireUnconsumed = false,
            pass = PointerEventPass.Initial,
        )
        if (!enabled) {
            down.consume()
            do {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                event.changes.forEach { it.consume() }
            } while (event.changes.any { it.pressed })
        } else {
            val touchSlopSquared = viewConfiguration.touchSlop.let { it * it }
            var movedBeyondTap = false
            var releasedAtMillis: Long? = null
            while (releasedAtMillis == null) {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                val delta = change.position - down.position
                if (delta.x * delta.x + delta.y * delta.y > touchSlopSquared) {
                    movedBeyondTap = true
                }
                if (!change.pressed) releasedAtMillis = change.uptimeMillis
            }
            val pressMillis = releasedAtMillis?.minus(down.uptimeMillis)
            if (!movedBeyondTap && pressMillis != null && pressMillis < 320L) {
                onClick()
            }
        }
    }
}

@Composable
internal fun CharacterListRow(
    character: CharacterSlot,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(62.dp)
            .themedListRowClickable(appearance = appearance, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarCircle(characterName(character), 45, 16, appearance, characterAvatar(character))
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 8.dp),
        ) {
            Text(
                characterName(character),
                color = appearance.mobileText,
                fontSize = 17.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                characterSummary(character),
                color = appearance.mobileMuted.copy(alpha = 0.72f),
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        StrokeSvgIcon(AppIconPaths.ChevronRight, appearance.mobileMuted, iconSize = 18.dp)
    }
}

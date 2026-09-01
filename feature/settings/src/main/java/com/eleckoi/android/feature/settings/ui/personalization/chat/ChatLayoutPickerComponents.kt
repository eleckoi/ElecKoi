package com.eleckoi.android.feature.settings.ui.personalization.chat

import com.eleckoi.android.feature.settings.ui.personalization.components.*

import com.eleckoi.android.foundation.design.components.noRippleClickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.preferences.ChatAvatarShape
import com.eleckoi.android.feature.preferences.ChatLayoutMode

// Three miniature layout diagrams, stacked rather than side by side. Abreast they leave about a
// hundred dp per card, which fits the drawing but squeezes the名字 and leaves no room at all for the
// line that says what the mode is for.
@Composable
internal fun LayoutModePicker(
    selected: ChatLayoutMode,
    appearance: AppearanceTheme,
    onSelect: (ChatLayoutMode) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ChatLayoutMode.entries.forEach { mode ->
            LayoutModeOption(
                mode = mode,
                selected = mode == selected,
                appearance = appearance,
                onClick = { onSelect(mode) },
            )
        }
    }
}

@Composable
private fun LayoutModeOption(
    mode: ChatLayoutMode,
    selected: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .border(
                width = if (selected) 1.5.dp else 0.5.dp,
                color = if (selected) appearance.mobileText else appearance.mobileLine,
                shape = shape,
            )
            .noRippleClickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(width = 40.dp, height = 32.dp),
            contentAlignment = Alignment.Center,
        ) {
            LayoutModeDiagram(mode, appearance)
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 13.dp),
        ) {
            Text(
                mode.label,
                color = if (selected) appearance.mobileText else appearance.mobileMuted,
                fontSize = 14.sp,
                fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
            )
            Text(
                mode.blurb,
                color = appearance.mobileSoft,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        if (selected) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = null,
                tint = appearance.mobileText,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun LayoutModeDiagram(mode: ChatLayoutMode, appearance: AppearanceTheme) {
    when (mode) {
        ChatLayoutMode.Social -> Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            DiagramDot(11.dp, appearance)
            DiagramBar(Modifier.width(21.dp).height(18.dp), appearance)
        }

        ChatLayoutMode.Agent -> Column {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                DiagramDot(9.dp, appearance)
                DiagramBar(Modifier.width(17.dp).height(3.dp), appearance)
            }
            Spacer(modifier = Modifier.height(4.dp))
            DiagramBar(Modifier.width(38.dp).height(14.dp), appearance)
        }

        // Bare rules instead of a filled block: the absence of a bubble is the whole point, and a
        // filled block would draw the one thing this mode does not have.
        ChatLayoutMode.Roleplay -> Row(verticalAlignment = Alignment.Top) {
            Box(
                modifier = Modifier
                    .size(width = 12.dp, height = 16.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(appearance.mobileSoft),
            )
            Column(
                modifier = Modifier.padding(start = 5.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                DiagramBar(Modifier.width(14.dp).height(3.dp), appearance)
                DiagramBar(Modifier.width(23.dp).height(2.dp), appearance)
                DiagramBar(Modifier.width(19.dp).height(2.dp), appearance)
            }
        }
    }
}

// Seamless runs the turns together and lets the gap separate them; card puts each turn on its own
// panel. Both are the roleplay layout — the difference is only whether the turn has a floor.
@Composable
internal fun MessagePanelPicker(
    cardPanel: Boolean,
    appearance: AppearanceTheme,
    onSelect: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        BubbleShapeOption(
            label = "无缝",
            selected = !cardPanel,
            appearance = appearance,
            modifier = Modifier.weight(1f),
            onClick = { onSelect(false) },
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                DiagramBar(Modifier.width(46.dp).height(3.dp), appearance)
                DiagramBar(Modifier.width(34.dp).height(2.dp), appearance)
                Spacer(modifier = Modifier.height(3.dp))
                DiagramBar(Modifier.width(46.dp).height(3.dp), appearance)
                DiagramBar(Modifier.width(29.dp).height(2.dp), appearance)
            }
        }
        BubbleShapeOption(
            label = "卡片",
            selected = cardPanel,
            appearance = appearance,
            modifier = Modifier.weight(1f),
            onClick = { onSelect(true) },
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                DiagramBar(Modifier.width(46.dp).height(13.dp), appearance)
                DiagramBar(Modifier.width(46.dp).height(13.dp), appearance)
            }
        }
    }
}

@Composable
internal fun AvatarShapePicker(
    selected: ChatAvatarShape,
    layoutMode: ChatLayoutMode,
    appearance: AppearanceTheme,
    onSelect: (ChatAvatarShape) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        ChatAvatarShape.entries.forEach { shape ->
            val supported = shape.isSupportedBy(layoutMode)
            BubbleShapeOption(
                label = shape.label,
                selected = supported && shape == selected,
                appearance = appearance,
                dimmed = !supported,
                modifier = Modifier.weight(1f),
                onClick = { if (supported) onSelect(shape) },
            ) {
                val width = if (shape == ChatAvatarShape.Portrait) 17.dp else 22.dp
                Box(
                    modifier = Modifier
                        .size(width = width, height = shape.heightFor(width))
                        .clip(shape.shape(width))
                        .background(if (supported) appearance.mobileSoft else appearance.mobileLine),
                )
            }
        }
    }
    if (!selected.isSupportedBy(layoutMode) || !ChatAvatarShape.Portrait.isSupportedBy(layoutMode)) {
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            "竖着的圆角矩形只有角色扮演布局能用——它比一行文字高出三分之一，" +
                "另外两种布局的行会被撑开。",
            color = appearance.mobileSoft,
            fontSize = 12.sp,
            lineHeight = 17.sp,
        )
    }
}

private val ChatRowIconSize = 19.dp
private val ChatRowIconGap = 12.dp

@Composable
private fun ChatRowIcon(icon: ImageVector, tint: Color) {
    Icon(
        imageVector = icon,
        contentDescription = null,
        tint = tint,
        modifier = Modifier
            .padding(end = ChatRowIconGap)
            .size(ChatRowIconSize),
    )
}

@Composable
internal fun ChatEntryRow(
    title: String,
    icon: ImageVector,
    value: String,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .noRippleClickable(onClick = onClick)
            .padding(vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ChatRowIcon(icon, appearance.mobileMuted)
        Text(title, color = appearance.mobileText, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
        Text(value, color = appearance.mobileSoft, fontSize = 13.sp)
        Icon(
            imageVector = Icons.Rounded.ChevronRight,
            contentDescription = null,
            tint = appearance.mobileSoft,
            modifier = Modifier
                .padding(start = 6.dp)
                .size(17.dp),
        )
    }
}

@Composable
internal fun ChatToggleRow(
    title: String,
    icon: ImageVector,
    checked: Boolean,
    appearance: AppearanceTheme,
    onCheckedChange: (Boolean) -> Unit,
    subtitle: String? = null,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .toggleable(
                value = checked,
                interactionSource = interactionSource,
                indication = null,
                role = Role.Switch,
                onValueChange = onCheckedChange,
            )
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ChatRowIcon(icon, appearance.mobileMuted)
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = appearance.mobileText, fontSize = 14.5.sp)
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    color = appearance.mobileSoft,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    modifier = Modifier.padding(top = 2.dp, end = 12.dp),
                )
            }
        }
        Switch(
            checked = checked,
            onCheckedChange = null,
            colors = SwitchDefaults.colors(
                checkedThumbColor = appearance.mobileSurface,
                checkedTrackColor = appearance.mobileText,
                checkedBorderColor = appearance.mobileText,
                uncheckedThumbColor = appearance.mobileSurface,
                uncheckedTrackColor = appearance.mobileLine,
                uncheckedBorderColor = appearance.mobileLine,
            ),
        )
    }
}

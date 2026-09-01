package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryOpeningMessage
import com.eleckoi.android.feature.characters.modes.story.ui.shared.PlainInput
import com.eleckoi.android.feature.characters.modes.story.ui.shared.storyEditorPalette
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.AppInsetTextField
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.focusDismissInputRegion
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.fieldPalette

private val OpeningCardShape = RoundedCornerShape(18.dp)

@Composable
internal fun OpeningHeaderRow(
    title: String,
    subtitle: String,
    expanded: Boolean,
    appearance: AppearanceTheme,
    onToggle: () -> Unit,
    titleStyle: TextStyle = TextStyle(
        fontSize = 14.sp,
        fontWeight = FontWeight.Medium,
    ),
    trailing: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 66.dp)
            .semantics {
                role = Role.Button
                contentDescription = if (expanded) "收起$title" else "展开$title"
            }
            .noRippleClickable(onClick = onToggle)
            .padding(start = 6.dp, end = 10.dp, top = 9.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(44.dp),
            contentAlignment = Alignment.Center,
        ) {
            StrokeSvgIcon(
                paths = if (expanded) AppIconPaths.ChevronDown else AppIconPaths.ChevronRight,
                color = appearance.mobileMuted,
                iconSize = 18.dp,
                strokeWidth = 1.8f,
            )
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(end = 8.dp),
        ) {
            Text(
                text = title,
                color = appearance.mobileText,
                style = titleStyle,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subtitle,
                color = appearance.mobileMuted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        trailing()
    }
}

@Composable
internal fun OpeningOrderAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
    enabled: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    val clickModifier = if (enabled) {
        Modifier.noRippleClickable(onClick = onClick)
    } else {
        Modifier
    }
    Box(
        modifier = Modifier
            .size(40.dp)
            .semantics {
                role = Role.Button
                contentDescription = description
                if (!enabled) disabled()
            }
            .then(clickModifier),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (enabled) appearance.mobileText else appearance.mobileMuted.copy(alpha = 0.28f),
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
internal fun OpeningEditorVisibility(
    visible: Boolean,
    content: @Composable () -> Unit,
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn() + expandVertically(expandFrom = Alignment.Top),
        exit = fadeOut() + shrinkVertically(shrinkTowards = Alignment.Top),
    ) {
        content()
    }
}

@Composable
internal fun OpeningEditorContent(
    message: SettingLibraryOpeningMessage,
    canDelete: Boolean,
    appearance: AppearanceTheme,
    onTitleChange: (String) -> Unit,
    onContentChange: (String) -> Unit,
    onDuplicate: () -> Unit,
    onDelete: () -> Unit,
) {
    val field = appearance.fieldPalette()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .focusDismissInputRegion(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, top = 3.dp),
        ) {
            Text(
                text = "开场白名称",
                color = appearance.mobileText.copy(alpha = 0.72f),
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            AppInsetTextField(
                value = message.title,
                onValueChange = onTitleChange,
                appearance = appearance,
                placeholder = "填写便于识别的名称",
                modifier = Modifier.height(46.dp),
                shape = RoundedCornerShape(10.dp),
                textStyle = TextStyle(
                    color = field.text,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Normal,
                ),
            )
        }
        PlainInput(
            label = "开场白正文",
            value = message.content,
            appearance = appearance,
            minHeight = 300,
            placeholder = "填写角色发出的第一条消息",
            immersiveTitle = "开场白正文",
            groupedStyle = true,
            embeddedInParentCard = true,
            footerActions = {
                OpeningFooterIconAction(
                    icon = Icons.Rounded.ContentCopy,
                    description = "复制一份",
                    tint = appearance.mobileMuted,
                    onClick = onDuplicate,
                )
                if (canDelete) {
                    OpeningFooterIconAction(
                        icon = Icons.Rounded.DeleteOutline,
                        description = "删除开场白",
                        tint = ElecKoiDanger,
                        onClick = onDelete,
                    )
                }
            },
            onChange = onContentChange,
        )
    }
}

@Composable
internal fun OpeningFooterIconAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
    tint: androidx.compose.ui.graphics.Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .semantics {
                role = Role.Button
                contentDescription = description
            }
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(19.dp),
        )
    }
}

@Composable
internal fun Modifier.openingCardSurface(appearance: AppearanceTheme): Modifier {
    return shadow(
        elevation = 2.dp,
        shape = OpeningCardShape,
        ambientColor = appearance.mobileText.copy(alpha = 0.08f),
        spotColor = appearance.mobileText.copy(alpha = 0.08f),
    )
        .clip(OpeningCardShape)
        .background(appearance.storyEditorPalette().cardFace)
}


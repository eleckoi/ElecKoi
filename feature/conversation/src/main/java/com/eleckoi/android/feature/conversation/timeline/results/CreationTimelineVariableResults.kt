package com.eleckoi.android.feature.conversation.timeline.results

import com.eleckoi.android.feature.conversation.timeline.*
import com.eleckoi.android.feature.conversation.timeline.components.*

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun VariableEntriesResultBlock(
    item: CreationTimelineItem,
    entries: List<VariableEntryToolResult>,
    appearance: AppearanceTheme,
) {
    var expandedPaths by remember(item.id) { mutableStateOf(emptySet<String>()) }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(
            text = if (entries.size == 1) "变量" else "变量 · ${entries.size} 个",
            color = appearance.mobileMuted,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
        )
        entries.forEach { entry ->
            val expanded = entry.path in expandedPaths
            Surface(
                modifier = if (expanded) {
                    Modifier.fillMaxWidth()
                } else {
                    Modifier
                        .fillMaxWidth()
                        .height(VariableEntryCollapsedHeight)
                },
                shape = RoundedCornerShape(14.dp),
                color = appearance.mobileSearchBg,
                border = BorderStroke(
                    width = 0.7.dp,
                    color = appearance.mobileMuted.copy(alpha = 0.15f),
                ),
            ) {
                Column {
                    val contentModifier = if (expanded) Modifier else Modifier.weight(1f)
                    Column(
                        modifier = contentModifier.padding(horizontal = 14.dp, vertical = 13.dp),
                        verticalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = entry.path.variableDisplayName(),
                                modifier = Modifier.weight(1f),
                                color = appearance.mobileText,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (entry.type.isNotBlank()) {
                                Text(
                                    text = entry.type,
                                    color = appearance.mobileMuted,
                                    fontSize = 12.sp,
                                )
                            }
                        }
                        Text(
                            text = entry.path,
                            color = appearance.mobileMuted,
                            fontSize = 12.sp,
                            maxLines = if (expanded) 2 else 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        VariableValueField(
                            label = "当前值",
                            value = entry.currentValue ?: "未返回",
                            expanded = expanded,
                            appearance = appearance,
                        )
                        if (expanded) {
                            entry.defaultValue?.let { defaultValue ->
                                VariableValueField(
                                    label = "默认值",
                                    value = defaultValue,
                                    expanded = true,
                                    appearance = appearance,
                                )
                            }
                            if (entry.description.isNotBlank()) {
                                VariableValueField(
                                    label = "说明",
                                    value = entry.description,
                                    expanded = true,
                                    appearance = appearance,
                                )
                            }
                            if (entry.updateRule.isNotBlank()) {
                                VariableValueField(
                                    label = "更新规则",
                                    value = entry.updateRule,
                                    expanded = true,
                                    appearance = appearance,
                                )
                            }
                        }
                    }
                    HorizontalDivider(color = appearance.mobileMuted.copy(alpha = 0.12f))
                    ResultCardExpandAction(
                        expanded = expanded,
                        collapsedLabel = "展开字段",
                        expandedLabel = "收起字段",
                        appearance = appearance,
                        onClick = {
                            expandedPaths = if (expanded) {
                                expandedPaths - entry.path
                            } else {
                                expandedPaths + entry.path
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun VariableValueField(
    label: String,
    value: String,
    expanded: Boolean,
    appearance: AppearanceTheme,
) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(
            text = label,
            color = appearance.mobileMuted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
        Text(
            text = value,
            modifier = Modifier.fillMaxWidth(),
            color = appearance.mobileText,
            fontSize = 13.sp,
            lineHeight = 19.sp,
            maxLines = if (expanded) Int.MAX_VALUE else 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun ResultCardExpandAction(
    expanded: Boolean,
    collapsedLabel: String,
    expandedLabel: String,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(ResultCardActionHeight)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (expanded) expandedLabel else collapsedLabel,
            color = appearance.mobileBlue,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Medium,
        )
        Spacer(modifier = Modifier.width(3.dp))
        Icon(
            imageVector = Icons.Rounded.ExpandMore,
            contentDescription = null,
            modifier = Modifier
                .size(18.dp)
                .graphicsLayer { rotationZ = if (expanded) 180f else 0f },
            tint = appearance.mobileBlue,
        )
    }
}

private fun String.variableDisplayName(): String =
    substringAfterLast('/').ifBlank { this }
        .replace("~1", "/")
        .replace("~0", "~")

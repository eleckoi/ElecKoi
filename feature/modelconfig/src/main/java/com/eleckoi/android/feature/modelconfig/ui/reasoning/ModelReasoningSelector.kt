package com.eleckoi.android.feature.modelconfig.ui.reasoning

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.engine.generation.reasoning.DshReasoningEffortOption
import com.eleckoi.android.engine.generation.reasoning.DshReasoningEfforts
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun ModelReasoningSelector(
    variants: List<DshReasoningEffortOption>,
    selectedVariant: String?,
    appearance: AppearanceTheme,
    onSelect: (String?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val current = variants.firstOrNull { it.id == selectedVariant }
    Box(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .noRippleClickable { expanded = true }
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Text(
                "推理强度",
                color = appearance.mobileMuted,
                fontSize = 11.sp,
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    current?.label ?: DshReasoningEfforts.label(null),
                    modifier = Modifier.weight(1f),
                    color = if (current == null) appearance.mobileSoft else appearance.mobileText,
                    fontSize = 15.sp,
                )
                StrokeSvgIcon(
                    AppIconPaths.ChevronRight,
                    appearance.mobileSoft,
                    iconSize = 16.dp,
                )
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            ReasoningVariantMenuItem(
                label = DshReasoningEfforts.label(null),
                selected = selectedVariant.isNullOrBlank() || current == null,
                appearance = appearance,
            ) {
                expanded = false
                onSelect(null)
            }
            variants.forEach { variant ->
                ReasoningVariantMenuItem(
                    label = variant.label,
                    selected = variant.id == current?.id,
                    appearance = appearance,
                ) {
                    expanded = false
                    onSelect(variant.id)
                }
            }
        }
    }
}

@Composable
private fun ReasoningVariantMenuItem(
    label: String,
    selected: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    DropdownMenuItem(
        text = {
            Text(
                label,
                color = if (selected) appearance.mobileBlue else appearance.mobileText,
                fontSize = 14.sp,
            )
        },
        onClick = onClick,
    )
}

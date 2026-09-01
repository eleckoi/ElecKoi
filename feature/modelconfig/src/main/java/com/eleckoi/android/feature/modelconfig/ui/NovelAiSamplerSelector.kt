package com.eleckoi.android.feature.modelconfig.ui

import androidx.compose.foundation.layout.Box
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
import com.eleckoi.android.engine.generation.model.NovelAiSamplerCatalog
import com.eleckoi.android.engine.generation.model.NovelAiSamplerOption
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun NovelAiSamplerSelector(
    selectedApiValue: String,
    appearance: AppearanceTheme,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val current = NovelAiSamplerCatalog.optionFor(selectedApiValue)

    Box(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .noRippleClickable { expanded = true }
                .padding(horizontal = 14.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "采样器",
                modifier = Modifier.weight(1f),
                color = appearance.mobileText,
                fontSize = 15.sp,
            )
            Text(
                text = current.displayName,
                color = appearance.mobileText,
                fontSize = 15.sp,
            )
            StrokeSvgIcon(
                AppIconPaths.ChevronRight,
                appearance.mobileSoft,
                iconSize = 15.dp,
            )
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            NovelAiSamplerCatalog.options.forEach { option ->
                NovelAiSamplerMenuItem(
                    option = option,
                    selected = option.apiValue == current.apiValue,
                    appearance = appearance,
                    onClick = {
                        expanded = false
                        onSelect(option.apiValue)
                    },
                )
            }
        }
    }
}

@Composable
private fun NovelAiSamplerMenuItem(
    option: NovelAiSamplerOption,
    selected: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    DropdownMenuItem(
        text = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = option.displayName,
                    modifier = Modifier.weight(1f),
                    color = if (selected) appearance.mobileBlue else appearance.mobileText,
                    fontSize = 14.sp,
                )
                if (selected) {
                    Text(
                        text = "当前",
                        color = appearance.mobileBlue,
                        fontSize = 11.sp,
                    )
                }
            }
        },
        onClick = onClick,
    )
}

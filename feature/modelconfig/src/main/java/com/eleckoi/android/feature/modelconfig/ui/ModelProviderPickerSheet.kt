package com.eleckoi.android.feature.modelconfig.ui

import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.MobileBottomSheetOverlay
import com.eleckoi.android.foundation.design.components.ModelProviderIcon
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
fun ModelProviderPickerSheet(
    visible: Boolean,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
) {
    MobileBottomSheetOverlay(
        visible = visible,
        appearance = appearance,
        onDismiss = onDismiss,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().height(58.dp).padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "添加模型",
                modifier = Modifier.weight(1f),
                color = appearance.mobileText,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Box(
                modifier = Modifier.size(44.dp).noRippleClickable(onClick = onDismiss),
                contentAlignment = Alignment.Center,
            ) {
                StrokeSvgIcon(AppIconPaths.X, appearance.mobileMuted, iconSize = 20.dp)
            }
        }
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
            addableModelProviders.forEachIndexed { index, provider ->
                if (index == 0 || addableModelProviders[index - 1].section != provider.section) {
                    Text(
                        text = modelLibrarySections.first { it.id == provider.section }.title,
                        modifier = Modifier.padding(start = 20.dp, top = 8.dp, bottom = 4.dp),
                        color = appearance.mobileMuted,
                        fontSize = 11.sp,
                    )
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(64.dp)
                        .noRippleClickable { onSelect(provider.id) }
                        .padding(horizontal = 20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ModelProviderIcon(
                        providerId = provider.id,
                        initials = provider.initials,
                        appearance = appearance,
                        modifier = Modifier.size(36.dp),
                    )
                    Text(
                        provider.label,
                        modifier = Modifier.weight(1f).padding(start = 14.dp),
                        color = appearance.mobileText,
                        fontSize = 16.sp,
                    )
                    StrokeSvgIcon(
                        AppIconPaths.ChevronRight,
                        appearance.mobileSoft,
                        iconSize = 17.dp,
                    )
                }
            }
        }
    }
}

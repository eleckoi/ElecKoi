package com.eleckoi.android.feature.characters.modes.story.regex.ui.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleScope
import com.eleckoi.android.feature.characters.modes.story.regex.ui.presentation.importIcon
import com.eleckoi.android.feature.characters.modes.story.regex.ui.presentation.sectionHint
import com.eleckoi.android.feature.characters.modes.story.regex.ui.presentation.sectionTitle
import com.eleckoi.android.feature.characters.modes.story.ui.shared.storyEditorPalette
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.FilledSvgIcon
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
internal fun RegexScopePickerDialog(
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onPick: (RegexRuleScope) -> Unit,
) {
    val palette = appearance.storyEditorPalette()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("选择导入范围", color = appearance.mobileText, fontWeight = FontWeight.SemiBold)
                Text(
                    "可在下一步一次选择多个 JSON 文件",
                    color = appearance.mobileMuted,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.Normal,
                )
            }
        },
        text = {
            val groupShape = RoundedCornerShape(18.dp)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(groupShape)
                    .background(palette.pageBg),
            ) {
                RegexRuleScope.entries.forEachIndexed { index, scope ->
                    if (index > 0) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(start = 70.dp, end = 14.dp)
                                .height(0.5.dp)
                                .background(appearance.mobileLine.copy(alpha = 0.32f)),
                        )
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(72.dp)
                            .noRippleClickable { onPick(scope) }
                            .padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(appearance.mobileBlue.copy(alpha = 0.09f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (scope == RegexRuleScope.PromptPreset) {
                                FilledSvgIcon(
                                    paths = AppIconPaths.PromptMarkerThumbTack,
                                    color = appearance.mobileBlue,
                                    iconSize = 19.dp,
                                    viewportSize = 512f,
                                )
                            } else {
                                StrokeSvgIcon(
                                    scope.importIcon(),
                                    appearance.mobileBlue,
                                    iconSize = 20.dp,
                                    strokeWidth = 1.75f,
                                )
                            }
                        }
                        Column(
                            modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(3.dp),
                        ) {
                            Text(
                                scope.sectionTitle(),
                                color = appearance.mobileText,
                                fontSize = 14.5.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(scope.sectionHint(), color = appearance.mobileMuted, fontSize = 11.5.sp)
                        }
                        StrokeSvgIcon(
                            AppIconPaths.ChevronRight,
                            appearance.mobileMuted,
                            iconSize = 17.dp,
                            strokeWidth = 1.8f,
                        )
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
        containerColor = appearance.mobileSurface,
        titleContentColor = appearance.mobileText,
    )
}

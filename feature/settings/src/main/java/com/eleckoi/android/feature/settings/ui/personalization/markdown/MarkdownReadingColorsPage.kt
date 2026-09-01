package com.eleckoi.android.feature.settings.ui.personalization.markdown

import com.eleckoi.android.feature.settings.ui.personalization.components.*

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.markdownReadingColors

/** Chat-reading controls for the colours that carry meaning inside Markdown replies. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MarkdownReadingColorsPage(
    appearance: AppearanceTheme,
    previewAppearance: AppearanceTheme,
    onSave: (AppearanceTheme) -> Unit,
    onBack: () -> Unit,
) {
    var editing by remember { mutableStateOf<MarkdownReadingColorRole?>(null) }
    val resolved = previewAppearance.markdownReadingColors(isUser = false)

    BackHandler(onBack = onBack)
    androidx.compose.material3.Scaffold(
        containerColor = appearance.mobileBg,
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text("阅读文字颜色", fontWeight = FontWeight.SemiBold, color = appearance.mobileText)
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "返回",
                            tint = appearance.mobileText,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = appearance.mobileBg),
            )
        },
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            ReadingColorPreview(appearance = previewAppearance)
            ReadingColorGroup(
                title = "文本格式",
                roles = listOf(
                    MarkdownReadingColorRole.Italic,
                    MarkdownReadingColorRole.Underline,
                    MarkdownReadingColorRole.Quote,
                    MarkdownReadingColorRole.InlineCode,
                ),
                appearance = appearance,
                resolved = resolved,
                onEdit = { editing = it },
            )
            ReadingColorGroup(
                title = "代码块",
                roles = listOf(
                    MarkdownReadingColorRole.CodeForeground,
                    MarkdownReadingColorRole.CodeBackground,
                ),
                appearance = appearance,
                resolved = resolved,
                onEdit = { editing = it },
            )
            Spacer(Modifier.height(10.dp))
        }
    }

    editing?.let { role ->
        ReadingColorPickerDialog(
            role = role,
            initial = role.overrideIn(appearance.markdownReadingColors) ?: role.resolvedIn(resolved),
            followsTheme = role.overrideIn(appearance.markdownReadingColors) == null,
            appearance = appearance,
            onDismiss = { editing = null },
            onFollowTheme = {
                onSave(appearance.withMarkdownReadingColor(role, null))
                editing = null
            },
            onSave = { color ->
                onSave(appearance.withMarkdownReadingColor(role, color))
                editing = null
            },
        )
    }
}

@Composable
private fun ReadingColorPreview(appearance: AppearanceTheme) {
    val colors = appearance.markdownReadingColors(isUser = false)
    val codeBorder = if (colors.codeBackground.luminance() < 0.5f) {
        Color.White.copy(alpha = 0.18f)
    } else {
        Color.Black.copy(alpha = 0.16f)
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(appearance.mobileChatMessageBg)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Text("普通叙述文字", color = colors.text, fontSize = 15.sp)
        Text("斜体描写", color = colors.italic, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, fontSize = 15.sp)
        Text("下划线强调", color = colors.underline, textDecoration = TextDecoration.Underline, fontSize = 15.sp)
        Text("“中文引用”与 \"English quote\"", color = colors.quote, fontSize = 15.sp)
        Text("行内代码", color = colors.inlineCode, fontFamily = FontFamily.Monospace, fontSize = 14.sp)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .border(Dp.Hairline, codeBorder, RoundedCornerShape(8.dp))
                .background(colors.codeBackground)
                .padding(horizontal = 10.dp, vertical = 8.dp),
        ) {
            Text("val story = \"继续\"", color = colors.codeForeground, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
        }
    }
}

@Composable
private fun ReadingColorGroup(
    title: String,
    roles: List<MarkdownReadingColorRole>,
    appearance: AppearanceTheme,
    resolved: com.eleckoi.android.foundation.design.MarkdownReadingColors,
    onEdit: (MarkdownReadingColorRole) -> Unit,
) {
    Column {
        Text(title, color = appearance.mobileMuted, fontSize = 12.sp, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(appearance.mobileSurface),
        ) {
            roles.forEachIndexed { index, role ->
                ReadingColorRow(
                    role = role,
                    color = role.resolvedIn(resolved),
                    overridden = role.overrideIn(appearance.markdownReadingColors) != null,
                    appearance = appearance,
                    onClick = { onEdit(role) },
                )
                if (index != roles.lastIndex) {
                    HorizontalDivider(modifier = Modifier.padding(start = 16.dp), color = appearance.mobileLine)
                }
            }
        }
    }
}

@Composable
private fun ReadingColorRow(
    role: MarkdownReadingColorRole,
    color: Color,
    overridden: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(color)
                .border(1.dp, appearance.mobileLine, CircleShape),
        )
        Column(modifier = Modifier.padding(start = 12.dp).weight(1f)) {
            Text(role.label, color = appearance.mobileText, fontSize = 15.sp)
            Text(
                if (overridden) "自定义颜色 · ${color.hex()}" else "主题自动颜色 · ${color.hex()}",
                color = appearance.mobileSoft,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        Text("编辑", color = appearance.mobileBlue, fontSize = 13.sp)
    }
}


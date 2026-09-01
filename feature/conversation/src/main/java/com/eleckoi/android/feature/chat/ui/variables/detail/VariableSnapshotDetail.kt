package com.eleckoi.android.feature.chat.ui.variables

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selectableGroup
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.noRippleClickable
import kotlinx.serialization.json.JsonElement

@Composable
internal fun VariableSnapshotDetail(
    title: String,
    subtitle: String,
    document: VariableStateDocument,
    changedPaths: Set<String>,
    changesAvailable: Boolean,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
) {
    val expandedPaths = remember(document.rawJson) { mutableStateMapOf<String, Boolean>() }
    var viewMode by rememberSaveable(document.rawJson, changesAvailable) {
        mutableStateOf(if (changesAvailable) VariableViewMode.Changes else VariableViewMode.All)
    }
    var focusStack by remember(document.rawJson) { mutableStateOf(emptyList<VariableFocus>()) }
    val focus = focusStack.lastOrNull()
    val detailBack = {
        if (focusStack.isNotEmpty()) focusStack = focusStack.dropLast(1) else onBack()
    }
    BackHandler(enabled = focusStack.isNotEmpty(), onBack = detailBack)

    val visiblePaths = if (viewMode == VariableViewMode.Changes) changedPaths else null
    val treeRoot: JsonElement? = focus?.value ?: document.root
    val rows = treeRoot?.let { root ->
        flattenVariableTree(
            root = root,
            basePath = focus?.path.orEmpty(),
            baseBreadcrumb = focus?.breadcrumb.orEmpty(),
            expandedPaths = expandedPaths,
            visiblePaths = visiblePaths,
            changedPaths = changedPaths,
        )
    }.orEmpty()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(appearance.mobileBg),
    ) {
        VariableViewerHeader(
            title = focus?.name ?: title,
            appearance = appearance,
            onBack = detailBack,
        )
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 8.dp, bottom = 10.dp),
        ) {
            if (focus != null) {
                item(key = "focus_breadcrumb") {
                    Text(
                        text = focus.breadcrumb.joinToString(" / "),
                        color = appearance.mobileMuted,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(
                            start = VariableViewerHorizontalPadding,
                            end = VariableViewerHorizontalPadding,
                            bottom = 12.dp,
                        ),
                    )
                }
            } else if (subtitle.isNotBlank()) {
                item(key = "floor_preview") {
                    Text(
                        text = subtitle,
                        color = appearance.mobileText,
                        fontSize = 14.sp,
                        lineHeight = 21.sp,
                        modifier = Modifier.padding(
                            start = VariableViewerHorizontalPadding,
                            end = VariableViewerHorizontalPadding,
                            top = 4.dp,
                            bottom = 14.dp,
                        ),
                    )
                }
            }
            if (focus == null && changesAvailable) {
                item(key = "view_switcher") {
                    VariableViewSwitcher(
                        selectedMode = viewMode,
                        appearance = appearance,
                        onSelect = { selectedMode ->
                            viewMode = selectedMode
                            expandedPaths.clear()
                            focusStack = emptyList()
                        },
                    )
                }
            }
            when {
                document.errorMessage.isNotBlank() -> item(key = "raw") {
                    SelectionContainer {
                        Text(
                            text = document.rawJson,
                            color = appearance.mobileMuted,
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.padding(
                                horizontal = VariableViewerHorizontalPadding,
                                vertical = 12.dp,
                            ),
                        )
                    }
                }
                rows.isEmpty() -> item(key = "empty") {
                    VariableEmptyMessage(
                        text = if (viewMode == VariableViewMode.Changes) {
                            "本轮没有可显示的新值"
                        } else {
                            "这一份快照没有变量"
                        },
                        appearance = appearance,
                        modifier = Modifier.padding(
                            horizontal = VariableViewerHorizontalPadding,
                            vertical = 28.dp,
                        ),
                    )
                }
                else -> items(rows, key = { it.path }) { row ->
                    VariableTreeRow(
                        row = row,
                        appearance = appearance,
                        onOpen = {
                            if (row.opensFocusedSubtree) {
                                focusStack = focusStack + VariableFocus(
                                    path = row.path,
                                    name = row.name,
                                    value = row.value,
                                    breadcrumb = row.breadcrumb,
                                )
                            } else if (row.container) {
                                expandedPaths[row.path] = !row.expanded
                            }
                        },
                    )
                }
            }
            item(key = "navigation_inset") {
                Spacer(modifier = Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
            }
        }
    }
}

@Composable
private fun VariableViewSwitcher(
    selectedMode: VariableViewMode,
    appearance: AppearanceTheme,
    onSelect: (VariableViewMode) -> Unit,
) {
    val trackShape = RoundedCornerShape(10.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                start = VariableViewerHorizontalPadding,
                end = VariableViewerHorizontalPadding,
                top = 2.dp,
                bottom = 10.dp,
            )
            .height(36.dp)
            .clip(trackShape)
            .background(
                appearance.mobileText.copy(alpha = if (appearance.isDark) 0.16f else 0.07f),
            )
            .padding(2.dp)
            .semantics { selectableGroup() },
    ) {
        VariableViewSegment(
            text = "本轮变化",
            selected = selectedMode == VariableViewMode.Changes,
            appearance = appearance,
            modifier = Modifier.weight(1f),
            onClick = { onSelect(VariableViewMode.Changes) },
        )
        VariableViewSegment(
            text = "全部变量",
            selected = selectedMode == VariableViewMode.All,
            appearance = appearance,
            modifier = Modifier.weight(1f),
            onClick = { onSelect(VariableViewMode.All) },
        )
    }
}

@Composable
private fun VariableViewSegment(
    text: String,
    selected: Boolean,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val segmentShape = RoundedCornerShape(8.dp)
    Box(
        modifier = modifier
            .height(32.dp)
            .clip(segmentShape)
            .background(if (selected) appearance.mobileSurface else Color.Transparent)
            .then(
                if (selected) {
                    Modifier.border(
                        width = 0.5.dp,
                        color = appearance.mobileText.copy(
                            alpha = if (appearance.isDark) 0.20f else 0.10f,
                        ),
                        shape = segmentShape,
                    )
                } else {
                    Modifier
                },
            )
            .semantics {
                this.selected = selected
                role = Role.Tab
                contentDescription = "$text 视图"
            }
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = if (selected) appearance.mobileText else appearance.mobileMuted,
            fontSize = 13.sp,
            lineHeight = 18.sp,
            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
        )
    }
}

private data class VariableFocus(
    val path: String,
    val name: String,
    val value: JsonElement,
    val breadcrumb: List<String>,
)

private enum class VariableViewMode {
    Changes,
    All,
}

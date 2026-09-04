package com.eleckoi.android.feature.agenttools.ui.tools

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Book
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Checklist
import androidx.compose.material.icons.rounded.Extension
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Schema
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.Timeline
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.ModelProviderIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.engine.agent.tools.AgentToolRequestPolicy
import com.eleckoi.android.feature.agenttools.AgentToolsViewModel
import com.eleckoi.android.feature.agenttools.model.PersonalToolGroupEntry
import com.eleckoi.android.feature.agenttools.model.PersonalToolGroupSource
import com.eleckoi.android.feature.agenttools.ui.components.AgentToolSwitch
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSettingsHeader
import com.eleckoi.android.foundation.design.AppearanceTheme

/**
 * Everything one agent scope can call, in one list. Rows carry only a name and a switch: what each
 * tool actually does belongs on the detail page, not in a list the author scans for a switch.
 */
@Composable
fun AgentToolsPage(
    appearance: AppearanceTheme,
    viewModel: AgentToolsViewModel,
    toolScopeId: String,
    title: String = "工具",
    showRootBackButton: Boolean = true,
    onBack: () -> Unit,
    onOpenGroup: (String) -> Unit,
    onOpenWebSearch: () -> Unit,
    onOpenRemoteDsh: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(toolScopeId) {
        viewModel.selectToolScope(toolScopeId)
    }

    val groups = state.groups

    PinnedStatusScaffold(
        appearance = appearance,
        backgroundColor = appearance.mobileBg,
    ) {
        ModelSettingsHeader(title, appearance, onBack.takeIf { showRootBackButton })
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 18.dp, top = 6.dp, end = 18.dp, bottom = 40.dp),
        ) {
            item(key = "groups") {
                ToolCard(appearance) {
                    if (groups.isEmpty()) {
                        Column(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                        ) {
                            Text(
                                text = when {
                                    state.loading -> "正在读取工具"
                                    state.error.isNotBlank() -> "读取工具失败"
                                    else -> "暂时没有可用工具"
                                },
                                color = appearance.mobileMuted,
                                fontSize = 13.sp,
                                lineHeight = 20.sp,
                            )
                            if (state.error.isNotBlank()) {
                                Row(
                                    modifier = Modifier
                                        .height(44.dp)
                                        .noRippleClickable {
                                            viewModel.selectToolScope(toolScopeId)
                                        },
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        text = "重试",
                                        color = appearance.mobileBlue,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Medium,
                                    )
                                }
                            }
                        }
                    } else {
                        groups.forEachIndexed { index, group ->
                            if (index > 0) ToolRowDivider(appearance)
                            ToolGroupRow(
                                group = group,
                                appearance = appearance,
                                onOpen = {
                                    when (group.id) {
                                        AgentToolRequestPolicy.BuiltInWeb -> onOpenWebSearch()
                                        AgentToolRequestPolicy.BuiltInRemoteDsh -> onOpenRemoteDsh()
                                        else -> onOpenGroup(group.id)
                                    }
                                },
                                onEnabledChange = {
                                    viewModel.setPersonalToolGroupEnabled(group.id, it)
                                },
                            )
                        }
                    }
                }
            }

        }
    }
}

@Composable
private fun ToolGroupRow(
    group: PersonalToolGroupEntry,
    appearance: AppearanceTheme,
    onOpen: () -> Unit,
    onEnabledChange: (Boolean) -> Unit,
) {
    val accent = group.accentColor(appearance)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .noRippleClickable(onClick = onOpen)
            .padding(horizontal = 13.dp)
            .height(54.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ToolIcon(
            group = group,
            tint = if (group.enabled) accent else appearance.mobileMuted,
            enabled = group.enabled,
            appearance = appearance,
        )
        Spacer(Modifier.width(11.dp))
        Text(
            text = group.name,
            color = appearance.mobileText,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Icon(
            imageVector = Icons.Rounded.ChevronRight,
            contentDescription = "查看 ${group.name}",
            tint = appearance.mobileSoft.copy(alpha = 0.7f),
            modifier = Modifier.size(19.dp),
        )
        Spacer(Modifier.width(8.dp))
        AgentToolSwitch(
            checked = group.enabled,
            appearance = appearance,
            modifier = Modifier.semantics {
                contentDescription = "${group.name}工具开关"
            },
            onCheckedChange = onEnabledChange,
        )
    }
}

@Composable
private fun ToolIcon(
    group: PersonalToolGroupEntry,
    tint: Color,
    enabled: Boolean,
    appearance: AppearanceTheme,
) {
    Box(
        modifier = Modifier
            .size(30.dp)
            .clip(RoundedCornerShape(9.dp))
            .background(
                if (enabled) tint.copy(alpha = 0.11f) else appearance.mobileText.copy(alpha = 0.055f),
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (group.id == AgentToolRequestPolicy.BuiltInRemoteDsh) {
            ModelProviderIcon(
                providerId = "deepseek",
                initials = "D",
                appearance = appearance,
                modifier = Modifier.size(19.dp),
            )
        } else {
            Icon(
                imageVector = group.icon(),
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(17.dp),
            )
        }
    }
}

@Composable
private fun ToolCard(
    appearance: AppearanceTheme,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(appearance.mobileSurface),
    ) {
        content()
    }
}

@Composable
private fun ToolRowDivider(appearance: AppearanceTheme) {
    HorizontalDivider(
        modifier = Modifier.padding(start = 54.dp),
        thickness = 0.5.dp,
        color = appearance.mobileText.copy(alpha = 0.07f),
    )
}

/** Purple marks a tool the author installed; blue marks one ElecKoi ships. */
internal fun PersonalToolGroupEntry.accentColor(appearance: AppearanceTheme): Color =
    when (source) {
        PersonalToolGroupSource.BuiltIn -> appearance.mobileBlue
        PersonalToolGroupSource.Mcp, PersonalToolGroupSource.Extension -> ToolExtensionPurple
    }

internal fun PersonalToolGroupEntry.icon(): ImageVector = when (id) {
    AgentToolRequestPolicy.BuiltInAutoIllustration -> Icons.Rounded.Image
    AgentToolRequestPolicy.BuiltInCreator -> Icons.Rounded.Extension
    AgentToolRequestPolicy.BuiltInVariables -> Icons.Rounded.Schema
    AgentToolRequestPolicy.BuiltInSettingLibrary -> Icons.Rounded.Book
    AgentToolRequestPolicy.BuiltInRoleplayWorkflow -> Icons.Rounded.Timeline
    AgentToolRequestPolicy.BuiltInWorkflow -> Icons.Rounded.Checklist
    AgentToolRequestPolicy.BuiltInVisual -> Icons.Rounded.Image
    AgentToolRequestPolicy.BuiltInWorkspace -> Icons.Rounded.Terminal
    AgentToolRequestPolicy.BuiltInCollaboration -> Icons.Rounded.Groups
    AgentToolRequestPolicy.BuiltInMcpResources -> Icons.Rounded.Folder
    AgentToolRequestPolicy.BuiltInWeb -> Icons.Rounded.Language
    AgentToolRequestPolicy.BuiltInRemoteDsh -> Icons.Rounded.Storage
    else -> when (source) {
        PersonalToolGroupSource.Mcp -> Icons.Rounded.Storage
        else -> Icons.Rounded.Extension
    }
}

private val ToolExtensionPurple = Color(0xFF7C5CFF)

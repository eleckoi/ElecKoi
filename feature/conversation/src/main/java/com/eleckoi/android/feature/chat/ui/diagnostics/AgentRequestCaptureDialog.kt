package com.eleckoi.android.feature.chat.ui.diagnostics

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.engine.agent.diagnostics.AgentProviderRequestCapture
import com.eleckoi.android.engine.agent.diagnostics.AgentTurnRequestCapture
import com.eleckoi.android.foundation.design.AppearanceTheme
import kotlinx.serialization.json.Json

@Composable
internal fun AgentRequestCaptureDialog(
    turns: List<AgentTurnRequestCapture>,
    captureEnabled: Boolean,
    appearance: AppearanceTheme,
    onCaptureEnabledChange: (Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val orderedTurns = remember(turns) { turns.sortedByDescending { it.startedAtMillis } }
    var selectedTurnId by rememberSaveable { mutableStateOf(orderedTurns.firstOrNull()?.id.orEmpty()) }
    val selectedTurn = orderedTurns.firstOrNull { it.id == selectedTurnId }
        ?: orderedTurns.firstOrNull()
    var selectedRequestId by rememberSaveable(selectedTurn?.id) {
        mutableStateOf(selectedTurn?.requests?.lastOrNull()?.id.orEmpty())
    }
    val selectedRequest = selectedTurn?.requests?.firstOrNull { it.id == selectedRequestId }
        ?: selectedTurn?.requests?.lastOrNull()
    var providerView by rememberSaveable(selectedRequest?.id) { mutableStateOf(true) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = appearance.mobileBg,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .systemBarsPadding(),
            ) {
                RequestViewerTopBar(
                    turnCount = orderedTurns.size,
                    requestCount = orderedTurns.sumOf { it.requests.size },
                    appearance = appearance,
                    onDismiss = onDismiss,
                )
                RequestCaptureSetting(
                    enabled = captureEnabled,
                    appearance = appearance,
                    onEnabledChange = onCaptureEnabledChange,
                )
                when {
                    orderedTurns.isEmpty() -> RequestViewerEmpty(appearance)
                    else -> {
                        LazyRow(
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(orderedTurns, key = AgentTurnRequestCapture::id) { turn ->
                                TurnChip(
                                    turn = turn,
                                    selected = turn.id == selectedTurn?.id,
                                    appearance = appearance,
                                    onClick = {
                                        selectedTurnId = turn.id
                                        selectedRequestId = turn.requests.lastOrNull()?.id.orEmpty()
                                    },
                                )
                            }
                        }
                        selectedTurn?.let { turn ->
                            UserTurnHeader(turn = turn, appearance = appearance)
                            if (turn.requests.isEmpty()) {
                                RequestViewerEmpty(
                                    appearance = appearance,
                                    message = "这个 Turn 还没有发出模型请求",
                                )
                            } else {
                                LazyRow(
                                    modifier = Modifier.fillMaxWidth(),
                                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    items(turn.requests, key = AgentProviderRequestCapture::id) { request ->
                                        RequestChip(
                                            request = request,
                                            selected = request.id == selectedRequest?.id,
                                            appearance = appearance,
                                            onClick = { selectedRequestId = request.id },
                                        )
                                    }
                                }
                                selectedRequest?.let { request ->
                                    RequestStageTabs(
                                        providerView = providerView,
                                        providerAvailable = request.providerRequestBody.isNotBlank(),
                                        auxiliary = request.label.isNotBlank(),
                                        appearance = appearance,
                                        onProviderViewChange = { providerView = it },
                                    )
                                    RequestBody(
                                        body = when {
                                            providerView && request.providerRequestBody.isNotBlank() ->
                                                request.providerRequestBody
                                            else -> request.harnessRequestBody
                                        },
                                        appearance = appearance,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RequestCaptureSetting(
    enabled: Boolean,
    appearance: AppearanceTheme,
    onEnabledChange: (Boolean) -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        color = appearance.mobileInputBg,
        shape = RoundedCornerShape(16.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "记录发送请求",
                    color = appearance.mobileText,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = if (enabled) {
                        "已开启，从下一条消息开始记录；内容仅保留在本次运行中"
                    } else {
                        "当前未记录。开启后从下一条消息开始显示请求"
                    },
                    color = appearance.mobileMuted,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(top = 4.dp, end = 12.dp),
                )
            }
            Switch(
                checked = enabled,
                onCheckedChange = onEnabledChange,
            )
        }
    }
}

@Composable
private fun RequestViewerTopBar(
    turnCount: Int,
    requestCount: Int,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(70.dp)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "发送请求",
            color = appearance.mobileText,
            fontSize = 21.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = "$turnCount 个 Turn · $requestCount 次请求",
            color = appearance.mobileMuted,
            fontSize = 13.sp,
        )
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "关闭",
            color = appearance.mobileBlue,
            fontSize = 15.sp,
            modifier = Modifier
                .padding(8.dp)
                .noRippleClickable(onClick = onDismiss),
        )
    }
    HorizontalDivider(color = appearance.mobileMuted.copy(alpha = 0.14f))
}

@Composable
private fun TurnChip(
    turn: AgentTurnRequestCapture,
    selected: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(13.dp),
        color = if (selected) {
            appearance.mobileBlue.copy(alpha = 0.12f)
        } else {
            appearance.mobileInputBg
        },
        modifier = Modifier.noRippleClickable(onClick = onClick),
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp)) {
            Text(
                text = "Turn",
                color = if (selected) appearance.mobileBlue else appearance.mobileText,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "${turn.requests.size} 次请求",
                color = appearance.mobileMuted,
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun UserTurnHeader(
    turn: AgentTurnRequestCapture,
    appearance: AppearanceTheme,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
    ) {
        Text(
            text = "用户消息",
            color = appearance.mobileMuted,
            fontSize = 12.sp,
        )
        Text(
            text = turn.userMessage,
            color = appearance.mobileText,
            fontSize = 15.sp,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 4.dp),
        )
        if (turn.runtimeTurnId.isNotBlank()) {
            Text(
                text = "Harness Turn：${turn.runtimeTurnId}",
                color = appearance.mobileMuted,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun RequestChip(
    request: AgentProviderRequestCapture,
    selected: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (selected) {
            appearance.mobileBlue.copy(alpha = 0.12f)
        } else {
            appearance.mobileInputBg
        },
        modifier = Modifier.noRippleClickable(onClick = onClick),
    ) {
        Text(
            text = buildString {
                append("请求 ${request.index}")
                request.label.takeIf(String::isNotBlank)?.let { append(" · $it") }
            },
            color = if (selected) appearance.mobileBlue else appearance.mobileText,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
        )
    }
}

@Composable
private fun RequestStageTabs(
    providerView: Boolean,
    providerAvailable: Boolean,
    auxiliary: Boolean,
    appearance: AppearanceTheme,
    onProviderViewChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .background(appearance.mobileInputBg, RoundedCornerShape(12.dp))
            .padding(4.dp),
    ) {
        RequestStageTab(
            text = if (auxiliary) "整理后的输入" else "Harness 原始请求",
            selected = !providerView,
            enabled = true,
            appearance = appearance,
            onClick = { onProviderViewChange(false) },
            modifier = Modifier.weight(1f),
        )
        RequestStageTab(
            text = "模型实际请求",
            selected = providerView,
            enabled = providerAvailable,
            appearance = appearance,
            onClick = { onProviderViewChange(true) },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun RequestStageTab(
    text: String,
    selected: Boolean,
    enabled: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .background(
                color = if (selected) appearance.mobileBg else Color.Transparent,
                shape = RoundedCornerShape(9.dp),
            )
            .selectable(
                selected = selected,
                enabled = enabled,
                onClick = onClick,
            )
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = when {
                !enabled -> appearance.mobileMuted.copy(alpha = 0.48f)
                selected -> appearance.mobileText
                else -> appearance.mobileMuted
            },
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun RequestBody(
    body: String,
    appearance: AppearanceTheme,
) {
    val displayBody = remember(body) { readableJson(body) }
    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
    ) {
        item {
            SelectionContainer {
                Text(
                    text = displayBody,
                    color = appearance.mobileText,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            appearance.mobileInputBg,
                            RoundedCornerShape(13.dp),
                        )
                        .padding(14.dp)
                        .horizontalScroll(rememberScrollState()),
                )
            }
        }
    }
}

@Composable
private fun RequestViewerEmpty(
    appearance: AppearanceTheme,
    message: String = "还没有捕获到发送请求",
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = message,
            color = appearance.mobileMuted,
            fontSize = 15.sp,
        )
    }
}

private val PrettyRequestJson = Json {
    prettyPrint = true
    prettyPrintIndent = "  "
}

private fun readableJson(raw: String): String {
    return runCatching {
        PrettyRequestJson.encodeToString(
            kotlinx.serialization.json.JsonElement.serializer(),
            PrettyRequestJson.parseToJsonElement(raw),
        )
    }.getOrDefault(raw)
}

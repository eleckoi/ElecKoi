package com.eleckoi.android.feature.modelconfig.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.AppInsetTextField
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.engine.generation.config.isValidHeaderName
import com.eleckoi.android.foundation.design.overlayScrim

private class HeaderDraft(name: String, value: String) {
    var name by mutableStateOf(name)
    var value by mutableStateOf(value)
}

// Edited as a list of rows rather than raw JSON. Header names have a narrow legal character set, so
// an invalid one is flagged inline here instead of being silently dropped when the request is built.
@Composable
internal fun ModelHeadersSheet(
    headers: Map<String, String>,
    appearance: AppearanceTheme,
    onClose: () -> Unit,
    onConfirm: (Map<String, String>) -> Unit,
) {
    val drafts = remember {
        mutableStateListOf<HeaderDraft>().apply {
            headers.forEach { (name, value) -> add(HeaderDraft(name, value)) }
            if (isEmpty()) add(HeaderDraft("", ""))
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(appearance.overlayScrim())
            .noRippleClickable(onClick = onClose),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                .background(appearance.mobileBg)
                .noRippleClickable {}
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp)
                .padding(top = 16.dp, bottom = 14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("自定义请求头", color = appearance.mobileText, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        "随每次请求一起发送，网关鉴权常用",
                        color = appearance.mobileMuted,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                Text(
                    "完成",
                    color = appearance.mobileBlue,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .noRippleClickable {
                            onConfirm(
                                drafts
                                    .mapNotNull { draft ->
                                        val name = draft.name.trim()
                                        if (isValidHeaderName(name)) name to draft.value.trim() else null
                                    }
                                    .toMap(),
                            )
                        }
                        .padding(start = 12.dp),
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 340.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                drafts.forEachIndexed { index, draft ->
                    val nameInvalid = draft.name.isNotBlank() && !isValidHeaderName(draft.name)
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(appearance.mobileSurface)
                            .padding(horizontal = 14.dp, vertical = 11.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            HeaderInput(
                                value = draft.name,
                                placeholder = "名称，例如 X-Api-Version",
                                appearance = appearance,
                                modifier = Modifier.weight(1f),
                                onChange = { draft.name = it },
                            )
                            Box(
                                modifier = Modifier
                                    .size(30.dp)
                                    .noRippleClickable {
                                        drafts.removeAt(index)
                                        if (drafts.isEmpty()) drafts.add(HeaderDraft("", ""))
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                StrokeSvgIcon(AppIconPaths.Trash, ElecKoiDanger, iconSize = 15.dp)
                            }
                        }
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp)
                                .height(0.5.dp)
                                .background(appearance.mobileLine),
                        )
                        HeaderInput(
                            value = draft.value,
                            placeholder = "值",
                            appearance = appearance,
                            modifier = Modifier.fillMaxWidth(),
                            onChange = { draft.value = it },
                        )
                        if (nameInvalid) {
                            Text(
                                "名称只能用字母、数字和 - _ . 等符号",
                                color = ElecKoiDanger,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(top = 6.dp),
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(appearance.mobileSurface)
                    .noRippleClickable { drafts.add(HeaderDraft("", "")) }
                    .padding(vertical = 13.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StrokeSvgIcon(AppIconPaths.Plus, appearance.mobileText, iconSize = 15.dp)
                Text("添加一条", color = appearance.mobileText, fontSize = 14.sp, modifier = Modifier.padding(start = 7.dp))
            }
        }
    }
}

@Composable
private fun HeaderInput(
    value: String,
    placeholder: String,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit,
) {
    AppInsetTextField(
        value = value,
        onValueChange = onChange,
        appearance = appearance,
        placeholder = placeholder,
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        textStyle = TextStyle(color = appearance.mobileText, fontSize = 14.sp),
    )
}

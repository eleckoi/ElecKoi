package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun RootSearchPage(
    query: String,
    placeholder: String,
    accentColor: Color,
    onQueryChange: (String) -> Unit,
    onBack: () -> Unit,
    content: @Composable (AppearanceTheme) -> Unit,
) {
    val appearance = remember(accentColor) {
        AppearanceTheme(
            mobileBlue = accentColor,
        )
    }
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
        keyboardController?.show()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(appearance.mobileSurface)
            .navigationBarsPadding(),
    ) {
        androidx.compose.foundation.layout.Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .height(64.dp)
                    .padding(start = 4.dp, end = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                QuietBackButton(
                    color = appearance.mobileText,
                    onClick = {
                        keyboardController?.hide()
                        onBack()
                    },
                    modifier = Modifier.size(48.dp),
                    iconSize = 23.dp,
                )
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(appearance.mobileSearchBg)
                        .padding(start = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    DshSearchGlyph(
                        tint = appearance.mobileMuted,
                        iconSize = 20.dp,
                    )
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = 9.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        if (query.isBlank()) {
                            androidx.compose.material3.Text(
                                text = placeholder,
                                color = appearance.mobileSoft,
                                fontSize = 16.sp,
                                maxLines = 1,
                            )
                        }
                        BasicTextField(
                            value = query,
                            onValueChange = onQueryChange,
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(focusRequester)
                                .semantics { contentDescription = placeholder },
                            textStyle = TextStyle(
                                color = appearance.mobileText,
                                fontSize = 16.sp,
                            ),
                            cursorBrush = SolidColor(appearance.mobileBlue),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                            keyboardActions = KeyboardActions(
                                onSearch = { keyboardController?.hide() },
                            ),
                            singleLine = true,
                        )
                    }
                    if (query.isNotEmpty()) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .semantics {
                                    contentDescription = "清除搜索"
                                    role = Role.Button
                                }
                                .noRippleClickable { onQueryChange("") },
                            contentAlignment = Alignment.Center,
                        ) {
                            StrokeSvgIcon(
                                paths = AppIconPaths.X,
                                color = appearance.mobileMuted,
                                iconSize = 16.dp,
                                strokeWidth = 1.8f,
                            )
                        }
                    }
                }
            }
            Box(modifier = Modifier.fillMaxSize()) {
                content(appearance)
            }
        }
    }
}

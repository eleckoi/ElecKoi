package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.fieldPalette

/**
 * Shared recessed input plane for form fields. Group cards provide hierarchy; this surface makes
 * the editable region unmistakable without turning every field into a raised card.
 */
@Composable
fun AppInsetTextField(
    value: String,
    onValueChange: (String) -> Unit,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    singleLine: Boolean = true,
    enabled: Boolean = true,
    textStyle: TextStyle = TextStyle(fontSize = 15.sp),
    shape: Shape = RoundedCornerShape(12.dp),
    contentPadding: PaddingValues = PaddingValues(horizontal = 12.dp, vertical = 11.dp),
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    textFieldModifier: Modifier = Modifier,
    trailingContent: (@Composable () -> Unit)? = null,
) {
    val field = appearance.fieldPalette()
    var focused by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .border(
                if (focused) 1.dp else 0.5.dp,
                if (focused) field.focusedBorder else field.border,
                shape,
            )
            .focusDismissInputRegion()
            .focusInputOnPointerDown(focusRequester),
        verticalAlignment = if (singleLine) Alignment.CenterVertically else Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .padding(contentPadding),
            contentAlignment = if (singleLine) Alignment.CenterStart else Alignment.TopStart,
        ) {
            if (value.isEmpty() && placeholder.isNotEmpty()) {
                androidx.compose.material3.Text(
                    text = placeholder,
                    color = field.placeholder,
                    style = textStyle,
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester)
                    .then(textFieldModifier)
                    .onFocusChanged { focused = it.isFocused },
                textStyle = if (textStyle.color == Color.Unspecified) textStyle.copy(color = field.text) else textStyle,
                singleLine = singleLine,
                enabled = enabled,
                keyboardOptions = keyboardOptions,
                visualTransformation = visualTransformation,
                cursorBrush = SolidColor(appearance.mobileBlue),
            )
        }
        if (trailingContent != null) {
            Box(
                modifier = Modifier.size(48.dp),
                contentAlignment = Alignment.Center,
            ) {
                trailingContent()
            }
        }
    }
}

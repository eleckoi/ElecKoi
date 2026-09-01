package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.fieldPalette

@Composable
fun SearchIcon(
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    iconSize: Dp = 17.dp,
) {
    val field = appearance.fieldPalette()
    DshSearchGlyph(
        tint = field.icon,
        modifier = modifier,
        iconSize = iconSize,
    )
}

@Composable
fun AppSearchField(
    keyword: String,
    placeholder: String,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier
        .fillMaxWidth()
        .padding(start = 16.dp, top = 11.dp, end = 16.dp, bottom = 8.dp),
    surface: Color = appearance.mobileSurface,
    height: Dp = 38.dp,
    cornerRadius: Dp = 12.dp,
    fontSize: TextUnit = 15.sp,
    iconSize: Dp = 16.dp,
    rootGlass: Boolean = false,
    inputModifier: Modifier = Modifier,
    onKeywordChange: (String) -> Unit,
) {
    val field = appearance.fieldPalette()
    val shape = RoundedCornerShape(cornerRadius)
    Box(
        modifier = modifier
            .height(height)
            .clip(shape)
            .background(if (rootGlass) Color.White else appSearchWell(appearance, surface)),
    ) {
        if (!rootGlass) AppSearchWellShading(appearance)
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SearchIcon(appearance, iconSize = iconSize)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 7.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (keyword.isBlank()) {
                    Text(placeholder, color = field.placeholder, fontSize = fontSize, maxLines = 1)
                }
                BasicTextField(
                    value = keyword,
                    onValueChange = onKeywordChange,
                    modifier = inputModifier.fillMaxWidth(),
                    textStyle = TextStyle(color = field.text, fontSize = fontSize),
                    cursorBrush = SolidColor(appearance.mobileBlue),
                    singleLine = true,
                )
            }
        }
    }
}

/** Shared geometry and material for the search row at the top of every bottom-navigation root. */
@Composable
fun RootSearchField(
    keyword: String,
    placeholder: String,
    appearance: AppearanceTheme,
    onKeywordChange: (String) -> Unit,
) {
    AppSearchField(
        keyword = keyword,
        placeholder = placeholder,
        appearance = appearance,
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 8.dp),
        onKeywordChange = onKeywordChange,
    )
}

@Composable
internal fun appSearchWell(
    appearance: AppearanceTheme,
    surface: Color = appearance.mobileSurface,
): Color = appearance.mobileText.copy(alpha = 0.038f).compositeOver(surface)

@Composable
private fun AppSearchWellShading(
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(5.dp)
            .background(
                Brush.verticalGradient(
                    listOf(appearance.mobileText.copy(alpha = 0.05f), Color.Transparent),
                ),
            ),
    )
}

@Composable
fun AppSearchSideButton(
    paths: List<String>,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    surface: Color = appearance.mobileSurface,
    size: Dp = 38.dp,
    cornerRadius: Dp = 12.dp,
    iconSize: Dp = 18.dp,
    onClick: () -> Unit,
) {
    val field = appearance.fieldPalette()
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(cornerRadius))
            .background(appSearchWell(appearance, surface))
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        AppSearchWellShading(appearance, Modifier.align(Alignment.TopCenter))
        StrokeSvgIcon(paths, field.icon, iconSize = iconSize, strokeWidth = 1.8f)
    }
}

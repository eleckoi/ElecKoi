package com.eleckoi.android.feature.characters.modes.story.ui.shared

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.dropShadow
import com.eleckoi.android.foundation.design.components.focusDismissInputRegion
import com.eleckoi.android.foundation.design.components.focusInputOnPointerDown
import com.eleckoi.android.foundation.design.components.imeBringIntoViewOnFocus
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.fieldPalette
import kotlinx.coroutines.flow.distinctUntilChanged

private val ContainedTextEditorScroll = object : NestedScrollConnection {
    override fun onPostScroll(
        consumed: Offset,
        available: Offset,
        source: NestedScrollSource,
    ): Offset = available

    override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity = available
}

@Composable
internal fun InlineTextInput(
    value: String,
    placeholder: String,
    appearance: AppearanceTheme,
    modifier: Modifier,
    textSize: Int,
    fontWeight: FontWeight = FontWeight.Normal,
    scrollState: ScrollState? = null,
    imeBottomPx: Int = 0,
    onChange: (String) -> Unit,
) {
    val field = appearance.fieldPalette()
    var focused by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    val inputModifier = if (scrollState == null) {
        Modifier.fillMaxWidth()
    } else {
        Modifier.fillMaxWidth().imeBringIntoViewOnFocus(scrollState, imeBottomPx)
    }
    Box(
        modifier = modifier
            .height(42.dp)
            .border(
                if (focused) 1.dp else 0.5.dp,
                if (focused) field.focusedBorder else field.border,
                StoryEditorShapes.Control,
            )
            .focusDismissInputRegion()
            .focusInputOnPointerDown(focusRequester)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty()) {
            Text(placeholder, color = appearance.mobileMuted, fontSize = textSize.sp, maxLines = 1)
        }
        BasicTextField(
            value = value,
            onValueChange = onChange,
            modifier = inputModifier
                .focusRequester(focusRequester)
                .onFocusChanged { focused = it.isFocused },
            textStyle = TextStyle(
                color = appearance.mobileText,
                fontSize = textSize.sp,
                lineHeight = (textSize + 5).sp,
                fontWeight = fontWeight,
            ),
            singleLine = true,
            cursorBrush = SolidColor(appearance.mobileBlue),
        )
    }
}

@Composable
internal fun PlainInput(
    label: String,
    value: String,
    appearance: AppearanceTheme,
    scrollState: ScrollState? = null,
    imeBottomPx: Int = 0,
    minHeight: Int,
    placeholder: String = "",
    singleLine: Boolean = false,
    labelAction: (@Composable () -> Unit)? = null,
    immersiveTitle: String? = null,
    groupedStyle: Boolean = false,
    embeddedInParentCard: Boolean = false,
    footerActions: (@Composable RowScope.() -> Unit)? = null,
    onChange: (String) -> Unit,
) {
    var immersiveOpen by remember { mutableStateOf(false) }
    var focused by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val textState = rememberTextFieldState(
        initialText = value,
        initialSelection = TextRange(value.length),
    )
    val textScrollState = rememberScrollState()
    val latestValue by rememberUpdatedState(value)
    val latestOnChange by rememberUpdatedState(onChange)
    val editor = appearance.storyEditorPalette()
    val field = appearance.fieldPalette()
    val canImmerse = immersiveTitle != null && !singleLine
    val outerShape = if (groupedStyle) RoundedCornerShape(18.dp) else StoryEditorShapes.Control
    val inputShape = if (groupedStyle) RoundedCornerShape(13.dp) else StoryEditorShapes.Control
    val completeLineViewportHeight = with(LocalDensity.current) { 24.sp.toDp() * 12 }

    // Keep selection and the field's own scroll position inside one state holder. The legacy
    // String overload recreated the editable value around parent updates, so a tap near the end
    // could leave the selection below the clipped viewport while the visible text snapped upward.
    LaunchedEffect(textState) {
        snapshotFlow { textState.text.toString() }
            .distinctUntilChanged()
            .collect { text ->
                if (text != latestValue) latestOnChange(text)
            }
    }
    LaunchedEffect(value, textState) {
        if (textState.text.toString() != value) {
            textState.setTextAndPlaceCursorAtEnd(value)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = if (groupedStyle && !embeddedInParentCard) StoryEditorCardSpacing else if (groupedStyle) 0.dp else 11.dp),
    ) {
        if (!groupedStyle) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    label,
                    modifier = Modifier.weight(1f),
                    color = appearance.mobileText.copy(alpha = 0.68f),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                labelAction?.invoke()
            }
        }
        val barHeight = if (canImmerse && groupedStyle) 38.dp else 0.dp
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (groupedStyle && !embeddedInParentCard) {
                        // Transcribed rather than dialled in: a 1dp contact shadow plus a wider one
                        // pulled back behind the card by its spread. Through `Modifier.shadow` the
                        // only lever is elevation, and any elevation big enough to be visible threw
                        // the card off the page instead of setting it down on it.
                        Modifier
                            .dropShadow(outerShape, appearance.mobileText.copy(alpha = 0.07f), blur = 3.dp, offsetY = 1.dp)
                            .dropShadow(outerShape, appearance.mobileText.copy(alpha = 0.28f), blur = 12.dp, offsetY = 4.dp, spread = (-8).dp)
                    } else {
                        Modifier
                    },
                )
                .then(
                    if (embeddedInParentCard) {
                        Modifier
                    } else {
                        Modifier
                            .clip(outerShape)
                            .background(if (groupedStyle) editor.cardFace else appearance.mobileBg)
                            .then(
                                if (groupedStyle) Modifier else Modifier.border(
                                    if (focused) 1.dp else 0.5.dp,
                                    if (focused) field.focusedBorder else field.border,
                                    outerShape,
                                ),
                            )
                            .focusDismissInputRegion()
                    },
                ),
        ) {
            if (groupedStyle) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 12.dp, top = 15.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = label,
                        modifier = Modifier.weight(1f),
                        color = appearance.mobileText,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    labelAction?.invoke()
                }
            }
            // Keep the preview compact and let the text field own its viewport. The nested-scroll
            // boundary deliberately consumes any drag left over at the first/last line: a gesture
            // that started inside an editor must not suddenly start moving the surrounding form.
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(
                        if (groupedStyle) {
                            Modifier.padding(
                                start = 14.dp,
                                end = 14.dp,
                                bottom = if (canImmerse) 0.dp else 14.dp,
                            )
                        } else {
                            Modifier
                        },
                    )
                    .heightIn(
                        min = minHeight.dp,
                        max = if (groupedStyle && !singleLine) {
                            maxOf(minHeight.dp, completeLineViewportHeight)
                        } else {
                            Dp.Infinity
                        },
                    )
                    .then(
                        if (groupedStyle && !singleLine) {
                            Modifier.nestedScroll(ContainedTextEditorScroll)
                        } else {
                            Modifier
                        },
                    )
                    .then(
                        if (groupedStyle) {
                            Modifier
                                .clip(inputShape)
                                .border(
                                    if (focused) 1.dp else 0.5.dp,
                                    if (focused) field.focusedBorder else field.border,
                                    inputShape,
                                )
                        } else {
                            Modifier
                        },
                    )
                    .focusInputOnPointerDown(focusRequester)
                    .padding(horizontal = if (groupedStyle) 16.dp else 12.dp),
                contentAlignment = if (singleLine) Alignment.CenterStart else Alignment.TopStart,
            ) {
                if (textState.text.isEmpty() && placeholder.isNotEmpty()) {
                    Text(
                        placeholder,
                        color = editor.meta,
                        fontSize = 14.sp,
                        lineHeight = 24.sp,
                    )
                }
                BasicTextField(
                    state = textState,
                    // Width only. fillMaxSize made the field claim the whole of heightIn's max, so
                    // every card stood at its ceiling whether it held a sentence or nothing at all.
                    modifier = Modifier.fillMaxWidth()
                        .focusRequester(focusRequester)
                        .then(if (canImmerse && !groupedStyle) Modifier.padding(end = 30.dp, bottom = 30.dp) else Modifier)
                        // No manual keyboard nudge. The scrolling containers these fields sit in
                        // shrink with the keyboard, so the field is already clear of it; scrolling
                        // again on top of that pushed the page up twice.
                        .onFocusChanged {
                            focused = it.isFocused
                        },
                    textStyle = TextStyle(color = editor.bodyText, fontSize = 14.sp, lineHeight = 24.sp),
                    lineLimits = if (singleLine) {
                        TextFieldLineLimits.SingleLine
                    } else {
                        TextFieldLineLimits.MultiLine()
                    },
                    // Enter inserts a newline. Left to the IME a multi-line field can still be
                    // handed a "done" key that submits instead, which is how it lost line breaks.
                    keyboardOptions = KeyboardOptions(
                        imeAction = if (singleLine) ImeAction.Done else ImeAction.Default,
                    ),
                    cursorBrush = SolidColor(appearance.mobileBlue),
                    scrollState = textScrollState,
                )
                if (canImmerse && !groupedStyle) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(34.dp)
                            .clip(StoryEditorShapes.Small)
                            .background(appearance.mobileSurface.copy(alpha = 0.92f))
                            .border(1.dp, appearance.mobileMuted.copy(alpha = 0.12f), StoryEditorShapes.Small)
                            .noRippleClickable {
                                focusManager.clearFocus(force = true)
                                immersiveOpen = true
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        StrokeSvgIcon(AppIconPaths.Expand, appearance.mobileMuted, iconSize = 17.dp, strokeWidth = 1.8f)
                    }
                }
            }
            // Always drawn. Showing it only once a field had something in it meant two fields on
            // the same page, one empty and one not, had different anatomy — the inconsistency read
            // as a glitch rather than as tidiness.
            if (canImmerse && groupedStyle) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(barHeight + 6.dp)
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("${textState.text.length} 字", color = editor.meta, fontSize = 11.5.sp)
                    Spacer(modifier = Modifier.weight(1f))
                    footerActions?.invoke(this)
                    Row(
                        modifier = Modifier.noRippleClickable {
                            focusManager.clearFocus(force = true)
                            immersiveOpen = true
                        },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("展开编辑", color = appearance.mobileBlue, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        StrokeSvgIcon(
                            AppIconPaths.Expand,
                            appearance.mobileBlue,
                            modifier = Modifier.padding(start = 5.dp),
                            iconSize = 14.dp,
                            strokeWidth = 1.9f,
                        )
                    }
                }
            }
        }
    }
    if (canImmerse && immersiveOpen) {
        ImmersiveTextEditor(
            title = immersiveTitle.orEmpty(),
            value = value,
            placeholder = placeholder,
            appearance = appearance,
            onChange = onChange,
            onDismiss = { immersiveOpen = false },
        )
    }
}

@Composable
private fun ImmersiveTextEditor(
    title: String,
    value: String,
    placeholder: String,
    appearance: AppearanceTheme,
    onChange: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val textState = rememberTextFieldState(
        initialText = value,
        initialSelection = TextRange(value.length),
    )
    val editorScrollState = androidx.compose.foundation.rememberScrollState()
    val latestOnChange by rememberUpdatedState(onChange)

    LaunchedEffect(textState) {
        snapshotFlow { textState.text.toString() }
            .distinctUntilChanged()
            .collect { latestOnChange(it) }
    }

    val closeEditor = {
        latestOnChange(textState.text.toString())
        onDismiss()
    }

    Dialog(
        onDismissRequest = closeEditor,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Surface(color = appearance.mobileBg) {
            PinnedStatusScaffold(
                appearance = appearance,
                modifier = Modifier.navigationBarsPadding(),
                imeAware = true,
                backgroundColor = appearance.mobileBg,
            ) {
                StoryEditorHeader(
                    title = title,
                    appearance = appearance,
                    onBack = closeEditor,
                )
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .background(appearance.mobileBg)
                        .padding(horizontal = 18.dp, vertical = 16.dp),
                ) {
                    val editor = appearance.storyEditorPalette()
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(RoundedCornerShape(18.dp))
                            .background(editor.cardFace)
                            .focusDismissInputRegion(),
                    ) {
                        // This is the editor's only vertical viewport. BasicTextField owns the
                        // ScrollState, selection and caret reveal, so shrinking this slot for the
                        // IME keeps a tapped low cursor visible without a second scroll container.
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                                .clipToBounds()
                                .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 10.dp),
                        ) {
                            if (textState.text.isEmpty() && placeholder.isNotEmpty()) {
                                Text(placeholder, color = editor.meta, fontSize = 15.sp, lineHeight = 23.sp)
                            }
                            BasicTextField(
                                state = textState,
                                modifier = Modifier.fillMaxSize(),
                                textStyle = TextStyle(color = editor.bodyText, fontSize = 15.sp, lineHeight = 23.sp),
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                                lineLimits = TextFieldLineLimits.MultiLine(),
                                cursorBrush = SolidColor(appearance.mobileBlue),
                                scrollState = editorScrollState,
                            )
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth().height(38.dp).padding(horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Spacer(modifier = Modifier.weight(1f))
                            Text("${textState.text.length} 字", color = editor.meta, fontSize = 11.5.sp)
                        }
                    }
                }
            }
        }
    }
}

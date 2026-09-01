package com.eleckoi.android.feature.appfont.ui

import android.graphics.Typeface
import androidx.compose.material3.LocalTextStyle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import com.eleckoi.android.feature.appfont.data.AppFontDownloader
import com.eleckoi.android.feature.appfont.data.AppFontRepository
import com.eleckoi.android.feature.appfont.data.AppFontScope
import com.eleckoi.android.feature.appfont.data.AppFontSelection
import java.io.File

// Material3's Text merges LocalTextStyle with whatever the call site passes explicitly. Call sites
// in this app set fontSize but not fontFamily, so overriding LocalTextStyle here reaches all ~460
// of them without touching one. The dozen places that ask for Monospace pass fontFamily themselves
// and therefore keep it — code blocks and logs stay aligned.
@Composable
fun ProvideAppFont(
    chatSubtree: Boolean = false,
    onTypefaceChanged: ((Typeface?) -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val repository = remember(context) { AppFontRepository(context) }
    // Null until the store answers. An AppFontSelection() placeholder would be indistinguishable
    // from "the user picked the system font", and this composable is mounted a second time when a
    // chat opens — so every chat entry pushed a null typeface for a frame, resetting the engine and
    // laying out whatever was on screen in the default font before the real value arrived.
    val selection by repository.selectionFlow.collectAsState(initial = null)
    val fontFile = remember(selection?.fontId) {
        selection?.let { repository.fileFor(it.fontId) }
    }

    // If the process was killed mid-download the staging file outlives it, and the settings page
    // may never be opened again. Sweeping at startup keeps that from accumulating.
    LaunchedEffect(Unit) { AppFontDownloader.sweepAbandoned(repository) }

    // Canvas-based text renderers can opt in without making this reusable font runtime depend on
    // a particular feature's rendering engine.
    LaunchedEffect(selection != null, fontFile?.path, onTypefaceChanged) {
        if (selection == null) return@LaunchedEffect
        val typeface = fontFile?.let { file ->
            runCatching { Typeface.createFromFile(file) }.getOrNull()
        }
        onTypefaceChanged?.invoke(typeface)
    }

    val fontFamily = rememberAppFontFamily(fontFile, selection, chatSubtree)

    if (fontFamily == null) {
        content()
    } else {
        CompositionLocalProvider(
            LocalTextStyle provides LocalTextStyle.current.copy(fontFamily = fontFamily),
            content = content,
        )
    }
}

@Composable
private fun rememberAppFontFamily(
    fontFile: File?,
    selection: AppFontSelection?,
    chatSubtree: Boolean,
): FontFamily? {
    val applies = when (selection?.scope) {
        AppFontScope.All -> true
        AppFontScope.ChatOnly -> chatSubtree
        null -> false
    }
    return remember(fontFile?.path, applies) {
        if (!applies || fontFile == null) return@remember null
        // A file can be present but unloadable if it was replaced or truncated out from under us;
        // falling back to the system font beats crashing every Text in the tree.
        runCatching { FontFamily(Font(file = fontFile)) }.getOrNull()
    }
}

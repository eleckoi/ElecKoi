package com.eleckoi.android.feature.chat.data.markdown

/** Single thread-safe owner for loading the shared Grok/Rust Markdown runtime. */
internal object NativeMarkdownRuntime {
    init {
        System.loadLibrary("eleckoi_markdown_rust")
    }

    fun ensureLoaded() = Unit
}

fun preloadNativeMarkdownRuntime() {
    NativeMarkdownRuntime.ensureLoaded()
}

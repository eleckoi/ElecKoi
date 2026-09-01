package com.eleckoi.android.feature.chat.data.markdown

/** Pure-Rust Mermaid-to-SVG bridge pinned to the reviewed Grok Build source revision. */
internal object NativeMermaidRenderer {
    fun renderSvg(source: String, dark: Boolean): String? = nativeRenderSvg(source, dark)

    private external fun nativeRenderSvg(source: String, dark: Boolean): String?

    init {
        NativeMarkdownRuntime.ensureLoaded()
    }
}

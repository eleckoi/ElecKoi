package com.eleckoi.android.feature.preferences

/** How much of an assistant's streamed reasoning/process is rendered inside the message. */
enum class ChatReasoningDisplayMode(val storageKey: String) {
    Collapsed("collapsed"),
    Expanded("expanded"),
    ;

    companion object {
        val Default = Collapsed

        fun fromStorageKey(value: String?): ChatReasoningDisplayMode =
            entries.firstOrNull { it.storageKey == value } ?: Default
    }
}

/** Visual projection used for assistant reasoning and tool events. */
enum class ChatToolTimelineStyle(val storageKey: String) {
    /** Groups the completed process behind a single Codex-like “已处理” disclosure. */
    Codex("codex"),

    /** Keeps reasoning and tool calls as independent compact DeepSeek Harness rows. */
    Dsh("dsh"),
    ;

    companion object {
        val Default = Codex

        fun fromStorageKey(value: String?): ChatToolTimelineStyle =
            entries.firstOrNull { it.storageKey == value } ?: Default
    }
}

/** Visual treatment for fenced Markdown code shared by chat and the creation assistant. */
enum class ChatCodeBlockStyle(val storageKey: String) {
    Simple("simple"),
    Workbench("workbench"),
    ;

    companion object {
        val Default = Simple

        fun fromStorageKey(value: String?): ChatCodeBlockStyle =
            entries.firstOrNull { it.storageKey == value } ?: Default
    }
}

/** Shared code-block behavior. Off preserves the conventional bounded code viewport. */
object ChatCodeBlockDefaults {
    const val WrapEnabled = false
    const val ShowAllEnabled = false
}

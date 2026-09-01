package com.eleckoi.android.feature.appfont.data

// Nothing ships inside the APK: a full Chinese typeface is 14-25 MB because it carries twenty
// thousand glyphs, and most users only ever want one of them. The default is the system font,
// which on current Android phones is already a modern sans, and everything else is fetched on
// demand.
//
// Every entry here is SIL Open Font License, which is what makes it legal for us to host and hand
// the file to a user. Vendor "free for commercial use" fonts (MiSans, HarmonyOS Sans, the Alibaba
// family) permit *using* the font but not necessarily *redistributing* it, so those stay out of
// this list and go through manual import instead.
//
// Download URLs are pinned to a release tag on purpose. An unpinned "latest" link would silently
// change what users get, and a moved asset would fail at runtime instead of at review time.
data class AppFontCatalogEntry(
    val id: String,
    val name: String,
    val note: String,
    val sizeBytes: Long,
    val url: String,
    val license: String = "SIL Open Font License 1.1",
) {
    val fileName: String get() = "$id.ttf"
}

object AppFontCatalog {
    const val SystemFontId = ""

    // Verified 2026-07-26: every URL returns 200 and the byte counts are the real asset sizes.
    val entries = listOf(
        AppFontCatalogEntry(
            id = "lxgw-975yuan-sc",
            name = "975 圆体",
            note = "圆润可爱 · 简体",
            sizeBytes = 14_525_902L,
            url = "https://github.com/lxgw/975Yuan/releases/download/26.07.13/LXGW975YuanSC-400W.ttf",
        ),
        AppFontCatalogEntry(
            id = "lxgw-yozai",
            name = "悠哉字体",
            note = "手写感 · 轻松",
            sizeBytes = 15_605_374L,
            url = "https://github.com/lxgw/yozai-font/releases/download/v0.868/Yozai-Regular.ttf",
        ),
        AppFontCatalogEntry(
            id = "lxgw-wenkai",
            name = "霞鹜文楷",
            note = "楷体 · 书卷气",
            sizeBytes = 25_575_676L,
            url = "https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Regular.ttf",
        ),
        AppFontCatalogEntry(
            id = "lxgw-xiaolai",
            name = "小赖字体",
            note = "手写感 · 更圆",
            sizeBytes = 22_220_806L,
            url = "https://github.com/lxgw/kose-font/releases/download/v3.126/Xiaolai-Regular.ttf",
        ),
    )

    fun entryFor(id: String): AppFontCatalogEntry? = entries.firstOrNull { it.id == id }
}

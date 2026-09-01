package com.eleckoi.android.sdk.author

import android.content.Context

object AuthorFrontendSdk {
    @Volatile
    private var cachedSource: String? = null

    fun source(context: Context): String {
        cachedSource?.let { return it }
        return synchronized(this) {
            cachedSource ?: context.applicationContext.assets
                .open(AssetPath)
                .bufferedReader(Charsets.UTF_8)
                .use { it.readText() }
                .also { source ->
                    require(source.isNotBlank()) { "ElecKoi 作者前端 SDK 为空" }
                    cachedSource = source
                }
        }
    }

    private const val AssetPath = "frontend/preview/eleckoi.js"
}

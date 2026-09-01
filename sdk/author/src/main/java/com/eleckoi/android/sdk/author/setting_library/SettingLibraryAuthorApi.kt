package com.eleckoi.android.sdk.author.setting_library

import com.eleckoi.android.sdk.author.AuthorApiCatalog
import com.eleckoi.android.sdk.author.AuthorApiRoute
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal object SettingLibraryAuthorApi {
    val routes = listOf(
        AuthorApiRoute(AuthorApiCatalog.require("settingLibrary.getSummary")) { environment, _ ->
            val library = environment.runtime.settingLibrary
            buildJsonObject {
                put("available", library != null)
                put("summary", library?.let {
                    buildJsonObject {
                        put("characterId", it.characterId)
                        put("name", it.name)
                        put("entryCount", it.entryCount)
                        put("groupCount", it.groupCount)
                        put("versionCount", it.versionCount)
                        put("activeVersionId", it.activeVersionId)
                    }
                } ?: JsonNull)
            }
        },
    )
}

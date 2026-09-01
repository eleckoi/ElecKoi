package com.eleckoi.android.sdk.author.app

import androidx.core.content.pm.PackageInfoCompat
import com.eleckoi.android.sdk.author.AuthorApiCatalog
import com.eleckoi.android.sdk.author.AuthorApiRoute
import com.eleckoi.android.sdk.author.AuthorApiStage
import com.eleckoi.android.sdk.author.AuthorApiVersion
import com.eleckoi.android.sdk.author.AuthorApiPermission
import com.eleckoi.android.sdk.author.AuthorCapabilityRegistry
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal object AppAuthorApi {
    val routes = listOf(
        AuthorApiRoute(AuthorApiCatalog.require("app.getInfo")) { environment, _ ->
            val context = environment.appContext
            @Suppress("DEPRECATION")
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            buildJsonObject {
                put("name", "ElecKoi")
                put("packageName", context.packageName)
                put("versionName", packageInfo.versionName.orEmpty())
                put("versionCode", PackageInfoCompat.getLongVersionCode(packageInfo))
                put("apiStage", AuthorApiStage)
                put("apiVersion", AuthorApiVersion)
            }
        },
        AuthorApiRoute(AuthorApiCatalog.require("app.getCapabilities")) { environment, _ ->
            val allowed = environment.permissions.map(AuthorApiPermission::wireName).toSet()
            buildJsonObject {
                put("stage", AuthorApiStage)
                put("version", AuthorApiVersion)
                put("methods", buildJsonArray {
                    AuthorCapabilityRegistry.Default.definitions
                        .filter { it.permission in allowed }
                        .forEach { add(ElecKoiJson.parseToJsonElement(ElecKoiJson.encodeToString(it))) }
                })
            }
        },
    )
}

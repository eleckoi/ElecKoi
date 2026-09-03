package com.eleckoi.android.sdk.author.openings

import com.eleckoi.android.sdk.author.AuthorApiCallException
import com.eleckoi.android.sdk.author.AuthorApiCatalog
import com.eleckoi.android.sdk.author.AuthorApiEnvironment
import com.eleckoi.android.sdk.author.AuthorApiErrorCode
import com.eleckoi.android.sdk.author.AuthorApiRoute
import com.eleckoi.android.sdk.author.AuthorOpeningOptionSnapshot
import com.eleckoi.android.sdk.author.AuthorOpeningStateSnapshot
import com.eleckoi.android.sdk.author.requireOpeningGateway
import com.eleckoi.android.sdk.author.toAuthorJson
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal object OpeningAuthorApi {
    val routes = listOf(
        AuthorApiRoute(AuthorApiCatalog.require("openings.list")) { environment, _ ->
            environment.currentOpeningState().toListJson()
        },
        AuthorApiRoute(AuthorApiCatalog.require("openings.current")) { environment, _ ->
            environment.currentOpeningState().toCurrentJson()
        },
        AuthorApiRoute(AuthorApiCatalog.require("openings.select")) { environment, params ->
            val id = (params["id"] as? JsonPrimitive)?.content.orEmpty()
            if (id.isBlank()) {
                throw AuthorApiCallException(
                    AuthorApiErrorCode.InvalidParams,
                    "openings.select 需要开场白 id",
                )
            }
            environment.requireOpeningGateway().selectOpening(id).toAuthorJson()
        },
    )
}

private fun AuthorApiEnvironment.currentOpeningState(): AuthorOpeningStateSnapshot? =
    runtime.openingGateway?.openingSnapshot()

internal fun AuthorOpeningStateSnapshot?.toListJson() = buildJsonObject {
    val state = this@toListJson
    put("available", state != null && state.items.isNotEmpty())
    put("selectedId", state?.selectedId.orEmpty())
    put("selectionEnabled", state?.selectionEnabled == true)
    put("items", buildJsonArray {
        state?.items.orEmpty().forEach { option ->
            add(option.toJson(selectedId = state?.selectedId.orEmpty()))
        }
    })
}

internal fun AuthorOpeningStateSnapshot?.toCurrentJson() = buildJsonObject {
    val state = this@toCurrentJson
    val selected = state?.items?.firstOrNull { it.id == state.selectedId }
    put("available", selected != null)
    put("selectionEnabled", state?.selectionEnabled == true)
    put("opening", selected?.toJson(selectedId = state.selectedId) ?: JsonNull)
}

private fun AuthorOpeningOptionSnapshot.toJson(selectedId: String) = buildJsonObject {
    put("id", id)
    put("title", title)
    put("selected", id == selectedId)
}

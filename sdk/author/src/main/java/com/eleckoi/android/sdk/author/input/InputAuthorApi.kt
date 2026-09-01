package com.eleckoi.android.sdk.author.input

import com.eleckoi.android.sdk.author.AuthorApiCatalog
import com.eleckoi.android.sdk.author.AuthorApiRoute
import com.eleckoi.android.sdk.author.requireChatGateway
import com.eleckoi.android.sdk.author.toAuthorJson
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal object InputAuthorApi {
    val routes = listOf(
        AuthorApiRoute(AuthorApiCatalog.require("input.get")) { environment, _ ->
            val input = environment.runtime.chatGateway?.snapshot()?.input
                ?: environment.runtime.inputText
            buildJsonObject {
                put("available", input != null)
                put("text", input?.let(::JsonPrimitive) ?: JsonNull)
            }
        },
        AuthorApiRoute(AuthorApiCatalog.require("input.set")) { environment, params ->
            val text = (params["text"] as? JsonPrimitive)?.content.orEmpty()
            environment.requireChatGateway().setInput(text).toAuthorJson()
        },
        AuthorApiRoute(AuthorApiCatalog.require("input.append")) { environment, params ->
            val gateway = environment.requireChatGateway()
            val text = (params["text"] as? JsonPrimitive)?.content.orEmpty()
            gateway.setInput(gateway.snapshot().input + text).toAuthorJson()
        },
        AuthorApiRoute(AuthorApiCatalog.require("input.clear")) { environment, _ ->
            environment.requireChatGateway().setInput("").toAuthorJson()
        },
        AuthorApiRoute(AuthorApiCatalog.require("input.send")) { environment, _ ->
            val gateway = environment.requireChatGateway()
            gateway.send(gateway.snapshot().input).toAuthorJson()
        },
    )
}

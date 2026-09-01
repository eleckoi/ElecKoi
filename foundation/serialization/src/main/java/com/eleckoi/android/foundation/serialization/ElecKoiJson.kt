package com.eleckoi.android.foundation.serialization

import kotlinx.serialization.json.Json

val ElecKoiJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = false
}

val ElecKoiPrettyJson = Json(ElecKoiJson) {
    prettyPrint = true
}

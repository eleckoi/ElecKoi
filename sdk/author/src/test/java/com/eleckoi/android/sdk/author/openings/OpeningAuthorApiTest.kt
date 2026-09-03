package com.eleckoi.android.sdk.author.openings

import com.eleckoi.android.sdk.author.AuthorOpeningOptionSnapshot
import com.eleckoi.android.sdk.author.AuthorOpeningStateSnapshot
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OpeningAuthorApiTest {
    @Test
    fun `list exposes stable ids and selected option`() {
        val result = state().toListJson()

        assertTrue(result["available"]!!.jsonPrimitive.boolean)
        assertTrue(result["selectionEnabled"]!!.jsonPrimitive.boolean)
        assertEquals("opening-2", result["selectedId"]!!.jsonPrimitive.content)
        val items = result["items"]!!.jsonArray
        assertEquals(2, items.size)
        assertFalse(items[0].jsonObject["selected"]!!.jsonPrimitive.boolean)
        assertTrue(items[1].jsonObject["selected"]!!.jsonPrimitive.boolean)
    }

    @Test
    fun `current reports unavailable when selected id is missing`() {
        val result = state().copy(selectedId = "missing").toCurrentJson()

        assertFalse(result["available"]!!.jsonPrimitive.boolean)
        assertEquals("null", result["opening"].toString())
    }

    private fun state() = AuthorOpeningStateSnapshot(
        items = listOf(
            AuthorOpeningOptionSnapshot(id = "opening-1", title = "第一幕"),
            AuthorOpeningOptionSnapshot(id = "opening-2", title = "第二幕"),
        ),
        selectedId = "opening-2",
        selectionEnabled = true,
    )
}

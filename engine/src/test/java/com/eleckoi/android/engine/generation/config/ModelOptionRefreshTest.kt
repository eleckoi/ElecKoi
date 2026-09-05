package com.eleckoi.android.engine.generation.config

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelOptionRefreshTest {
    @Test
    fun `refresh retains inactive manual models but replaces the automatic catalog`() {
        val manual = ModelOption("private", isUserAdded = true, maxOutputTokens = 8000)
        val old = ModelConfig(model = "old", modelOptions = listOf(manual, ModelOption("old")))

        val refreshed = mergeFetchedModelOptions(old, listOf(ModelOption("new")))

        assertEquals(listOf(manual, ModelOption("new")), refreshed)
        assertFalse(refreshed.last().isUserAdded)
    }

    @Test
    fun `matching fetched id preserves manual origin settings and a single row across refreshes`() {
        val manual = ModelOption("private", isUserAdded = true, temperature = 0.4)
        val old = ModelConfig(modelOptions = listOf(manual))
        val fetched = listOf(ModelOption("private"), ModelOption("private"), ModelOption("new"))

        val refreshed = mergeFetchedModelOptions(old, fetched)
        val repeated = mergeFetchedModelOptions(old.copy(modelOptions = refreshed), fetched)

        assertEquals(2, refreshed.size)
        assertTrue(refreshed.first().isUserAdded)
        assertEquals(0.4, refreshed.first().temperature)
        assertEquals(refreshed, repeated)
    }

    @Test
    fun `empty provider response keeps manual choices`() {
        val manual = ModelOption("private", isUserAdded = true)
        val old = ModelConfig(modelOptions = listOf(manual, ModelOption("old")))

        assertEquals(listOf(manual), mergeFetchedModelOptions(old, emptyList()))
    }
}

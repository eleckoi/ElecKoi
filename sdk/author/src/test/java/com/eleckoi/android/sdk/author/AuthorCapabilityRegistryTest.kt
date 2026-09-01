package com.eleckoi.android.sdk.author

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthorCapabilityRegistryTest {
    @Test
    fun `author registry is the executable source of the advertised public catalog`() {
        val definitions = AuthorCapabilityRegistry.Default.definitions

        assertTrue(definitions.isNotEmpty())
        assertEquals(definitions.size, definitions.map(AuthorApiDefinition::method).distinct().size)
        assertNotNull(AuthorCapabilityRegistry.Default.find("variables.getState"))
        assertNotNull(AuthorCapabilityRegistry.Default.find("variables.applyPatch"))
        assertEquals(
            AuthorApiCatalog.definitions.map(AuthorApiDefinition::method).toSet(),
            definitions.map(AuthorApiDefinition::method).toSet(),
        )
    }
}

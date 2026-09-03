package com.eleckoi.android.sdk.author

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        assertNotNull(AuthorCapabilityRegistry.Default.find("openings.list"))
        assertNotNull(AuthorCapabilityRegistry.Default.find("openings.current"))
        assertNotNull(AuthorCapabilityRegistry.Default.find("openings.select"))
        assertEquals(
            AuthorApiCatalog.definitions.map(AuthorApiDefinition::method).toSet(),
            definitions.map(AuthorApiDefinition::method).toSet(),
        )
    }

    @Test
    fun `inline card can send without receiving broad chat write access`() {
        val permissions = AuthorApiPermission.inlineMessageInteractive

        assertTrue(AuthorApiPermission.ChatSend in permissions)
        assertTrue(AuthorApiPermission.OpeningsWrite in permissions)
        assertFalse(AuthorApiPermission.ChatWrite in permissions)
        assertFalse(AuthorApiPermission.MessagesWrite in permissions)
        assertFalse(AuthorApiPermission.ChatSend in AuthorApiPermission.previewReadOnly)
        assertEquals(
            AuthorApiPermission.ChatSend.wireName,
            AuthorApiCatalog.require("chat.send").permission,
        )
        assertEquals(
            AuthorApiPermission.ChatWrite.wireName,
            AuthorApiCatalog.require("chat.delete").permission,
        )
    }
}

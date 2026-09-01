package com.eleckoi.android.feature.studio.ui.assistant.workspace

import com.eleckoi.android.feature.conversation.markdown.*
import com.eleckoi.android.feature.conversation.timeline.*
import com.eleckoi.android.feature.conversation.timeline.model.*
import com.eleckoi.android.feature.conversation.timeline.ui.*

import com.eleckoi.android.engine.workspace.model.CreatorWorkspaceFile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CreationFileEditingControllerTest {
    @Test
    fun `frontend entry prefers the shallowest case-insensitive index file`() {
        val files = listOf(
            file("nested/deeper/index.html"),
            file("web/INDEX.HTML"),
            file("index.html"),
            file("notes.md"),
        )

        assertEquals("index.html", detectFrontendEntry(files))
    }

    @Test
    fun `frontend entry is absent when no index html exists`() {
        assertNull(detectFrontendEntry(listOf(file("main.html"), file("index.js"))))
    }

    private fun file(path: String) = CreatorWorkspaceFile(
        path = path,
        sizeBytes = 0,
        lastModifiedAt = "",
    )
}

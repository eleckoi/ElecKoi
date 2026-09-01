package com.eleckoi.android.engine.immersive.model

import kotlinx.serialization.Serializable

@Serializable
data class FrontendProject(
    val id: String,
    val characterId: String,
    val name: String,
    val entryFile: String,
    val files: List<String>,
    val importedAt: String,
)

data class FrontendWorkspace(
    val characterId: String,
    val projects: List<FrontendProject> = emptyList(),
    val selectedProjectId: String? = null,
    val messageRendererEnabled: Boolean = true,
) {
    val selectedProject: FrontendProject?
        get() = projects.firstOrNull { it.id == selectedProjectId }
}

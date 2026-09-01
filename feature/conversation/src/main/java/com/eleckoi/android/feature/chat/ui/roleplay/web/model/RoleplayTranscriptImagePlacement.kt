package com.eleckoi.android.feature.chat.ui.roleplay.web.model

import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.chat.roleplay.protocol.RoleplayImagePlacementPart
import com.eleckoi.android.feature.chat.roleplay.protocol.parseRoleplayImagePlacements

internal fun placeRoleplayTranscriptImages(
    role: MessageRole,
    content: String,
    streaming: Boolean,
    images: List<RoleplayTranscriptImage>,
): List<RoleplayTranscriptContentPart> {
    if (role == MessageRole.User) {
        return buildList {
            content.takeIf(String::isNotBlank)?.let { add(RoleplayTranscriptContentPart.Text(it)) }
            if (images.isNotEmpty()) add(RoleplayTranscriptContentPart.Images(images))
        }
    }
    val parsed = parseRoleplayImagePlacements(content, streaming)
    val referencedFrames = parsed
        .filterIsInstance<RoleplayImagePlacementPart.Images>()
        .flatMapTo(mutableSetOf(), RoleplayImagePlacementPart.Images::frameIndexes)
    return buildList {
        parsed.forEach { part ->
            when (part) {
                is RoleplayImagePlacementPart.Text -> {
                    add(RoleplayTranscriptContentPart.Text(part.value))
                }

                is RoleplayImagePlacementPart.Images -> {
                    val placedImages = part.frameIndexes
                        .distinct()
                        .flatMap { frameIndex -> images.filter { it.frameIndex == frameIndex } }
                    if (placedImages.isNotEmpty()) {
                        add(RoleplayTranscriptContentPart.Images(placedImages))
                    }
                }
            }
        }
        if (!streaming) {
            val unplacedImages = images.filterNot { it.frameIndex in referencedFrames }
            if (unplacedImages.isNotEmpty()) {
                add(RoleplayTranscriptContentPart.Images(unplacedImages))
            }
        }
    }
}

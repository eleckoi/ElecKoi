package com.eleckoi.android.feature.characters.modes.story.presets.data.media

import com.eleckoi.android.feature.characters.transfer.format.png.PngTextChunkCodec
import com.eleckoi.android.foundation.storage.JsonFileStore
import com.eleckoi.android.foundation.storage.newId
import java.io.File

/** Owns files used by preset author profiles; Room stores only the resulting absolute path. */
internal class StoryPresetAuthorAvatarStore(
    private val store: JsonFileStore,
) {
    fun storeImported(presetId: String, png: ByteArray?): File? {
        if (png == null) return null
        require(png.size <= MaxImportedAuthorAvatarBytes) {
            "预设卡作者头像不能超过 8 MB"
        }
        require(PngTextChunkCodec.isPng(png)) {
            "预设卡作者头像不是有效 PNG"
        }
        return destination(presetId).also { file ->
            file.parentFile?.mkdirs()
            file.writeBytes(png)
        }
    }

    fun copyFrom(presetId: String, source: File): File? {
        if (!source.exists()) return null
        return destination(presetId).also { destination ->
            destination.parentFile?.mkdirs()
            source.inputStream().use { input ->
                destination.outputStream().use { output -> input.copyTo(output) }
            }
        }
    }

    private fun destination(presetId: String): File {
        return store.file(
            "story-presets",
            "author-$presetId-${newId(10)}.png",
        )
    }
}

private const val MaxImportedAuthorAvatarBytes = 8 * 1024 * 1024

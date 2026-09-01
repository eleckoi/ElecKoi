package com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.importing

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryJsonCodec
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryVersion
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import org.json.JSONObject

/** Routes user-selected files to a supported importer without coupling native persistence to it. */
internal object SettingLibraryImportCodec {
    fun parse(json: String, versionId: String): SettingLibraryVersion {
        val source = runCatching { JSONObject(json) }
            .getOrElse { throw ElecKoiDataException("设定库文件格式不正确", it) }
        return if (SillyTavernWorldBookImporter.canParse(source)) {
            SillyTavernWorldBookImporter.parse(source, versionId)
        } else {
            SettingLibraryJsonCodec.parseExport(json, versionId)
        }
    }
}

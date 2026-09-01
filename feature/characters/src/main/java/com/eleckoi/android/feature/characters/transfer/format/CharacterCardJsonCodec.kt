package com.eleckoi.android.feature.characters.transfer.format

import com.eleckoi.android.feature.characters.model.CharacterMode
import com.eleckoi.android.feature.characters.transfer.model.DecodedCharacterCard
import com.eleckoi.android.feature.characters.transfer.model.PortableAsset
import com.eleckoi.android.feature.characters.transfer.model.PortableCharacter
import com.eleckoi.android.feature.characters.transfer.model.PortableCharacterPackage
import com.eleckoi.android.feature.characters.transfer.model.PortableFrontendProject
import com.eleckoi.android.feature.characters.transfer.model.PortableProjectFile
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import org.json.JSONArray
import org.json.JSONObject

internal object CharacterCardJsonCodec {
    const val PortableKeyword = "eleckoi-card"
    const val StandardKeyword = "chara"
    private const val PortableFormat = "eleckoi.character-card"
    private const val PortableVersion = 1
    private const val MaxExpandedBytes = 96 * 1024 * 1024

    fun encodePortable(value: PortableCharacterPackage): String {
        val json = packageJson(value).toString().toByteArray(StandardCharsets.UTF_8)
        val compressed = ByteArrayOutputStream().use { output ->
            GZIPOutputStream(output).use { it.write(json) }
            output.toByteArray()
        }
        return Base64.getEncoder().encodeToString(compressed)
    }

    fun decodePortable(encoded: String): PortableCharacterPackage {
        val compressed = runCatching { Base64.getDecoder().decode(encoded) }
            .getOrElse { error("ElecKoi 角色卡数据损坏") }
        val json = GZIPInputStream(ByteArrayInputStream(compressed)).use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                require(total <= MaxExpandedBytes) { "角色卡解压后过大" }
                output.write(buffer, 0, count)
            }
            output.toString(StandardCharsets.UTF_8.name())
        }
        return packageFromJson(JSONObject(json))
    }

    fun encodeStandard(value: PortableCharacter): String {
        val data = JSONObject()
            .put("name", value.name)
            .put("description", value.assistantPrompt)
            .put("personality", "")
            .put("scenario", "")
            .put("first_mes", value.opening)
            .put("mes_example", "")
            .put("creator_notes", "")
            .put("system_prompt", value.assistantPrompt)
            .put("post_history_instructions", "")
            .put("alternate_greetings", JSONArray())
            .put("tags", JSONArray())
            .put("creator", "ElecKoi")
            .put("character_version", "1")
            .put("extensions", JSONObject().put("eleckoi_compatible", true))
        return JSONObject()
            .put("spec", "chara_card_v2")
            .put("spec_version", "2.0")
            .put("data", data)
            .toString()
    }

    fun decodeStandard(encodedOrJson: String, sourceImage: ByteArray?): DecodedCharacterCard {
        val json = decodeMaybeBase64(encodedOrJson)
        val root = JSONObject(json)
        val data = root.optJSONObject("data") ?: root
        val name = data.optString("name").trim().ifBlank { "导入角色" }
        val prompt = data.optString("system_prompt").ifBlank {
            listOf("description", "personality", "scenario", "mes_example")
                .map(data::optString)
                .filter(String::isNotBlank)
                .joinToString("\n\n")
        }
        val character = PortableCharacter(
            name = name,
            group = "",
            characterMode = CharacterMode.Story.storageValue,
            frontendBeautyEnabled = false,
            assistantPrompt = prompt,
            profileAge = "",
            profileSex = "",
            profileHeight = "",
            profileBirthday = "",
            profileLike = "",
            imagePrompt = "",
            opening = data.optString("first_mes"),
            showOpening = data.optString("first_mes").isNotBlank(),
            chatBackgroundOpacity = 0.72f,
            chatBackgroundBlur = 0f,
            chatBackgroundScrim = 0.22f,
        )
        return DecodedCharacterCard(
            packageData = PortableCharacterPackage(character),
            sourceImage = sourceImage,
            complete = false,
        )
    }

    private fun decodeMaybeBase64(value: String): String {
        val trimmed = value.trim()
        if (trimmed.startsWith("{")) return trimmed
        return runCatching {
            Base64.getDecoder().decode(trimmed).toString(StandardCharsets.UTF_8)
        }.getOrElse { error("标准角色卡数据损坏") }
    }

    private fun packageJson(value: PortableCharacterPackage): JSONObject = JSONObject()
        .put("format", PortableFormat)
        .put("version", PortableVersion)
        .put("character", characterJson(value.character))
        .put("assets", JSONArray(value.assets.map(::assetJson)))
        .put("setting_library", value.settingLibraryJson)
        .put("variable_config", value.variableConfigJson)
        .put("frontends", JSONArray(value.frontends.map(::frontendJson)))

    private fun packageFromJson(root: JSONObject): PortableCharacterPackage {
        require(root.optString("format") == PortableFormat) { "这不是 ElecKoi 角色卡" }
        require(root.optInt("version") == PortableVersion) { "暂不支持这个角色卡版本" }
        return PortableCharacterPackage(
            character = characterFromJson(root.getJSONObject("character")),
            assets = root.optJSONArray("assets").objects().map(::assetFromJson),
            settingLibraryJson = root.optString("setting_library"),
            variableConfigJson = root.optString("variable_config"),
            frontends = root.optJSONArray("frontends").objects().map(::frontendFromJson),
        )
    }

    private fun characterJson(value: PortableCharacter): JSONObject = JSONObject()
        .put("name", value.name)
        .put("group", value.group)
        .put("character_mode", value.characterMode)
        .put("frontend_beauty_enabled", value.frontendBeautyEnabled)
        .put("assistant_prompt", value.assistantPrompt)
        .put("profile_age", value.profileAge)
        .put("profile_sex", value.profileSex)
        .put("profile_height", value.profileHeight)
        .put("profile_birthday", value.profileBirthday)
        .put("profile_like", value.profileLike)
        .put("image_prompt", value.imagePrompt)
        .put("opening", value.opening)
        .put("show_opening", value.showOpening)
        .put("chat_background_mode", value.chatBackgroundMode)
        .put("chat_background_opacity", value.chatBackgroundOpacity.toDouble())
        .put("chat_background_blur", value.chatBackgroundBlur.toDouble())
        .put("chat_background_scrim", value.chatBackgroundScrim.toDouble())

    private fun characterFromJson(value: JSONObject): PortableCharacter = PortableCharacter(
        name = value.optString("name").take(120).ifBlank { "导入角色" },
        group = value.optString("group").take(40),
        characterMode = value.optString("character_mode").take(40).ifBlank { CharacterMode.Story.storageValue },
        frontendBeautyEnabled = value.optBoolean("frontend_beauty_enabled"),
        assistantPrompt = value.optString("assistant_prompt"),
        profileAge = value.optString("profile_age"),
        profileSex = value.optString("profile_sex"),
        profileHeight = value.optString("profile_height"),
        profileBirthday = value.optString("profile_birthday"),
        profileLike = value.optString("profile_like"),
        imagePrompt = value.optString("image_prompt"),
        opening = value.optString("opening"),
        showOpening = value.optBoolean("show_opening"),
        chatBackgroundMode = value.optString("chat_background_mode")
            .takeIf { it in setOf("card", "custom", "app_default", "global") }
            ?: "card",
        chatBackgroundOpacity = value.optDouble("chat_background_opacity", 0.72).toFloat(),
        chatBackgroundBlur = value.optDouble("chat_background_blur", 0.0).toFloat(),
        chatBackgroundScrim = value.optDouble("chat_background_scrim", 0.22).toFloat(),
    )

    private fun assetJson(value: PortableAsset): JSONObject = JSONObject()
        .put("key", value.key)
        .put("media_type", value.mediaType)
        .put("data", Base64.getEncoder().encodeToString(value.bytes))

    private fun assetFromJson(value: JSONObject): PortableAsset = PortableAsset(
        key = value.optString("key").take(80),
        mediaType = value.optString("media_type").take(80),
        bytes = decodeBytes(value.optString("data")),
    )

    private fun frontendJson(value: PortableFrontendProject): JSONObject = JSONObject()
        .put("name", value.name)
        .put("entry_file", value.entryFile)
        .put("selected", value.selected)
        .put("files", JSONArray(value.files.map { file ->
            JSONObject()
                .put("path", file.path)
                .put("data", Base64.getEncoder().encodeToString(file.bytes))
        }))

    private fun frontendFromJson(value: JSONObject): PortableFrontendProject = PortableFrontendProject(
        name = value.optString("name").take(80),
        entryFile = safeRelativePath(value.optString("entry_file")),
        selected = value.optBoolean("selected"),
        files = value.optJSONArray("files").objects().map { file ->
            PortableProjectFile(
                path = safeRelativePath(file.optString("path")),
                bytes = decodeBytes(file.optString("data")),
            )
        },
    )

    private fun decodeBytes(value: String): ByteArray = runCatching {
        Base64.getDecoder().decode(value)
    }.getOrElse { error("角色卡附件损坏") }

    private fun safeRelativePath(value: String): String {
        val normalized = value.replace('\\', '/').trimStart('/')
        require(normalized.isNotBlank() && normalized.split('/').none { it == ".." }) {
            "角色卡包含不安全的文件路径"
        }
        return normalized
    }

    private fun JSONArray?.objects(): List<JSONObject> = buildList {
        val array = this@objects ?: return@buildList
        for (index in 0 until array.length()) {
            array.optJSONObject(index)?.let(::add)
        }
    }
}

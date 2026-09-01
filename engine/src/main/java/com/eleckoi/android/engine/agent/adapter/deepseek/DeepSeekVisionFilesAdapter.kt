package com.eleckoi.android.engine.agent.adapter

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.isOfficialDeepSeekVisionModel
import com.eleckoi.android.engine.generation.provider.applyCustomHeaders
import com.eleckoi.android.foundation.network.SecureModelHttpClientFactory
import com.eleckoi.android.foundation.network.SensitiveTextSanitizer
import com.eleckoi.android.foundation.network.StrictProxyParser
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import java.io.File
import java.io.FileOutputStream
import java.net.URI
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

internal enum class DeepSeekImageRequestFormat {
    Responses,
    ChatCompletions,
}

internal data class DeepSeekPreparedImageRequest(
    val body: JsonObject,
    val representedImages: Int = 0,
    val uploadedImages: Int = 0,
    val reusedImages: Int = 0,
    val fallbackReason: String? = null,
)

internal data class DeepSeekUploadedFile(
    val fileId: String,
    val expiresAtEpochSeconds: Long,
)

internal fun interface DeepSeekImageUploader {
    suspend fun upload(config: ModelConfig, image: DeepSeekInlineImage): DeepSeekUploadedFile
}

/**
 * DeepSeek-official image preflight for the Android credential boundary.
 *
 * DSH owns durable local attachments and deterministic request-size normalization. The upstream API
 * key deliberately remains outside the Linux guest, so this Android-side adapter performs the one
 * provider-specific step that requires that key: upload normalized inline images to DeepSeek Files,
 * persist a content-addressed file-id index, and replace repeated payloads with file references.
 * A Files failure leaves the whole request inline, matching DSH's safe fallback behavior.
 */
internal class DeepSeekVisionFilesAdapter(
    private val indexFile: File,
    private val nowEpochSeconds: () -> Long = { System.currentTimeMillis() / 1_000L },
    private val uploader: DeepSeekImageUploader = DeepSeekImageUploader(::uploadImage),
) {
    private val mutex = Mutex()
    private var records: MutableMap<String, UploadRecord>? = null

    suspend fun prepare(
        request: JsonObject,
        config: ModelConfig,
        format: DeepSeekImageRequestFormat,
    ): DeepSeekPreparedImageRequest {
        if (!config.isOfficialDeepSeekVisionModel()) return DeepSeekPreparedImageRequest(request)
        val images = collectInlineImages(request, format)
        if (images.isEmpty()) return DeepSeekPreparedImageRequest(request)
        val distinct = images.distinctBy(DeepSeekInlineImage::contentSha256)
        val resolved = linkedMapOf<String, String>()
        var uploaded = 0
        var reused = 0
        try {
            distinct.forEach { image ->
                val result = resolveFile(config, image)
                resolved[image.contentSha256] = result.fileId
                if (result.uploaded) uploaded += 1 else reused += 1
            }
        } catch (error: Throwable) {
            return DeepSeekPreparedImageRequest(
                body = request,
                representedImages = images.size,
                fallbackReason = SensitiveTextSanitizer
                    .sanitize(error.message.orEmpty(), config.apiKey)
                    .ifBlank { "DeepSeek Files API 不可用" }
                    .take(MaxFallbackReasonChars),
            )
        }
        return DeepSeekPreparedImageRequest(
            body = replaceInlineImages(request, format, resolved).jsonObject,
            representedImages = images.size,
            uploadedImages = uploaded,
            reusedImages = reused,
        )
    }

    private suspend fun resolveFile(
        config: ModelConfig,
        image: DeepSeekInlineImage,
    ): ResolvedFile = mutex.withLock {
        val now = nowEpochSeconds()
        val scope = accountScope(config)
        val key = "$scope:${image.contentSha256}"
        val index = loadRecords()
        index[key]
            ?.takeIf { it.expiresAtEpochSeconds - now > RefreshMarginSeconds }
            ?.let { return@withLock ResolvedFile(it.fileId, uploaded = false) }

        val uploaded = uploader.upload(config, image)
        require(uploaded.fileId.startsWith("file-api-") && uploaded.fileId.length <= 256) {
            "DeepSeek Files API 返回了无效 file_id"
        }
        require(uploaded.expiresAtEpochSeconds > now + RefreshMarginSeconds) {
            "DeepSeek Files API 返回的文件有效期过短"
        }
        index[key] = UploadRecord(
            scope = scope,
            contentSha256 = image.contentSha256,
            fileId = uploaded.fileId,
            expiresAtEpochSeconds = uploaded.expiresAtEpochSeconds,
            storedAtEpochSeconds = now,
            bytes = image.data.size,
        )
        index.entries.removeIf { (_, record) -> record.expiresAtEpochSeconds <= now }
        if (index.size > MaxIndexEntries) {
            index.values
                .sortedBy(UploadRecord::storedAtEpochSeconds)
                .take(index.size - MaxIndexEntries)
                .forEach { record -> index.remove("${record.scope}:${record.contentSha256}") }
        }
        persistRecords(index)
        ResolvedFile(uploaded.fileId, uploaded = true)
    }

    private fun loadRecords(): MutableMap<String, UploadRecord> {
        records?.let { return it }
        val loaded = runCatching {
            if (!indexFile.isFile) return@runCatching mutableMapOf()
            val root = ElecKoiJson.parseToJsonElement(indexFile.readText()).jsonObject
            if ((root["schema"] as? JsonPrimitive)?.longOrNull != IndexSchema.toLong()) {
                return@runCatching mutableMapOf()
            }
            val entries = root["entries"] as? JsonArray ?: return@runCatching mutableMapOf()
            entries.mapNotNull { element ->
                val item = element as? JsonObject ?: return@mapNotNull null
                val record = UploadRecord.fromJson(item) ?: return@mapNotNull null
                "${record.scope}:${record.contentSha256}" to record
            }.toMap(mutableMapOf())
        }.getOrDefault(mutableMapOf())
        records = loaded
        return loaded
    }

    private fun persistRecords(index: Map<String, UploadRecord>) {
        val parent = requireNotNull(indexFile.parentFile)
        require(parent.isDirectory || parent.mkdirs()) { "无法创建 DeepSeek 文件索引目录" }
        val encoded = buildJsonObject {
            put("schema", IndexSchema)
            put("entries", buildJsonArray {
                index.values
                    .sortedWith(compareBy(UploadRecord::scope, UploadRecord::contentSha256))
                    .forEach { add(it.toJson()) }
            })
        }.toString().toByteArray(Charsets.UTF_8)
        val temporary = File(parent, "${indexFile.name}.tmp")
        FileOutputStream(temporary).use { output ->
            output.write(encoded)
            output.fd.sync()
        }
        runCatching {
            Files.move(
                temporary.toPath(),
                indexFile.toPath(),
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING,
            )
        }.getOrElse {
            Files.move(
                temporary.toPath(),
                indexFile.toPath(),
                StandardCopyOption.REPLACE_EXISTING,
            )
        }
    }

    private data class ResolvedFile(val fileId: String, val uploaded: Boolean)

    private data class UploadRecord(
        val scope: String,
        val contentSha256: String,
        val fileId: String,
        val expiresAtEpochSeconds: Long,
        val storedAtEpochSeconds: Long,
        val bytes: Int,
    ) {
        fun toJson(): JsonObject = buildJsonObject {
            put("scope", scope)
            put("content_sha256", contentSha256)
            put("file_id", fileId)
            put("expires_at", expiresAtEpochSeconds)
            put("stored_at", storedAtEpochSeconds)
            put("bytes", bytes)
        }

        companion object {
            fun fromJson(value: JsonObject): UploadRecord? {
                val scope = value.string("scope") ?: return null
                val hash = value.string("content_sha256") ?: return null
                val fileId = value.string("file_id") ?: return null
                val expiresAt = (value["expires_at"] as? JsonPrimitive)?.longOrNull ?: return null
                val storedAt = (value["stored_at"] as? JsonPrimitive)?.longOrNull ?: return null
                val bytes = (value["bytes"] as? JsonPrimitive)?.longOrNull
                    ?.takeIf { it in 1..MaxSourceImageBytes.toLong() }
                    ?.toInt()
                    ?: return null
                if (!Sha256.matches(scope) || !Sha256.matches(hash) ||
                    !fileId.startsWith("file-api-") || expiresAt <= 0 || storedAt <= 0
                ) return null
                return UploadRecord(scope, hash, fileId, expiresAt, storedAt, bytes)
            }
        }
    }

    private companion object {
        const val IndexSchema = 1
        const val RefreshMarginSeconds = 60L * 60L
        const val MaxSourceImageBytes = 20 * 1024 * 1024
        const val MaxIndexEntries = 1_024
        const val MaxFallbackReasonChars = 320
        val Sha256 = Regex("^[0-9a-f]{64}$")
    }
}

internal data class DeepSeekInlineImage(
    val mediaType: String,
    val data: ByteArray,
    val contentSha256: String,
)

private suspend fun uploadImage(
    config: ModelConfig,
    image: DeepSeekInlineImage,
): DeepSeekUploadedFile = withContext(Dispatchers.IO) {
    require(image.data.size in 1..20 * 1024 * 1024) { "DeepSeek 图片大小无效" }
    val proxy = StrictProxyParser.parse(config.proxyUrl)
    val endpoint = "${deepSeekApiBase(config)}/files"
    val client = SecureModelHttpClientFactory.create(
        explicitProxy = proxy,
        connectTimeoutMillis = 10_000,
        readTimeoutMillis = 10 * 60_000,
    )
    val extension = when (image.mediaType) {
        "image/jpeg" -> "jpg"
        "image/png" -> "png"
        "image/gif" -> "gif"
        "image/webp" -> "webp"
        else -> error("DeepSeek 不支持图片格式 ${image.mediaType}")
    }
    val multipart = MultipartBody.Builder()
        .setType(MultipartBody.FORM)
        .addFormDataPart("purpose", "user_data")
        .addFormDataPart("expires_after[anchor]", "created_at")
        .addFormDataPart("expires_after[seconds]", (7L * 24L * 60L * 60L).toString())
        .addFormDataPart(
            "file",
            "eleckoi-${image.contentSha256.take(16)}.$extension",
            image.data.toRequestBody(image.mediaType.toMediaType()),
        )
        .build()
    val request = Request.Builder()
        .url(endpoint)
        .applyCustomHeaders(config)
        .header("Authorization", "Bearer ${config.apiKey.trim()}")
        .header("Accept", "application/json")
        .post(multipart)
        .build()
    client.newCall(request).execute().use { response ->
        val body = AdapterHttpCodec.readBounded(response.body?.byteStream(), 64 * 1024)
            .toString(Charsets.UTF_8)
        if (!response.isSuccessful) {
            val detail = SensitiveTextSanitizer.sanitize(body, config.apiKey).take(512)
            error("DeepSeek Files API HTTP ${response.code}${detail.takeIf(String::isNotBlank)?.let { "：$it" }.orEmpty()}")
        }
        val payload = runCatching { ElecKoiJson.parseToJsonElement(body).jsonObject }
            .getOrElse { error("DeepSeek Files API 返回了无效 JSON") }
        val id = payload.string("id") ?: error("DeepSeek Files API 未返回 file_id")
        val now = System.currentTimeMillis() / 1_000L
        val expiresAt = (payload["expires_at"] as? JsonPrimitive)?.longOrNull
            ?: now + 7L * 24L * 60L * 60L
        DeepSeekUploadedFile(id, expiresAt)
    }
}

private fun collectInlineImages(
    root: JsonElement,
    format: DeepSeekImageRequestFormat,
): List<DeepSeekInlineImage> = buildList {
    fun visit(value: JsonElement) {
        when (value) {
            is JsonArray -> value.forEach(::visit)
            is JsonObject -> {
                inlineImageUrl(value, format)?.let(::decodeInlineImage)?.let(::add)
                value.values.forEach(::visit)
            }
            else -> Unit
        }
    }
    visit(root)
}

private fun replaceInlineImages(
    value: JsonElement,
    format: DeepSeekImageRequestFormat,
    fileIdsByHash: Map<String, String>,
): JsonElement = when (value) {
    is JsonArray -> JsonArray(value.map { replaceInlineImages(it, format, fileIdsByHash) })
    is JsonObject -> {
        val inline = inlineImageUrl(value, format)?.let(::decodeInlineImage)
        val fileId = inline?.let { fileIdsByHash[it.contentSha256] }
        if (fileId != null) {
            when (format) {
                DeepSeekImageRequestFormat.Responses -> buildJsonObject {
                    value.forEach { (key, child) ->
                        if (key !in setOf("image_url", "file_id", "detail")) put(key, child)
                    }
                    put("type", "input_image")
                    put("file_id", fileId)
                }
                DeepSeekImageRequestFormat.ChatCompletions -> buildJsonObject {
                    put("type", "file")
                    put("file_id", fileId)
                }
            }
        } else {
            buildJsonObject {
                value.forEach { (key, child) -> put(key, replaceInlineImages(child, format, fileIdsByHash)) }
            }
        }
    }
    else -> value
}

private fun inlineImageUrl(value: JsonObject, format: DeepSeekImageRequestFormat): String? = when (format) {
    DeepSeekImageRequestFormat.Responses -> {
        if (value.string("type") != "input_image") null else value.string("image_url")
    }
    DeepSeekImageRequestFormat.ChatCompletions -> {
        if (value.string("type") != "image_url") null
        else (value["image_url"] as? JsonObject)?.string("url")
    }
}

private fun decodeInlineImage(url: String): DeepSeekInlineImage? {
    if (!url.startsWith("data:image/", ignoreCase = true)) return null
    val comma = url.indexOf(',')
    if (comma <= 5 || comma == url.lastIndex) return null
    val header = url.substring(5, comma).lowercase()
    if (!header.endsWith(";base64")) return null
    val mediaType = header.removeSuffix(";base64")
    if (mediaType !in SupportedImageMediaTypes) return null
    val data = runCatching { Base64.getDecoder().decode(url.substring(comma + 1)) }.getOrNull()
        ?.takeIf { it.size in 1..20 * 1024 * 1024 }
        ?: return null
    return DeepSeekInlineImage(mediaType, data, sha256(data))
}

private fun accountScope(config: ModelConfig): String = sha256(
    "${deepSeekApiBase(config)}\u0000${config.apiKey.trim()}".toByteArray(Charsets.UTF_8),
)

private fun deepSeekApiBase(config: ModelConfig): String {
    var value = config.baseUrl.trim().ifBlank { "https://api.deepseek.com" }.trimEnd('/')
    for (suffix in listOf("/chat/completions", "/responses", "/files")) {
        if (value.endsWith(suffix, ignoreCase = true)) {
            value = value.dropLast(suffix.length).trimEnd('/')
            break
        }
    }
    val uri = URI(value)
    require(uri.scheme.equals("https", ignoreCase = true) &&
        uri.host.equals("api.deepseek.com", ignoreCase = true) &&
        uri.userInfo == null && uri.query == null && uri.fragment == null
    ) { "DeepSeek 官方接口地址无效" }
    return value
}

private fun sha256(value: ByteArray): String = MessageDigest
    .getInstance("SHA-256")
    .digest(value)
    .joinToString("") { byte -> "%02x".format(byte) }

private fun JsonObject.string(name: String): String? =
    (get(name) as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank)

private val SupportedImageMediaTypes = setOf(
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
)

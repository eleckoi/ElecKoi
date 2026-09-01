package com.eleckoi.android.engine.agent.remotedsh

import com.eleckoi.android.engine.agent.api.AgentApprovalDecision
import com.eleckoi.android.engine.agent.api.AgentInputImage
import com.eleckoi.android.engine.agent.api.AgentSessionEvent
import java.util.concurrent.ConcurrentHashMap
import java.io.File
import java.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.WebSocket
import java.util.concurrent.TimeUnit

/**
 * Optional Android-side backend plugin for controlling an existing `dsh web` on a PC.
 * It is disconnected by default and never replaces ElecKoi's normal local Agent backend.
 */
class RemoteDshPlugin : AutoCloseable {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    private val roleTaskLocks = ConcurrentHashMap<String, Mutex>()
    private val sessionRefreshLock = Mutex()
    private val titleBySession = ConcurrentHashMap<String, String>()
    private val titleLoadedSessions = ConcurrentHashMap.newKeySet<String>()
    private val eventProjector = RemoteDshEventProjector(titleLoadedSessions::remove)
    private val approvalRegistry = RemoteDshApprovalRegistry()
    private val _state = MutableStateFlow<RemoteDshConnectionState>(RemoteDshConnectionState.Disabled)
    private val _sessions = MutableStateFlow<List<RemoteDshSessionSummary>>(emptyList())
    private val _workspaces = MutableStateFlow<List<RemoteDshWorkspaceSummary>>(emptyList())
    private val _events = MutableSharedFlow<RemoteDshEvent>(extraBufferCapacity = 128)

    val state: StateFlow<RemoteDshConnectionState> = _state.asStateFlow()
    val sessions: StateFlow<List<RemoteDshSessionSummary>> = _sessions.asStateFlow()
    val workspaces: StateFlow<List<RemoteDshWorkspaceSummary>> = _workspaces.asStateFlow()
    val events: SharedFlow<RemoteDshEvent> = _events.asSharedFlow()

    private var tunnel: RemoteDshSshTunnel? = null
    private var api: RemoteDshApiClient? = null
    private var mux: WebSocket? = null
    private var computerName: String = ""

    suspend fun connect(config: RemoteDshConnectionConfig): RemoteDshHostDescription {
        disconnect()
        _state.value = RemoteDshConnectionState.Connecting
        return try {
            val nextTunnel = RemoteDshSshTunnel.open(config)
            val nextApi = RemoteDshApiClient("http://127.0.0.1:${nextTunnel.localPort}", http)
            tunnel = nextTunnel
            api = nextApi
            val host = nextApi.call("host.describe", buildJsonObject { }).toHostDescription()
            computerName = config.name.ifBlank { config.host }
            refreshSessions()
            mux = nextApi.openMux(
                onEnvelope = ::handleMuxEnvelope,
                onFailure = { error ->
                    if (api === nextApi) {
                        _state.value = RemoteDshConnectionState.Failed(
                            error.message ?: "远端 DSH 事件连接已断开",
                        )
                    }
                },
            )
            _state.value = RemoteDshConnectionState.Connected(host, computerName)
            host
        } catch (error: Throwable) {
            disconnect()
            val message = error.message ?: error::class.java.simpleName
            _state.value = RemoteDshConnectionState.Failed(message)
            throw error
        }
    }

    fun disconnect() {
        mux?.close(1000, "ElecKoi remote DSH disconnected")
        mux = null
        api = null
        tunnel?.close()
        tunnel = null
        eventProjector.clear()
        approvalRegistry.clear()
        titleBySession.clear()
        titleLoadedSessions.clear()
        _sessions.value = emptyList()
        _workspaces.value = emptyList()
        _state.value = RemoteDshConnectionState.Disabled
    }

    suspend fun refreshSessions(): List<RemoteDshSessionSummary> = sessionRefreshLock.withLock {
        val currentApi = requireApi()
        val workspaceValue = currentApi.call("workspace.list", buildJsonObject { }).jsonObject
        val workspaces = workspaceValue["items"]?.jsonArray.orEmpty()
            .mapNotNull { element ->
                runCatching { element.jsonObject.toWorkspaceSummary() }.getOrNull()
            }
        val archivedSessionIds = workspaceValue["archivedSessionIds"]?.jsonArray.orEmpty()
            .mapNotNull { it.jsonPrimitive.contentOrNull }
            .toSet()
        val workspaceBySession = buildMap {
            workspaces.forEach { workspace ->
                workspace.sessionIds.forEach { sessionId -> put(sessionId, workspace.workspaceId) }
            }
        }
        val value = currentApi.call("session.list", buildJsonObject { }).jsonObject
        val items = value["items"]?.jsonArray.orEmpty()
            .mapNotNull { element ->
                runCatching {
                    val row = element.jsonObject
                    row.titleProjection()?.let { title ->
                        val sessionId = row.string("sessionId").orEmpty()
                        if (sessionId.isNotBlank()) {
                            titleBySession[sessionId] = title
                            titleLoadedSessions += sessionId
                        }
                    }
                    row.toSessionSummary(
                        workspaceId = row.string("sessionId")
                            ?.let(workspaceBySession::get)
                            .orEmpty(),
                    )
                }.getOrNull()
            }
            .filterNot { it.sessionId in archivedSessionIds || it.origin == "subagent" }
            .map { summary ->
                summary.copy(title = resolveSessionTitle(currentApi, summary))
            }
            .sortedByDescending(RemoteDshSessionSummary::updatedAtMillis)
        _workspaces.value = workspaces
        _sessions.value = items
        return items
    }

    /** Runs one task only in the PC workspace/session explicitly bound to this character. */
    suspend fun runRoleplayTask(
        binding: RemoteDshRoleBinding,
        task: String,
        images: List<AgentInputImage> = emptyList(),
    ): RemoteDshTaskResult {
        require(task.isNotBlank()) { "电脑任务不能为空" }
        require(binding.workspaceId.isNotBlank() && binding.sessionId.isNotBlank()) {
            "当前角色尚未绑定电脑 DSH 工作区和会话"
        }
        val sessionId = binding.sessionId
        return roleTaskLocks.getOrPut(sessionId, ::Mutex).withLock {
            val currentApi = requireApi()
            val current = refreshSessions().firstOrNull { it.sessionId == sessionId }
                ?: error("绑定的电脑 DSH 会话已被移除；请在当前角色的工具页重新绑定")
            check(current.workspaceId == binding.workspaceId) {
                "绑定的电脑 DSH 会话已不在原工作区；请重新绑定"
            }
            check(!current.running) {
                "这个角色关联的电脑 DSH 正在执行其他任务；可点开同步会话查看或停止"
            }
            val baseline = rawHistory(currentApi, sessionId)
                .maxOfOrNull(RemoteDshRawEvent::sequence)
                ?: -1L
            prompt(
                sessionId = sessionId,
                text = task.trim(),
                images = images,
                steer = false,
            )
            val response = withTimeout(RoleplayTaskTimeoutMillis) {
                while (true) {
                    check(api === currentApi) { "电脑 DSH 连接已断开" }
                    when (
                        val projection = projectRemoteDshTask(
                            events = rawHistory(currentApi, sessionId),
                            afterSequence = baseline,
                        )
                    ) {
                        RemoteDshTaskProjection.Pending -> delay(RoleplayTaskPollMillis)
                        is RemoteDshTaskProjection.Completed -> return@withTimeout projection.response
                        is RemoteDshTaskProjection.Failed -> error(projection.message)
                    }
                }
                error("电脑 DSH 任务没有产生结果")
            }
            runCatching { refreshSessions() }
            RemoteDshTaskResult(
                sessionId = sessionId,
                response = response.ifBlank { "电脑 DSH 已完成任务，但没有返回文本结果。" },
            )
        }
    }

    suspend fun createSession(workspaceId: String, title: String): RemoteDshSessionSummary {
        require(workspaceId.isNotBlank()) { "请先选择电脑工作区" }
        require(title.trim().isNotBlank()) { "会话名称不能为空" }
        val currentApi = requireApi()
        val created = currentApi.call(
            "session.create",
            buildJsonObject { put("workspaceId", workspaceId) },
        ).jsonObject
        val sessionId = created.string("sessionId") ?: error("DSH 新建会话未返回 sessionId")
        val renamed = currentApi.call(
            "session.rename",
            buildJsonObject {
                put("sessionId", sessionId)
                put("title", title.trim())
            },
        ).jsonObject
        renamed.string("title")?.let { normalized ->
            titleBySession[sessionId] = normalized
            titleLoadedSessions += sessionId
        }
        return refreshSessions().first { it.sessionId == sessionId }
    }

    suspend fun renameSession(sessionId: String, title: String): RemoteDshSessionSummary {
        require(title.trim().isNotBlank()) { "会话名称不能为空" }
        requireApi().call(
            "session.rename",
            buildJsonObject {
                put("sessionId", sessionId)
                put("title", title.trim())
            },
        )
        return refreshSessions().first { it.sessionId == sessionId }
    }

    /** DSH upstream exposes archival rather than destructive log deletion. */
    suspend fun archiveSession(sessionId: String) {
        requireApi().call(
            "workspace.archiveSession",
            buildJsonObject { put("sessionId", sessionId) },
        )
        titleBySession.remove(sessionId)
        titleLoadedSessions.remove(sessionId)
        refreshSessions()
    }

    /** Loads the durable DSH log and maps it into ElecKoi's native timeline vocabulary. */
    suspend fun loadHistory(sessionId: String): List<RemoteDshEvent> {
        val value = requireApi().call(
            "session.history",
            buildJsonObject {
                put("sessionId", sessionId)
                put("maxMessages", 500)
            },
        ).jsonObject
        value.titleProjection()?.let { title ->
            titleBySession[sessionId] = title
            titleLoadedSessions += sessionId
            updateVisibleSessionTitle(sessionId, title)
        }
        val entries = value["events"]?.jsonArray.orEmpty()
        return eventProjector.projectHistory(sessionId, entries)
    }

    suspend fun prompt(
        sessionId: String,
        text: String,
        images: List<AgentInputImage> = emptyList(),
        steer: Boolean,
    ) {
        require(text.isNotBlank()) { "消息不能为空" }
        val encodedImages = encodePromptImages(images)
        requireApi().call(
            "session.prompt",
            buildJsonObject {
                put("sessionId", sessionId)
                put("mode", if (steer) "steer" else "queue")
                put("content", buildJsonArray {
                    add(buildJsonObject {
                        put("type", "text")
                        put("text", text)
                    })
                    encodedImages.forEach(::add)
                })
                put("clientTimeZone", java.util.TimeZone.getDefault().id)
            },
        )
    }

    suspend fun setPermission(sessionId: String, mode: RemoteDshPermissionMode) {
        prompt(sessionId, "/permission ${mode.wireValue}", steer = false)
    }

    suspend fun cancel(sessionId: String) {
        requireApi().call("session.cancel", buildJsonObject { put("sessionId", sessionId) })
    }

    suspend fun respondToApproval(requestId: Long, decision: AgentApprovalDecision) {
        val response = approvalRegistry.takeResponse(requestId, decision) ?: return
        val pending = response.approval
        requireApi().respond(
            pending.rpcId,
            buildJsonObject {
                put("approvalId", pending.approvalId)
                put("sessionId", pending.sessionId)
                put("outcome", response.outcome)
            },
        )
        _events.emit(
            RemoteDshEvent(
                pending.sessionId,
                null,
                AgentSessionEvent.ApprovalResolved(requestId, pending.sessionId),
            ),
        )
    }

    private fun handleMuxEnvelope(rpcId: String, payload: JsonObject) {
        when (payload.string("type")) {
            "session/event" -> {
                val sessionId = payload.string("sessionId") ?: return
                val event = payload["event"] as? JsonObject ?: return
                val mapped = eventProjector.projectLive(sessionId, event)
                mapped.forEach(_events::tryEmit)
                scope.launch { runCatching { refreshSessions() } }
            }
            "approval/requested" -> {
                val sessionId = payload.string("sessionId") ?: return
                approvalRegistry.requested(rpcId, payload, eventProjector.activeTurnId(sessionId))
                    ?.let(_events::tryEmit)
            }
            "approval/resolved" -> approvalRegistry.resolved(payload)?.let(_events::tryEmit)
            "session/projection" -> handleSessionProjection(payload)
            "session/queue", "session/jobs" -> scope.launch { runCatching { refreshSessions() } }
            "stream/error" -> {
                val message = (payload["error"] as? JsonObject)?.string("message")
                    ?: "远端 DSH 事件流报错"
                _state.value = RemoteDshConnectionState.Failed(message)
            }
        }
    }

    private fun handleSessionProjection(payload: JsonObject) {
        if (payload.string("key") != "title") return
        val sessionId = payload.string("sessionId") ?: return
        val title = payload.string("value") ?: return
        titleBySession[sessionId] = title
        titleLoadedSessions += sessionId
        updateVisibleSessionTitle(sessionId, title)
    }

    private fun updateVisibleSessionTitle(sessionId: String, title: String) {
        _sessions.value = _sessions.value.map { summary ->
            if (summary.sessionId == sessionId) summary.copy(title = title) else summary
        }
    }

    private fun requireApi(): RemoteDshApiClient = api ?: error("远端 DSH 尚未连接")

    private fun encodePromptImages(images: List<AgentInputImage>): List<JsonObject> {
        if (images.isEmpty()) return emptyList()
        val files = images.map { image -> image to File(image.localPath) }
        files.forEach { (image, file) ->
            require(image.mediaType in SupportedImageMediaTypes) {
                "电脑 DSH 不支持图片类型 ${image.mediaType}"
            }
            require(file.isFile) { "找不到要转接给电脑 DSH 的图片：${image.name.ifBlank { file.name }}" }
        }
        require(files.sumOf { (_, file) -> file.length() } <= MaxRemotePromptImageBytes) {
            "转接给电脑 DSH 的图片总大小不能超过 20 MiB"
        }
        val encoder = Base64.getEncoder()
        return files.map { (image, file) ->
            buildJsonObject {
                put("type", "image")
                put("mediaType", image.mediaType)
                put("data", encoder.encodeToString(file.readBytes()))
                image.name.takeIf(String::isNotBlank)?.let { put("name", it) }
            }
        }
    }

    private suspend fun rawHistory(
        client: RemoteDshApiClient,
        sessionId: String,
    ): List<RemoteDshRawEvent> {
        val value = client.call(
            "session.history",
            buildJsonObject {
                put("sessionId", sessionId)
                put("maxMessages", RoleplayTaskHistoryMessages)
            },
        ).jsonObject
        return value["events"]?.jsonArray.orEmpty().mapNotNull { element ->
            val entry = element as? JsonObject ?: return@mapNotNull null
            val event = entry["event"] as? JsonObject ?: return@mapNotNull null
            val sequence = entry["seq"]?.jsonPrimitive?.longOrNull
                ?: event["seq"]?.jsonPrimitive?.longOrNull
                ?: return@mapNotNull null
            RemoteDshRawEvent(sequence, event)
        }
    }

    private suspend fun resolveSessionTitle(
        client: RemoteDshApiClient,
        summary: RemoteDshSessionSummary,
    ): String {
        titleBySession[summary.sessionId]?.let { return it }
        if (!titleLoadedSessions.add(summary.sessionId)) return summary.title
        val title = runCatching {
            client.call(
                "session.history",
                buildJsonObject {
                    put("sessionId", summary.sessionId)
                    put("maxMessages", 1)
                },
            ).jsonObject.titleProjection()
        }.getOrElse {
            titleLoadedSessions.remove(summary.sessionId)
            null
        }
        if (!title.isNullOrBlank()) titleBySession[summary.sessionId] = title
        return title ?: summary.title
    }

    override fun close() {
        disconnect()
        scope.cancel()
        http.dispatcher.executorService.shutdown()
        http.connectionPool.evictAll()
    }

    private companion object {
        const val RoleplayTaskPollMillis = 750L
        const val RoleplayTaskTimeoutMillis = 20L * 60L * 1_000L
        const val RoleplayTaskHistoryMessages = 500
        const val MaxRemotePromptImageBytes = 20L * 1024L * 1024L
        val SupportedImageMediaTypes = setOf("image/png", "image/jpeg", "image/webp", "image/gif")
    }
}

enum class RemoteDshPermissionMode(val wireValue: String) {
    ReadOnly("read-only"),
    WorkspaceWrite("workspace-write"),
    FullAccess("danger-full-access"),
}

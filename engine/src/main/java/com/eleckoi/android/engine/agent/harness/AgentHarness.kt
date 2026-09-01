package com.eleckoi.android.engine.agent.harness

import com.eleckoi.android.engine.agent.api.AgentHarnessId
import com.eleckoi.android.engine.agent.api.AgentSession
import com.eleckoi.android.engine.agent.api.AgentSessionFactory
import com.eleckoi.android.engine.agent.api.AgentSessionOptions

/** One optional behavior exposed by a concrete Agent harness. */
enum class AgentHarnessCapability {
    ResumeSession,
    ForkSession,
    SteerActiveTurn,
    InterruptActiveTurn,
    InteractiveApproval,
    DynamicHostTools,
    RequestContextInjection,
    NativeHistoryImport,
    NativeHistoryCapture,
    StreamingReasoning,
}

/** Product-facing identity and capability contract for one harness implementation. */
data class AgentHarnessDescriptor(
    val id: AgentHarnessId,
    val displayName: String,
    val capabilities: Set<AgentHarnessCapability>,
)

/**
 * Provider-neutral construction boundary. Implementations own their wire protocol and runtime;
 * callers only exchange [AgentSession] commands and events.
 */
interface AgentHarnessBackend : AgentSessionFactory {
    val descriptor: AgentHarnessDescriptor
}

/** Routes each session to exactly one registered harness without exposing implementation types. */
class AgentHarnessRegistry(
    backends: Collection<AgentHarnessBackend>,
) : AgentSessionFactory {
    private val backendsById = backends.associateBy { it.descriptor.id }

    init {
        require(backendsById.size == backends.size) { "Agent Harness 不能重复注册" }
        require(backendsById.isNotEmpty()) { "至少需要注册一个 Agent Harness" }
    }

    val descriptors: List<AgentHarnessDescriptor>
        get() = backendsById.values.map(AgentHarnessBackend::descriptor)

    fun descriptor(id: AgentHarnessId): AgentHarnessDescriptor? = backendsById[id]?.descriptor

    override fun create(options: AgentSessionOptions): AgentSession {
        val backend = backendsById[options.harness]
            ?: error("Agent Harness 未注册：${options.harness}")
        return backend.create(options)
    }
}

package com.eleckoi.android.engine.agent.deepseek

import com.eleckoi.android.engine.agent.api.AgentHarnessId
import com.eleckoi.android.engine.agent.api.AgentSession
import com.eleckoi.android.engine.agent.api.AgentSessionOptions
import com.eleckoi.android.engine.agent.harness.AgentHarnessBackend
import com.eleckoi.android.engine.agent.harness.AgentHarnessCapability
import com.eleckoi.android.engine.agent.harness.AgentHarnessDescriptor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class DeepSeekAgentSessionFactory(
    private val backendFactory: DeepSeekSessionBackendFactory,
) : AgentHarnessBackend {
    override val descriptor = AgentHarnessDescriptor(
        id = AgentHarnessId.DeepSeek,
        displayName = "DeepSeek Harness",
        capabilities = setOf(
            AgentHarnessCapability.ResumeSession,
            AgentHarnessCapability.InterruptActiveTurn,
            AgentHarnessCapability.SteerActiveTurn,
            AgentHarnessCapability.NativeHistoryCapture,
            AgentHarnessCapability.StreamingReasoning,
            AgentHarnessCapability.DynamicHostTools,
            AgentHarnessCapability.InteractiveApproval,
        ),
    )

    override fun create(options: AgentSessionOptions): AgentSession {
        require(options.harness == descriptor.id) { "DeepSeek Harness 收到了其他 Harness 的会话配置" }
        return DeepSeekAgentSession(
            options = options,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
            backendFactory = backendFactory,
        )
    }
}

package com.eleckoi.android.feature.studio.ui.assistant

import com.eleckoi.android.feature.conversation.markdown.*
import com.eleckoi.android.feature.conversation.timeline.*
import com.eleckoi.android.feature.conversation.timeline.model.*
import com.eleckoi.android.feature.conversation.timeline.ui.*

import com.eleckoi.android.engine.agent.api.AgentCommandAction
import com.eleckoi.android.engine.agent.api.AgentCommandActionType
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.engine.agent.api.AgentMessagePhase
import com.eleckoi.android.engine.agent.api.AgentGlobSettingFilesTool
import com.eleckoi.android.engine.agent.api.AgentReadSettingFilesTool
import com.eleckoi.android.feature.conversation.timeline.CreationProcessBlock
import com.eleckoi.android.feature.conversation.timeline.CreationTailBlock
import com.eleckoi.android.feature.conversation.timeline.isReadOperation
import com.eleckoi.android.feature.conversation.timeline.latestLiveDetailItems
import com.eleckoi.android.feature.conversation.timeline.operationSummary
import com.eleckoi.android.feature.conversation.timeline.components.TimelineStatusPace
import com.eleckoi.android.feature.conversation.timeline.components.timelineStatusUpdate
import com.eleckoi.android.feature.conversation.timeline.readOperationPaths
import com.eleckoi.android.feature.conversation.timeline.runningOperationLabel
import com.eleckoi.android.feature.conversation.timeline.resolveLiveDetailItems
import com.eleckoi.android.feature.conversation.timeline.shouldShowInitialThinkingRow
import com.eleckoi.android.feature.conversation.timeline.toCreationTurns
import com.eleckoi.android.feature.conversation.timeline.toChronologicalTailBlocks
import com.eleckoi.android.feature.conversation.timeline.toProcessBlocks
import com.eleckoi.android.feature.conversation.timeline.visibleOuterProcessingItems
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CreationTimelineGroupingTest {
    @Test
    fun `processed timer prefers attempt start without rewriting raw message time`() {
        val user = CreationTimelineItem(
            id = "user",
            kind = CreationTimelineKind.User,
            text = "重新生成",
            turnId = "turn",
            createdAtMillis = 500L,
            turnStartedAtMillis = 1_000L,
        )

        val turn = listOf(user).toCreationTurns(isRunning = true).single()

        assertEquals(500L, turn.user?.createdAtMillis)
        assertEquals(1_000L, turn.startedAtMillis)
    }

    @Test
    fun `legacy failed turn without completion time never falls back to wall clock`() {
        val failedUser = CreationTimelineItem(
            id = "failed-user",
            kind = CreationTimelineKind.User,
            text = "生成页面",
            createdAtMillis = 1_000L,
            turnStartedAtMillis = 1_000L,
            failed = true,
            completedAtMillis = null,
        )

        val turn = listOf(failedUser).toCreationTurns(isRunning = false).single()

        assertEquals(1_000L, turn.completedAtMillis)
    }

    @Test
    fun `request boundaries group operations without becoming visible rows`() {
        val requestOne = tool("request-1", AgentWorkItemType.Request, "请求 1")
        val firstTool = tool("read", AgentWorkItemType.Tool, "读取设定")
        val requestTwo = tool("request-2", AgentWorkItemType.Request, "请求 2")
        val secondTool = tool("plan", AgentWorkItemType.Tool, "更新计划")

        val blocks = listOf(requestOne, firstTool, requestTwo, secondTool).toProcessBlocks()
        val operations = blocks.single() as CreationProcessBlock.Operations

        assertEquals(1, blocks.size)
        assertEquals(
            listOf(firstTool, secondTool),
            operations.items,
        )
        assertEquals("调用了多个工具", operationSummary(operations.items))
        assertEquals(listOf(secondTool), latestLiveDetailItems(listOf(secondTool, requestTwo)))
        assertTrue(listOf(requestOne).toProcessBlocks().isEmpty())

        val tailOperations = listOf(requestOne, firstTool, requestTwo)
            .toChronologicalTailBlocks()
            .single() as CreationTailBlock.Operations
        assertEquals(listOf(firstTool), tailOperations.items)
        assertFalse(operationSummary(listOf(requestOne)).contains("模型请求"))
    }

    @Test
    fun `same turn steer remains inside one processed turn`() {
        val initial = CreationTimelineItem(
            id = "initial",
            kind = CreationTimelineKind.User,
            text = "生成页面",
            turnId = "turn",
        )
        val file = tool(
            id = "file",
            type = AgentWorkItemType.FileChange,
            text = "修改文件",
        ).copy(turnId = "turn")
        val steer = CreationTimelineItem(
            id = "steer",
            kind = CreationTimelineKind.User,
            text = "算了不要了",
            workItemId = "steer-item",
            workItemType = AgentWorkItemType.UserMessage,
            turnId = "turn",
        )

        val turn = listOf(initial, file, steer).toCreationTurns(isRunning = true).single()
        val blocks = turn.processing.toProcessBlocks()

        assertEquals(initial, turn.user)
        assertEquals(listOf(file), turn.processing)
        assertEquals(listOf(steer), turn.chronologicalTail)
        assertEquals(file, (blocks[0] as CreationProcessBlock.Operations).items.single())
        assertTrue(
            !shouldShowInitialThinkingRow(
                blocks = blocks,
                turnRunning = true,
            ),
        )
    }

    @Test
    fun `steer keeps every later server item below its bubble in event order`() {
        val initial = CreationTimelineItem(
            id = "initial",
            kind = CreationTimelineKind.User,
            text = "生成页面",
            turnId = "turn",
        )
        val beforeSteer = CreationTimelineItem(
            id = "before",
            kind = CreationTimelineKind.Assistant,
            text = "我先生成页面",
            turnId = "turn",
            messagePhase = AgentMessagePhase.Commentary,
        )
        val steer = CreationTimelineItem(
            id = "steer",
            kind = CreationTimelineKind.User,
            text = "算了不要了",
            turnId = "turn",
        )
        val file = tool(
            id = "file",
            type = AgentWorkItemType.FileChange,
            text = "修改文件",
        ).copy(turnId = "turn")
        val afterSteer = CreationTimelineItem(
            id = "after",
            kind = CreationTimelineKind.Assistant,
            text = "好的，那我删掉这个文件",
            turnId = "turn",
            messagePhase = AgentMessagePhase.Commentary,
        )
        val final = CreationTimelineItem(
            id = "final",
            kind = CreationTimelineKind.Assistant,
            text = "文件已删除",
            turnId = "turn",
            messagePhase = AgentMessagePhase.FinalAnswer,
        )

        val turn = listOf(initial, beforeSteer, steer, file, afterSteer, final)
            .toCreationTurns(isRunning = false)
            .single()
        val tailBlocks = turn.chronologicalTail.toChronologicalTailBlocks()

        assertEquals(listOf(beforeSteer), turn.processing)
        assertEquals(listOf(steer, file, afterSteer), turn.chronologicalTail)
        assertEquals(final, turn.finalAnswer)
        assertEquals(steer, (tailBlocks[0] as CreationTailBlock.UserInput).item)
        assertEquals(listOf(file), (tailBlocks[1] as CreationTailBlock.Operations).items)
        assertEquals(afterSteer, (tailBlocks[2] as CreationTailBlock.Narrative).item)
    }

    @Test
    fun `committed steer transfers live status ownership away from processing`() {
        val commentary = CreationTimelineItem(
            id = "commentary",
            kind = CreationTimelineKind.Assistant,
            text = "我先检查页面结构",
            turnId = "turn",
            messagePhase = AgentMessagePhase.Commentary,
        )
        val steer = CreationTimelineItem(
            id = "steer",
            kind = CreationTimelineKind.User,
            text = "不要了",
            workItemType = AgentWorkItemType.UserMessage,
            turnId = "turn",
        )
        val turn = listOf(
            CreationTimelineItem(
                id = "initial",
                kind = CreationTimelineKind.User,
                text = "生成页面",
                turnId = "turn",
            ),
            commentary,
            steer,
        ).toCreationTurns(isRunning = true).single()

        assertEquals(listOf(commentary), turn.processing)
        assertEquals(listOf(steer), turn.chronologicalTail)
        assertTrue(
            !shouldShowInitialThinkingRow(
                blocks = turn.processing.toProcessBlocks(),
                turnRunning = true,
                hasFollowingChronologicalItems = true,
            ),
        )
    }

    @Test
    fun `running command after steer stays below bubble and suppresses fake thinking row`() {
        val initial = CreationTimelineItem(
            id = "initial",
            kind = CreationTimelineKind.User,
            text = "生成表格",
            turnId = "turn",
        )
        val steer = CreationTimelineItem(
            id = "steer",
            kind = CreationTimelineKind.User,
            text = "不是有镜像源吗",
            workItemType = AgentWorkItemType.UserMessage,
            turnId = "turn",
        )
        val commentary = CreationTimelineItem(
            id = "commentary",
            kind = CreationTimelineKind.Assistant,
            text = "好的，我来用镜像源安装。",
            turnId = "turn",
            messagePhase = AgentMessagePhase.Commentary,
        )
        val command = tool(
            id = "mirror-command",
            type = AgentWorkItemType.Command,
            text = "使用镜像安装 openpyxl",
        ).copy(turnId = "turn", running = true)

        val turn = listOf(initial, steer, commentary, command)
            .toCreationTurns(isRunning = true)
            .single()
        val blocks = turn.chronologicalTail.toChronologicalTailBlocks()

        assertTrue(turn.processing.isEmpty())
        assertEquals(steer, (blocks[0] as CreationTailBlock.UserInput).item)
        assertEquals(commentary, (blocks[1] as CreationTailBlock.Narrative).item)
        assertEquals(listOf(command), (blocks[2] as CreationTailBlock.Operations).items)
    }

    @Test
    fun `streaming process narrative owns the live row without a duplicate thinking row`() {
        val streaming = CreationTimelineItem(
            id = "streaming-commentary",
            kind = CreationTimelineKind.Assistant,
            text = "正在持续生成阶段性说明",
            running = true,
            messagePhase = AgentMessagePhase.Commentary,
        )
        val blocks = listOf(streaming).toProcessBlocks()

        assertTrue(
            !shouldShowInitialThinkingRow(
                blocks = blocks,
                turnRunning = true,
            ),
        )
        assertTrue(
            !shouldShowInitialThinkingRow(
                blocks = listOf(streaming.copy(running = false)).toProcessBlocks(),
                turnRunning = true,
            ),
        )
    }

    @Test
    fun `streaming narrative after steer does not get a second thinking row`() {
        val steer = CreationTimelineItem(
            id = "steer",
            kind = CreationTimelineKind.User,
            text = "继续",
        )
        val streaming = CreationTimelineItem(
            id = "streaming-after-steer",
            kind = CreationTimelineKind.Assistant,
            text = "正在响应补充要求",
            running = true,
            messagePhase = AgentMessagePhase.Commentary,
        )
        val blocks = listOf(steer, streaming).toChronologicalTailBlocks()

        assertEquals(2, blocks.size)
        assertEquals(streaming, (blocks[1] as CreationTailBlock.Narrative).item)
    }

    @Test
    fun `different turn ids still create separate processed turns`() {
        val turns = listOf(
            CreationTimelineItem(
                kind = CreationTimelineKind.User,
                text = "第一回合",
                turnId = "turn-1",
            ),
            CreationTimelineItem(
                kind = CreationTimelineKind.User,
                text = "第二回合",
                turnId = "turn-2",
            ),
        ).toCreationTurns(isRunning = true)

        assertEquals(2, turns.size)
    }

    @Test
    fun `running work stays in the same operation group until stage commentary arrives`() {
        val completedDirectoryRead = tool(
            id = "list",
            type = AgentWorkItemType.Command,
            text = "查看目录",
            commandActions = listOf(
                AgentCommandAction(
                    type = AgentCommandActionType.ListFiles,
                    path = "/workspace",
                ),
            ),
        )
        val runningTool = tool(
            id = "tool",
            type = AgentWorkItemType.Tool,
            text = "调用工具",
        ).copy(running = true)

        val visible = visibleOuterProcessingItems(
            items = listOf(completedDirectoryRead, runningTool),
            turnRunning = true,
        )
        val operations = visible.toProcessBlocks().single() as CreationProcessBlock.Operations

        assertEquals(listOf(completedDirectoryRead, runningTool), operations.items)
        assertEquals(
            "正在调用工具",
            timelineStatusUpdate(operations.items, turnRunning = true).status.label,
        )
    }

    @Test
    fun `stage commentary separates completed work from the newest running group`() {
        val completed = tool("list", AgentWorkItemType.Command, "查看目录")
        val commentary = CreationTimelineItem(
            id = "commentary",
            kind = CreationTimelineKind.Assistant,
            text = "接下来创建页面。",
            messagePhase = AgentMessagePhase.Commentary,
        )
        val running = tool(
            id = "edit",
            type = AgentWorkItemType.FileChange,
            text = "正在编辑文件",
        ).copy(running = true)

        val blocks = visibleOuterProcessingItems(
            items = listOf(completed, commentary, running),
            turnRunning = true,
        ).toProcessBlocks()

        assertEquals(3, blocks.size)
        assertEquals(listOf(completed), (blocks[0] as CreationProcessBlock.Operations).items)
        assertEquals(commentary, (blocks[1] as CreationProcessBlock.Narrative).item)
        assertEquals(listOf(running), (blocks[2] as CreationProcessBlock.Operations).items)
    }

    @Test
    fun `running turn keeps completed work between narratives while current work uses status slot`() {
        val completedDirectoryRead = tool(
            id = "list",
            type = AgentWorkItemType.Command,
            text = "查看目录",
            commandActions = listOf(
                AgentCommandAction(
                    type = AgentCommandActionType.ListFiles,
                    path = "/workspace",
                ),
            ),
        )
        val commentary = CreationTimelineItem(
            id = "commentary",
            kind = CreationTimelineKind.Assistant,
            text = "文件已生成，正在准备预览",
            messagePhase = AgentMessagePhase.Commentary,
        )

        val visible = visibleOuterProcessingItems(
            items = listOf(completedDirectoryRead, commentary),
            turnRunning = true,
        )

        assertEquals(listOf(completedDirectoryRead, commentary), visible)
        assertEquals(
            listOf(completedDirectoryRead, commentary),
            visibleOuterProcessingItems(
                items = listOf(completedDirectoryRead, commentary),
                turnRunning = false,
            ),
        )
    }

    @Test
    fun `later agent stage settles earlier running row without removing it`() {
        val earlierTool = tool(
            id = "read",
            type = AgentWorkItemType.Tool,
            text = "读取设定",
        ).copy(running = true)
        val commentary = CreationTimelineItem(
            id = "commentary",
            kind = CreationTimelineKind.Assistant,
            text = "设定已读取，接着检查变量。",
            running = true,
            messagePhase = AgentMessagePhase.Commentary,
        )
        val currentTool = tool(
            id = "grep",
            type = AgentWorkItemType.Tool,
            text = "搜索变量",
        ).copy(running = true)

        val visible = visibleOuterProcessingItems(
            items = listOf(earlierTool, commentary, currentTool),
            turnRunning = true,
        )
        val blocks = visible.toProcessBlocks()

        assertEquals(listOf("read", "commentary", "grep"), visible.map(CreationTimelineItem::id))
        assertFalse(visible[0].running)
        assertTrue(visible[1].running)
        assertTrue(visible[2].running)
        assertEquals(3, blocks.size)
    }

    @Test
    fun `live detail prefers newest tool over commentary without tool detail`() {
        val completed = tool("completed", AgentWorkItemType.Command, "检查目录")
        val running = tool("running", AgentWorkItemType.FileChange, "正在编辑文件").copy(running = true)
        val lateNarrative = CreationTimelineItem(
            id = "late-commentary",
            kind = CreationTimelineKind.Assistant,
            text = "文件即将写入完成。",
            running = true,
            messagePhase = AgentMessagePhase.Commentary,
        )

        assertEquals(
            listOf(running),
            latestLiveDetailItems(listOf(completed, running, lateNarrative)),
        )
        assertEquals(
            listOf(completed),
            latestLiveDetailItems(listOf(completed, lateNarrative)),
        )
    }

    @Test
    fun `consecutive commands collapse into one operation group`() {
        val blocks = listOf(
            tool("one", AgentWorkItemType.Command, "rg one"),
            tool("two", AgentWorkItemType.Command, "rg two"),
        ).toProcessBlocks()

        assertEquals(1, blocks.size)
        val operations = blocks.single() as CreationProcessBlock.Operations
        assertEquals("运行了多个命令", operationSummary(operations.items))
    }

    @Test
    fun `context compaction is a dedicated official timeline row`() {
        val command = tool("command", AgentWorkItemType.Command, "检查项目")
        val compaction = tool(
            id = "compact",
            type = AgentWorkItemType.ContextCompaction,
            text = "自动压缩上下文",
        ).copy(running = true)
        val file = tool("file", AgentWorkItemType.FileChange, "修改文件")

        val blocks = listOf(command, compaction, file).toProcessBlocks()

        assertEquals(3, blocks.size)
        assertEquals(listOf(command), (blocks[0] as CreationProcessBlock.Operations).items)
        assertEquals(listOf(compaction), (blocks[1] as CreationProcessBlock.Operations).items)
        assertEquals(listOf(file), (blocks[2] as CreationProcessBlock.Operations).items)
        assertEquals(
            "正在自动压缩",
            timelineStatusUpdate(listOf(compaction), turnRunning = true).status.label,
        )
        assertEquals(
            "上下文已自动压缩",
            operationSummary(listOf(compaction.copy(running = false))),
        )
    }

    @Test
    fun `steer during inline auto compaction stays in the same turn after compaction row`() {
        val initial = CreationTimelineItem(
            id = "initial",
            kind = CreationTimelineKind.User,
            text = "继续完成页面",
            turnId = "turn",
        )
        val compaction = tool(
            id = "compact",
            type = AgentWorkItemType.ContextCompaction,
            text = "自动压缩上下文",
        ).copy(turnId = "turn")
        val steer = CreationTimelineItem(
            id = "steer",
            kind = CreationTimelineKind.User,
            text = "先修复按钮",
            workItemType = AgentWorkItemType.UserMessage,
            turnId = "turn",
        )
        val followUp = CreationTimelineItem(
            id = "follow-up",
            kind = CreationTimelineKind.Assistant,
            text = "我先修复按钮。",
            turnId = "turn",
            messagePhase = AgentMessagePhase.Commentary,
        )

        val turn = listOf(initial, compaction, steer, followUp)
            .toCreationTurns(isRunning = true)
            .single()

        assertEquals(listOf(compaction), turn.processing)
        assertEquals(listOf(steer, followUp), turn.chronologicalTail)
        assertEquals(
            "上下文已自动压缩",
            operationSummary(
                (turn.processing.toProcessBlocks().single() as CreationProcessBlock.Operations).items,
            ),
        )
    }

    @Test
    fun `stage commentary keeps neighboring tool groups separate and ordered`() {
        val firstNarrative = CreationTimelineItem(
            id = "stage-1",
            kind = CreationTimelineKind.Assistant,
            text = "先创建页面。",
            messagePhase = AgentMessagePhase.Commentary,
        )
        val firstTool = tool("write", AgentWorkItemType.FileChange, "编辑文件")
        val secondNarrative = CreationTimelineItem(
            id = "stage-2",
            kind = CreationTimelineKind.Assistant,
            text = "接下来检查结构。",
            messagePhase = AgentMessagePhase.Commentary,
        )
        val secondTool = tool("check", AgentWorkItemType.Command, "检查文件")

        val blocks = listOf(
            firstNarrative,
            firstTool,
            secondNarrative,
            secondTool,
        ).toProcessBlocks()

        assertEquals(4, blocks.size)
        assertEquals(firstNarrative, (blocks[0] as CreationProcessBlock.Narrative).item)
        assertEquals(listOf(firstTool), (blocks[1] as CreationProcessBlock.Operations).items)
        assertEquals(secondNarrative, (blocks[2] as CreationProcessBlock.Narrative).item)
        assertEquals(listOf(secondTool), (blocks[3] as CreationProcessBlock.Operations).items)
    }

    @Test
    fun `reasoning and tools remain one stage until commentary separates them`() {
        val command = tool("command", AgentWorkItemType.Command, "rg file")
        val reasoning = tool(
            "thought",
            AgentWorkItemType.Reasoning,
            text = "",
            detail = "需要先确认路径",
        )
        val file = tool(
            "file",
            AgentWorkItemType.FileChange,
            "修改文件",
            paths = listOf("index.html"),
        )
        val blocks = listOf(
            command,
            reasoning,
            file,
        ).toProcessBlocks()

        assertEquals(1, blocks.size)
        val operations = blocks.single() as CreationProcessBlock.Operations
        assertEquals(listOf(command, reasoning, file), operations.items)
        assertEquals("编辑了文件，运行了命令", operationSummary(operations.items))
    }

    @Test
    fun `thinking placeholder exists only before the first real turn event`() {
        val command = tool("command", AgentWorkItemType.Command, "pnpm test")
        val commentary = CreationTimelineItem(
            id = "stage",
            kind = CreationTimelineKind.Assistant,
            text = "测试完成，接下来整理结果。",
            messagePhase = AgentMessagePhase.Commentary,
        )

        assertTrue(
            shouldShowInitialThinkingRow(
                blocks = emptyList(),
                turnRunning = true,
            ),
        )
        assertTrue(
            !shouldShowInitialThinkingRow(
                blocks = listOf(command).toProcessBlocks(),
                turnRunning = true,
            ),
        )
        assertTrue(
            !shouldShowInitialThinkingRow(
                blocks = listOf(commentary).toProcessBlocks(),
                turnRunning = true,
            ),
        )
    }

    @Test
    fun `running reasoning keeps thinking identity inside a mixed operation stage`() {
        val completedCommand = tool(
            id = "command",
            type = AgentWorkItemType.Command,
            text = "运行测试",
        )
        val runningReasoning = tool(
            id = "reasoning",
            type = AgentWorkItemType.Reasoning,
            text = "分析测试结果",
        ).copy(running = true)

        val update = timelineStatusUpdate(
            items = listOf(completedCommand, runningReasoning),
            turnRunning = true,
        )

        assertEquals("正在思考", update.status.label)
        assertTrue(update.status.thinking)
        assertTrue(update.status.running)
        assertEquals(TimelineStatusPace.Live, update.pace)
    }

    @Test
    fun `a live turn does not invent thinking between two tool calls`() {
        val completed = listOf(
            tool("glob", AgentWorkItemType.Tool, "列出设定条目")
                .copy(toolName = AgentGlobSettingFilesTool),
            tool("read", AgentWorkItemType.Tool, "读取设定条目")
                .copy(toolName = AgentReadSettingFilesTool),
        )

        val betweenSteps = timelineStatusUpdate(completed, turnRunning = true)

        assertEquals(operationSummary(completed), betweenSteps.status.label)
        assertFalse(betweenSteps.status.running)
        assertFalse(betweenSteps.status.thinking)
        assertEquals(TimelineStatusPace.Settled, betweenSteps.pace)

        val finished = timelineStatusUpdate(completed, turnRunning = false)

        assertFalse(finished.status.running)
        assertFalse(finished.status.thinking)
        assertEquals(operationSummary(completed), finished.status.label)
        // A settled turn is a fact, not a guess. Pacing it is what makes the reply land late.
        assertEquals(TimelineStatusPace.Settled, finished.pace)
    }

    @Test
    fun `final answer cannot retitle the first reasoning block as a tool call`() {
        val reasoning = tool(
            id = "summary",
            type = AgentWorkItemType.Reasoning,
            text = "准备修改界面结构",
            detail = "先找到输入框实现",
        )
        val commentary = CreationTimelineItem(
            kind = CreationTimelineKind.Assistant,
            text = "我现在开始修改页面。",
            messagePhase = AgentMessagePhase.Commentary,
        )
        val file = tool("edit", AgentWorkItemType.FileChange, "修改文件")
        val blocks = listOf(
            CreationTimelineItem(kind = CreationTimelineKind.User, text = "修改页面"),
            reasoning,
            commentary,
            file,
            CreationTimelineItem(
                kind = CreationTimelineKind.Assistant,
                text = "页面已经修改完成。",
                messagePhase = AgentMessagePhase.FinalAnswer,
            ),
        ).toCreationTurns(isRunning = false).single().processing.toProcessBlocks()

        assertEquals(3, blocks.size)
        val reasoningBlock = blocks[0] as CreationProcessBlock.Operations
        val narrativeBlock = blocks[1] as CreationProcessBlock.Narrative
        val fileBlock = blocks[2] as CreationProcessBlock.Operations
        assertEquals(listOf(reasoning), reasoningBlock.items)
        val settledReasoning = timelineStatusUpdate(reasoningBlock.items, turnRunning = false)
        assertEquals("思考过程", settledReasoning.status.label)
        // 思考过程 is the cat's row whether or not it is still running.
        assertTrue(settledReasoning.status.thinking)
        assertEquals(commentary, narrativeBlock.item)
        assertEquals(listOf(file), fileBlock.items)
        assertEquals("编辑了文件", operationSummary(fileBlock.items))
    }

    @Test
    fun `empty completed reasoning creates no visible row`() {
        val blocks = listOf(
            tool("empty", AgentWorkItemType.Reasoning, text = "", detail = ""),
        ).toProcessBlocks()

        assertTrue(blocks.isEmpty())
    }

    @Test
    fun `final protocol boundary does not blank a neighboring reasoning summary`() {
        val reasoning = tool(
            id = "reasoning",
            type = AgentWorkItemType.Reasoning,
            text = "",
            detail = "先判断是否需要读取设定。",
        )
        val finalBoundary = tool(
            id = "final-boundary",
            type = AgentWorkItemType.AssistantMessage,
            text = "已检测到 FINAL 正文",
            detail = "<FINAL>",
        ).copy(phaseHeader = AgentMessagePhase.FinalAnswer)

        val operations = listOf(reasoning, finalBoundary)
            .toProcessBlocks()
            .single() as CreationProcessBlock.Operations
        val status = timelineStatusUpdate(operations.items, turnRunning = false).status

        assertEquals("思考过程", status.label)
        assertTrue(status.thinking)
    }

    @Test
    fun `empty running reasoning creates no visible placeholder row`() {
        val blocks = listOf(
            tool("empty-running", AgentWorkItemType.Reasoning, text = "", detail = "")
                .copy(running = true),
        ).toProcessBlocks()

        assertTrue(blocks.isEmpty())
    }

    @Test
    fun `raw command text is not parsed when official command actions are absent`() {
        val item = tool(
            "read",
            AgentWorkItemType.Command,
            "/bin/bash -lc 'cat /workspace/README.md'",
        )

        assertTrue(!item.isReadOperation())
        assertTrue(item.readOperationPaths().isEmpty())
        assertEquals("运行了命令", operationSummary(listOf(item)))
    }

    @Test
    fun `write redirection is not mistaken for a file read`() {
        val item = tool(
            "write",
            AgentWorkItemType.Command,
            "/bin/bash -lc 'cat > /workspace/index.html'",
        )

        assertTrue(!item.isReadOperation())
        assertEquals("运行了命令", operationSummary(listOf(item)))
    }

    @Test
    fun `Harness commentary remains progress and final answer is terminal`() {
        val turns = listOf(
            CreationTimelineItem(kind = CreationTimelineKind.User, text = "修改页面"),
            CreationTimelineItem(
                kind = CreationTimelineKind.Assistant,
                text = "我先检查当前结构。",
                messagePhase = AgentMessagePhase.Commentary,
            ),
            CreationTimelineItem(
                kind = CreationTimelineKind.Assistant,
                text = "页面已经修改完成。",
                messagePhase = AgentMessagePhase.FinalAnswer,
            ),
        ).toCreationTurns(isRunning = false)

        val turn = turns.single()
        assertEquals("页面已经修改完成。", turn.finalAnswer?.text)
        assertEquals(listOf("我先检查当前结构。"), turn.processing.map(CreationTimelineItem::text))
    }

    @Test
    fun `phase omitted remains a terminal answer`() {
        val turn = listOf(
            CreationTimelineItem(kind = CreationTimelineKind.User, text = "继续"),
            CreationTimelineItem(kind = CreationTimelineKind.Assistant, text = "完成。"),
        ).toCreationTurns(isRunning = false).single()

        assertEquals("完成。", turn.finalAnswer?.text)
    }

    @Test
    fun `turn merges workspace absolute and relative file paths`() {
        val turn = listOf(
            CreationTimelineItem(kind = CreationTimelineKind.User, text = "修改页面"),
            tool(
                id = "file-1",
                type = AgentWorkItemType.FileChange,
                text = "修改文件",
                paths = listOf("/workspace/index.html", "index.html"),
            ),
        ).toCreationTurns(isRunning = false).single()

        assertEquals(listOf("index.html"), turn.paths)
        assertEquals("编辑了文件", operationSummary(turn.processing))
    }

    @Test
    fun `reasoning reads as thinking with or without streamed thought text`() {
        val reasoning = tool(
            id = "reasoning-1",
            type = AgentWorkItemType.Reasoning,
            text = "",
            detail = "我先检查项目结构，再决定如何修改。",
        )

        assertEquals(
            "正在思考",
            runningOperationLabel(reasoning, hasStreamingAnswer = false),
        )
        assertEquals(
            "正在思考",
            runningOperationLabel(
                reasoning.copy(detail = "进行中"),
                hasStreamingAnswer = false,
            ),
        )
    }

    @Test
    fun `running operation status stays concise while tools alternate`() {
        assertEquals(
            "正在搜索 reasoning",
            runningOperationLabel(
                tool(
                    id = "command",
                    type = AgentWorkItemType.Command,
                    text = "搜索 reasoning",
                    rawCommand = "/bin/bash -lc 'rg reasoning app/src'",
                    commandActions = listOf(
                        AgentCommandAction(
                            type = AgentCommandActionType.Search,
                            command = "rg reasoning app/src",
                            query = "reasoning",
                            path = "app/src",
                        ),
                    ),
                ),
                hasStreamingAnswer = false,
            ),
        )
        assertEquals(
            "正在编辑文件",
            runningOperationLabel(
                tool("file", AgentWorkItemType.FileChange, "修改文件"),
                hasStreamingAnswer = false,
            ),
        )
        assertEquals(
            "正在调用 files · read_file",
            runningOperationLabel(
                tool(
                    "tool",
                    AgentWorkItemType.Tool,
                    "files · read_file",
                    toolName = "files · read_file",
                ),
                hasStreamingAnswer = false,
            ),
        )
    }

    @Test
    fun `structured command actions distinguish reads searches lists and ordinary runs`() {
        val read = tool(
            id = "read",
            type = AgentWorkItemType.Command,
            text = "读取 index.html",
            rawCommand = "cat /workspace/index.html",
            commandActions = listOf(
                AgentCommandAction(
                    type = AgentCommandActionType.Read,
                    command = "cat /workspace/index.html",
                    name = "index.html",
                    path = "/workspace/index.html",
                ),
            ),
        )
        val list = tool(
            id = "list",
            type = AgentWorkItemType.Command,
            text = "查看目录 src",
            rawCommand = "find /workspace/src -maxdepth 1",
            commandActions = listOf(
                AgentCommandAction(
                    type = AgentCommandActionType.ListFiles,
                    command = "find /workspace/src -maxdepth 1",
                    path = "/workspace/src",
                ),
            ),
        )
        val run = tool(
            id = "run",
            type = AgentWorkItemType.Command,
            text = "运行 pnpm test",
            rawCommand = "/bin/bash -lc 'pnpm test'",
            commandActions = listOf(
                AgentCommandAction(
                    type = AgentCommandActionType.Unknown,
                    command = "pnpm test",
                ),
            ),
        )

        assertTrue(read.isReadOperation())
        assertEquals(listOf("/workspace/index.html"), read.readOperationPaths())
        assertEquals("正在读取 index.html", runningOperationLabel(read, false))
        assertEquals("正在查看目录 src", runningOperationLabel(list, false))
        assertEquals("正在运行 pnpm test", runningOperationLabel(run, false))
        assertEquals("读取了文件，查看了目录，运行了命令", operationSummary(listOf(read, list, run)))
    }

    private fun tool(
        id: String,
        type: AgentWorkItemType,
        text: String,
        detail: String = "",
        paths: List<String> = emptyList(),
        toolName: String = "",
        rawCommand: String = "",
        commandActions: List<AgentCommandAction> = emptyList(),
    ) = CreationTimelineItem(
        id = id,
        kind = CreationTimelineKind.Tool,
        text = text,
        detail = detail,
        workItemType = type,
        paths = paths,
        toolName = toolName,
        rawCommand = rawCommand,
        commandActions = commandActions,
    )
}

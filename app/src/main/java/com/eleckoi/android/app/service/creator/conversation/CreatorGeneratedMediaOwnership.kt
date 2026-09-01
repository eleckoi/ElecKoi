package com.eleckoi.android.app.service

import com.eleckoi.android.engine.agent.api.AgentCallCreatorCapabilityTool
import com.eleckoi.android.engine.workspace.model.CreatorConversationTimelineItem
import com.eleckoi.android.foundation.serialization.ElecKoiPrettyJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

internal fun generatedMediaAssetIdsAfter(
    timeline: List<CreatorConversationTimelineItem>,
    retainedUserId: String,
): Set<String> {
    val retainedIndex = timeline.indexOfLast { item -> item.id == retainedUserId }
    if (retainedIndex < 0) return emptySet()
    return timeline
        .drop(retainedIndex + 1)
        .asSequence()
        .flatMap(CreatorConversationTimelineItem::selfAndChildren)
        .mapNotNull(CreatorConversationTimelineItem::generatedMediaAssetId)
        .toSet()
}

private fun CreatorConversationTimelineItem.selfAndChildren(): Sequence<CreatorConversationTimelineItem> = sequence {
    yield(this@selfAndChildren)
    childTimeline.forEach { child -> yieldAll(child.selfAndChildren()) }
}

private fun CreatorConversationTimelineItem.generatedMediaAssetId(): String? {
    if (failed || toolName != AgentCallCreatorCapabilityTool) return null
    val call = runCatching { ElecKoiPrettyJson.parseToJsonElement(toolArguments).jsonObject }.getOrNull()
        ?: return null
    if ((call["capability_id"] as? JsonPrimitive)?.contentOrNull != "character_media.generate_asset") {
        return null
    }
    val result = runCatching { ElecKoiPrettyJson.parseToJsonElement(detail).jsonObject }.getOrNull()
        ?: return null
    if ((result["status"] as? JsonPrimitive)?.contentOrNull != "generated") return null
    val asset = result["asset"] as? JsonObject ?: return null
    return (asset["assetId"] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank)
}

package com.eleckoi.android.foundation.design.components

enum class RootTab(val label: String, val icon: NavIconKind) {
    Messages("消息", NavIconKind.Messages),
    Characters("角色", NavIconKind.Characters),
    Models("模型", NavIconKind.Models),
}

enum class BottomTab(
    val storageKey: String,
    val label: String,
    val icon: NavIconKind,
) {
    Messages("messages", "消息", NavIconKind.Messages),
    Characters("characters", "角色", NavIconKind.Characters),
    Models("models", "模型", NavIconKind.Models),
    Presets("presets", "预设", NavIconKind.Presets),
    Plugins("plugins", "插件", NavIconKind.Plugins),
    ;

    fun rootTabOrNull(): RootTab? = when (this) {
        Messages -> RootTab.Messages
        Characters -> RootTab.Characters
        Models -> RootTab.Models
        Presets,
        Plugins,
        -> null
    }

    companion object {
        val DefaultTabs = listOf(Messages, Characters, Models)
        val DefaultOrder = entries.toList()

        fun visibleTabs(
            presetsPinned: Boolean,
            pluginsPinned: Boolean,
            order: List<BottomTab> = DefaultOrder,
        ): List<BottomTab> {
            val optionalPage = optionalPage(presetsPinned, pluginsPinned, order)
            return normalizeOrder(order).filter { tab -> tab in DefaultTabs || tab == optionalPage }
        }

        fun optionalPage(
            presetsPinned: Boolean,
            pluginsPinned: Boolean,
            order: List<BottomTab> = DefaultOrder,
        ): BottomTab? = normalizeOrder(order).firstOrNull { tab ->
            (tab == Presets && presetsPinned) || (tab == Plugins && pluginsPinned)
        }

        fun orderedTabs(storageKeys: List<String>): List<BottomTab> {
            val byKey = entries.associateBy(BottomTab::storageKey)
            return normalizeOrder(storageKeys.mapNotNull(byKey::get))
        }

        fun mergeVisibleOrder(
            currentOrder: List<BottomTab>,
            visibleOrder: List<BottomTab>,
        ): List<BottomTab> {
            val normalizedCurrent = normalizeOrder(currentOrder)
            val normalizedVisible = visibleOrder.distinct()
            val visibleSet = normalizedVisible.toSet()
            if (visibleSet.isEmpty()) return normalizedCurrent
            val reordered = normalizedVisible.iterator()
            return normalizedCurrent.map { tab ->
                if (tab in visibleSet) reordered.next() else tab
            }
        }

        private fun normalizeOrder(order: List<BottomTab>): List<BottomTab> = buildList {
            addAll(order.distinct())
            addAll(entries.filterNot { it in this })
        }

        fun from(rootTab: RootTab): BottomTab = when (rootTab) {
            RootTab.Messages -> Messages
            RootTab.Characters -> Characters
            RootTab.Models -> Models
        }
    }
}

fun formatShortDate(value: String): String {
    return value.substringAfter('T', value).take(5).ifBlank { "" }
}

package com.eleckoi.android.foundation.design.components

import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.window.PopupPositionProvider

/** Positions a compact inspector above its trigger whenever the viewport has room. */
class AboveAnchorPopupPositionProvider(
    private val windowMarginPx: Int,
    private val anchorGapPx: Int,
    private val anchorInsetPx: Int,
) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val minimumX = windowMarginPx
        val maximumX = (windowSize.width - popupContentSize.width - windowMarginPx)
            .coerceAtLeast(minimumX)
        val preferredX = when (layoutDirection) {
            LayoutDirection.Ltr -> anchorBounds.left - anchorInsetPx
            LayoutDirection.Rtl -> anchorBounds.right - popupContentSize.width + anchorInsetPx
        }
        val x = preferredX.coerceIn(minimumX, maximumX)
        val minimumY = windowMarginPx
        val maximumY = (windowSize.height - popupContentSize.height - windowMarginPx)
            .coerceAtLeast(minimumY)
        val aboveY = anchorBounds.top - popupContentSize.height - anchorGapPx
        val belowY = anchorBounds.bottom + anchorGapPx
        val y = when {
            aboveY >= minimumY -> aboveY
            belowY <= maximumY -> belowY
            else -> maximumY
        }.coerceIn(minimumY, maximumY)
        return IntOffset(x, y)
    }
}

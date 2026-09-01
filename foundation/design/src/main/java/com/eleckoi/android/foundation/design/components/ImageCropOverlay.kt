package com.eleckoi.android.foundation.design.components

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.unit.dp

internal fun DrawScope.drawThirds(center: Offset, frame: CropFrame, circle: Boolean, alpha: Float) {
    val left = center.x - frame.width / 2f
    val top = center.y - frame.height / 2f
    val path = framePath(center, frame, circle)
    clipPath(path) {
        for (i in 1..2) {
            val y = top + frame.height * i / 3f
            drawLine(GridLine.copy(alpha = GridLine.alpha * alpha), Offset(left, y), Offset(left + frame.width, y), 0.8.dp.toPx())
            val x = left + frame.width * i / 3f
            drawLine(GridLine.copy(alpha = GridLine.alpha * alpha), Offset(x, top), Offset(x, top + frame.height), 0.8.dp.toPx())
        }
    }
}

internal fun DrawScope.drawCornerHandles(center: Offset, frame: CropFrame) {
    val left = center.x - frame.width / 2f
    val top = center.y - frame.height / 2f
    val right = left + frame.width
    val bottom = top + frame.height
    val arm = 20.dp.toPx()
    val thickness = 3.dp.toPx()
    val inset = thickness / 2f
    val corners = listOf(
        Triple(Offset(left - inset, top - inset), 1f, 1f),
        Triple(Offset(right + inset, top - inset), -1f, 1f),
        Triple(Offset(left - inset, bottom + inset), 1f, -1f),
        Triple(Offset(right + inset, bottom + inset), -1f, -1f),
    )
    corners.forEach { (corner, dx, dy) ->
        drawLine(Color.White, corner, Offset(corner.x + arm * dx, corner.y), thickness)
        drawLine(Color.White, corner, Offset(corner.x, corner.y + arm * dy), thickness)
    }
}

internal fun framePath(center: Offset, frame: CropFrame, circle: Boolean): Path {
    val left = center.x - frame.width / 2f
    val top = center.y - frame.height / 2f
    return Path().apply {
        if (circle) {
            addOval(Rect(Offset(left, top), Size(frame.width, frame.height)))
        } else {
            addRect(Rect(Offset(left, top), Size(frame.width, frame.height)))
        }
    }
}

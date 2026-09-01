package com.eleckoi.android.feature.chat.ui.blocks.image

import com.eleckoi.android.feature.chat.model.ChatImageAttachment
import com.eleckoi.android.feature.chat.model.DefaultGeneratedImageHeight
import com.eleckoi.android.feature.chat.model.DefaultGeneratedImageWidth

internal fun ChatImageAttachment.displayAspectRatio(): Float {
    val width = imageWidth.takeIf { it > 0 } ?: DefaultGeneratedImageWidth
    val height = imageHeight.takeIf { it > 0 } ?: DefaultGeneratedImageHeight
    return width.toFloat() / height.toFloat()
}

/** Storyboard frames stay subordinate to the prose while retaining their authored canvas. */
internal fun ChatImageAttachment.inlineWidthFraction(): Float = when {
    frameCount <= 1 -> 1f
    displayAspectRatio() < 0.85f -> 0.74f
    else -> 0.88f
}

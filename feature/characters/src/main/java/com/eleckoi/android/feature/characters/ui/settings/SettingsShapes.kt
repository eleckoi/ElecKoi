package com.eleckoi.android.feature.characters.ui.settings

import androidx.compose.foundation.shape.GenericShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

internal val CrystalButtonShape = GenericShape { size, _ ->
    val cut = minOf(size.width, size.height) * 0.14f
    moveTo(cut, 0f)
    lineTo(size.width - cut, 0f)
    lineTo(size.width, cut)
    lineTo(size.width, size.height - cut)
    lineTo(size.width - cut, size.height)
    lineTo(cut, size.height)
    lineTo(0f, size.height - cut)
    lineTo(0f, cut)
    close()
}

internal val CrystalIconShape = GenericShape { size, _ ->
    val cut = minOf(size.width, size.height) * 0.15f
    moveTo(cut, 0f)
    lineTo(size.width, 0f)
    lineTo(size.width, size.height - cut)
    lineTo(size.width - cut, size.height)
    lineTo(0f, size.height)
    lineTo(0f, cut)
    close()
}

/**
 * The scrapbook page's own control: a white card, a crisp inked outline, and a hard offset shadow
 * with no blur in it.
 *
 * The footer's two buttons were already drawn this way and were the only things on the page that
 * were, so the tool grid above them was speaking a different language — cut corners, soft slabs —
 * to say the same thing. One page, one pen. The corner radius is 1dp rather than 0 because a true
 * right angle antialiases into a slightly darker pixel at each corner.
 */
internal val ScrapbookControlShape = RoundedCornerShape(1.dp)

/** How far the face sits above its own shadow, and how far it travels when pressed. */
internal val ScrapbookControlLift = 3.dp

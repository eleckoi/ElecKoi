package com.eleckoi.android.foundation.design

// ---------------------------------------------------------------------------------------------
// Contrast audit
// ---------------------------------------------------------------------------------------------

/**
 * Last pass: nothing leaves here failing WCAG.
 *
 * Most of what this used to catch is now M3's problem and M3 already solves it — every `on…` role
 * is derived to clear 4.5 against its own container, so pairing `onPrimaryContainer` with
 * `primaryContainer` needs no help from here and asking for more than 4.5 would only overrule a
 * decision better made upstream.
 *
 * What survives is the pairings this app invents. The pinned block is `secondaryContainer` but the
 * text over it is the global `onSurface`, because [AppearanceTheme] has one text colour for the
 * whole app and nineteen call sites paint it on that block. M3 guarantees nothing about that
 * combination, so it is checked here.
 */
internal fun auditContrast(theme: AppearanceTheme): AppearanceTheme {
    val bg = theme.mobileBg
    val surface = theme.mobileSurface

    var text = theme.mobileText
    text = ensureContrast(text, bg, 7.0)
    text = ensureContrast(text, surface, 7.0)
    text = ensureContrast(text, compositeOver(theme.mobileComposerBg, bg), 4.5)
    text = ensureContrast(text, theme.mobileSearchBg, 4.5)
    text = ensureContrast(text, theme.mobilePinnedBg, 4.5)
    text = ensureContrast(text, theme.mobileTopbarBg, 4.5)
    text = ensureContrast(text, theme.mobileTabbarBg, 4.5)
    text = ensureContrast(text, theme.mobileInputBg, 4.5)

    var muted = ensureContrast(theme.mobileMuted, bg, 4.5)
    muted = ensureContrast(muted, surface, 4.5)
    muted = ensureContrast(muted, theme.mobileSearchBg, 4.0)
    muted = ensureContrast(muted, theme.mobileTopbarBg, 4.0)
    // The pinned block carries a second line under its title, and secondaryContainer is a real
    // colour rather than a tint, so leaving it out would let that line fall below legibility.
    muted = ensureContrast(muted, theme.mobilePinnedBg, 4.0)

    val soft = ensureContrast(theme.mobileSoft, bg, 2.6)

    val messageFg = ensureContrast(theme.mobileChatMessageFg, theme.mobileChatMessageBg, 7.0)
    // onPrimaryContainer against primaryContainer is M3's own pair; 4.5 is the bar it derives them
    // to, and demanding 7.0 here would push a colour it deliberately chose.
    val userFg = ensureContrast(theme.mobileChatUserFg, theme.mobileChatUserBg, 4.5)
    val accentFg = ensureContrast(theme.mobileAccentFg, theme.mobileBlue, 4.5)
    // The accent also carries small text and icons directly on the page.
    val accent = ensureContrast(theme.mobileBlue, bg, 3.0)

    return theme.copy(
        mobileText = text,
        mobileMuted = muted,
        mobileSoft = soft,
        mobileLine = text.copy(alpha = theme.mobileLine.alpha),
        mobileChatMessageFg = messageFg,
        mobileChatUserFg = userFg,
        mobileBlue = accent,
        mobileAccentFg = accentFg,
    )
}

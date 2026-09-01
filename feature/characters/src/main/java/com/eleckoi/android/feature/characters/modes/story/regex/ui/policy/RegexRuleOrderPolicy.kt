package com.eleckoi.android.feature.characters.modes.story.regex.ui.policy

import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRule
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleCollection
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleScope
import com.eleckoi.android.feature.characters.modes.story.regex.ui.rulesFor

internal fun RegexRuleCollection.hasSameRuleOrder(other: RegexRuleCollection): Boolean =
    RegexRuleScope.entries.all { scope ->
        rulesFor(scope).map(RegexRule::id) == other.rulesFor(scope).map(RegexRule::id)
    }

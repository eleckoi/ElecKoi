package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun MobileTabBar(
    activeTab: BottomTab,
    tabs: List<BottomTab>,
    appearance: AppearanceTheme,
    onChange: (BottomTab) -> Unit,
) {
    MobileRootGlassBar(
        appearance = appearance,
        placement = MobileRootGlassPlacement.Bottom,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .padding(horizontal = 18.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                tabs.forEach { tab ->
                    val active = tab == activeTab
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .height(48.dp)
                            .semantics {
                                selected = active
                                role = Role.Tab
                            }
                            .noRippleClickable { onChange(tab) },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        AnimatedNavIcon(
                            tab = tab.icon,
                            active = active,
                            activeColor = appearance.mobileBlue,
                            baseColor = appearance.mobileText,
                            modifier = Modifier.size(25.dp),
                        )
                        Text(
                            text = tab.label,
                            color = if (active) appearance.mobileBlue else appearance.mobileText,
                            fontSize = 12.sp,
                            lineHeight = 14.sp,
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
        }
    }
}

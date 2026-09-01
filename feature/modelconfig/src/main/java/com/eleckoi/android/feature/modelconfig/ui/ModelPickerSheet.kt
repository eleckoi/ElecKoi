package com.eleckoi.android.feature.modelconfig.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppSearchField
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.overlayScrim
import com.eleckoi.android.foundation.design.selectionPalette
import com.eleckoi.android.engine.generation.model.ModelOption

/** Bottom-sheet model picker kept separate from the reusable settings form controls. */
@Composable
internal fun ModelPickerSheet(
    items: List<ModelOption>,
    activeModel: String,
    appearance: AppearanceTheme,
    onClose: () -> Unit,
    onSelect: (String) -> Unit,
) {
    val selection = appearance.selectionPalette()
    var keyword by remember { mutableStateOf("") }
    val filteredItems = remember(items, keyword) {
        filterModelPickerItems(items, keyword)
    }
    Box(
        modifier = Modifier.fillMaxSize().background(appearance.overlayScrim()).noRippleClickable(onClick = onClose),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .height(420.dp)
                .clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
                .background(appearance.mobileSurface)
                .navigationBarsPadding()
                .noRippleClickable {},
        ) {
            Row(modifier = Modifier.fillMaxWidth().height(58.dp).padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("模型列表", modifier = Modifier.weight(1f), color = appearance.mobileText, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                Text("完成", color = appearance.mobileBlue, fontSize = 15.sp, modifier = Modifier.noRippleClickable(onClick = onClose))
            }
            AppSearchField(
                keyword = keyword,
                placeholder = "搜索模型",
                appearance = appearance,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
                height = 44.dp,
                onKeywordChange = { keyword = it },
            )
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
            ) {
                if (items.isEmpty()) {
                    item("empty") {
                        Text("读取模型后会显示在这里，也可以直接手动输入模型名。", color = appearance.mobileMuted, fontSize = 14.sp, modifier = Modifier.padding(18.dp))
                    }
                } else if (filteredItems.isEmpty()) {
                    item("no-match") {
                        Text("没有匹配的模型", color = appearance.mobileMuted, fontSize = 14.sp, modifier = Modifier.padding(18.dp))
                    }
                }
                itemsIndexed(filteredItems) { _, item ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (item.id == activeModel) selection.activeContainer else selection.inactiveContainer)
                            .noRippleClickable { onSelect(item.id) }
                            .padding(14.dp),
                    ) {
                        Text(item.id, color = if (item.id == activeModel) selection.activeText else selection.text, fontSize = 15.sp)
                    }
                }
            }
        }
    }
}

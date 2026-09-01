package com.eleckoi.android.feature.chat.ui.blocks.operation

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.chat.model.content.ChatContentBlock
import com.eleckoi.android.feature.chat.model.content.OperationStatus

@Composable
fun OperationStatusBlock(
    block: ChatContentBlock.Operation,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    val marker = when (block.status) {
        OperationStatus.Running -> "·"
        OperationStatus.Succeeded -> "✓"
        OperationStatus.Failed -> "×"
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = marker,
            color = appearance.mobileMuted,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.width(7.dp))
        Text(
            text = block.label,
            color = appearance.mobileMuted,
            fontSize = 12.sp,
            lineHeight = 16.sp,
        )
    }
}

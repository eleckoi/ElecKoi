package com.eleckoi.android.app.shell

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun MobileCommunityDialog(
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = appearance.mobileSurface,
        shape = RoundedCornerShape(24.dp),
        icon = {
            Surface(
                modifier = Modifier.size(54.dp),
                shape = RoundedCornerShape(18.dp),
                color = appearance.mobileSearchBg,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Groups,
                    contentDescription = null,
                    tint = appearance.mobileText,
                    modifier = Modifier.padding(14.dp),
                )
            }
        },
        title = {
            Text(
                text = "ElecKoi测试群",
                color = appearance.mobileText,
                fontSize = 19.sp,
                fontWeight = FontWeight.SemiBold,
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = "QQ群  $ElecKoiQqGroupNumber",
                    color = appearance.mobileMuted,
                    fontSize = 15.sp,
                )
                Text(
                    text = "点击后将直接唤起 QQ 加群。",
                    color = appearance.mobileSoft,
                    fontSize = 12.5.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = {
                    copyGroupNumber(context)
                },
                colors = ButtonDefaults.textButtonColors(contentColor = appearance.mobileMuted),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.ContentCopy,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Text("复制群号")
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (openQqGroup(context)) {
                        onDismiss()
                    } else {
                        copyGroupNumber(context, "无法打开 QQ，群号已复制")
                    }
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = appearance.mobileBlue,
                    contentColor = Color.White,
                ),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.OpenInNew,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Text("加入QQ群")
                }
            }
        },
    )
}

private fun openQqGroup(context: Context): Boolean =
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(ElecKoiQqGroupCardUri))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }.isSuccess

private fun copyGroupNumber(
    context: Context,
    message: String = "群号已复制",
) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("ElecKoi测试群", ElecKoiQqGroupNumber))
    Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
}

private const val ElecKoiQqGroupNumber = "1041463229"
private const val ElecKoiQqGroupCardUri =
    "mqqapi://card/show_pslcard?src_type=internal&version=1&uin=$ElecKoiQqGroupNumber&card_type=group&source=qrcode"

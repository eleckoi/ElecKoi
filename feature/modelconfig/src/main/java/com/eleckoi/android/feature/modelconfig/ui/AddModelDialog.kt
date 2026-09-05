package com.eleckoi.android.feature.modelconfig.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.AppInsetTextField
import com.eleckoi.android.foundation.design.components.DialogConfirmButton
import com.eleckoi.android.foundation.design.components.DialogDismissButton

@Composable
internal fun AddModelDialog(
    items: List<ModelOption>,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onAdd: (String) -> Unit,
) {
    var modelName by rememberSaveable { mutableStateOf("") }
    var submitted by rememberSaveable { mutableStateOf(false) }
    val error = modelNameError(items, modelName)
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = appearance.mobileSurface,
        title = { Text("添加模型", color = appearance.mobileText) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("模型名", color = appearance.mobileText, fontSize = 14.sp)
                AppInsetTextField(
                    value = modelName,
                    onValueChange = { modelName = it },
                    placeholder = "填写服务商提供的完整模型名",
                    appearance = appearance,
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false,
                    ),
                    textFieldModifier = Modifier.semantics { contentDescription = "模型名" },
                )
                Text(
                    if (submitted && error != null) error else "添加后会选中该模型，并保存到当前配置的模型列表。",
                    color = if (submitted && error != null) ElecKoiDanger else appearance.mobileMuted,
                    fontSize = 13.sp,
                )
            }
        },
        confirmButton = {
            DialogConfirmButton("添加并使用", appearance) {
                submitted = true
                if (error == null) onAdd(modelName.trim())
            }
        },
        dismissButton = { DialogDismissButton("取消", appearance, onDismiss) },
    )
}

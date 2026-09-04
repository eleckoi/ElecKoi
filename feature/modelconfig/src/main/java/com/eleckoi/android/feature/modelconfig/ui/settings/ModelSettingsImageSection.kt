package com.eleckoi.android.feature.modelconfig.ui.settings

import androidx.compose.foundation.ScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.input.KeyboardType
import com.eleckoi.android.engine.generation.model.ImageBackground
import com.eleckoi.android.engine.generation.model.ImageQuality
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.NovelAiSamplerCatalog
import com.eleckoi.android.engine.generation.model.imageSizeError
import com.eleckoi.android.engine.generation.model.isOpenAiImageConfig
import com.eleckoi.android.feature.modelconfig.ui.ImageOutputSelector
import com.eleckoi.android.feature.modelconfig.ui.components.ModelFieldDivider
import com.eleckoi.android.feature.modelconfig.ui.components.ModelFieldGroup
import com.eleckoi.android.feature.modelconfig.ui.components.ModelInlineField
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSectionHeader
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSectionNote
import com.eleckoi.android.feature.modelconfig.ui.NovelAiSamplerSelector
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun ModelImageSettingsSection(
    form: ModelConfig,
    appearance: AppearanceTheme,
    scrollState: ScrollState,
    imeBottomPx: Int,
    onUpdate: (ModelConfig) -> Unit,
) {
    var imageWidth by rememberSaveable(form.id, form.imageSettings.width) {
        mutableStateOf(form.imageSettings.width.toString())
    }
    var imageHeight by rememberSaveable(form.id, form.imageSettings.height) {
        mutableStateOf(form.imageSettings.height.toString())
    }
    var imageSteps by rememberSaveable(form.id, form.imageSettings.steps) {
        mutableStateOf(form.imageSettings.steps.toString())
    }
    var imageScale by rememberSaveable(form.id, form.imageSettings.scale) {
        mutableStateOf(form.imageSettings.scale.toString())
    }
    val openAi = form.isOpenAiImageConfig()
    val sizeError = imageSizeError(form.provider, imageWidth.toIntOrNull(), imageHeight.toIntOrNull())
    val imageWidthError = if (openAi) sizeError != null else imageWidth.toIntOrNull() !in 512..2048
    val imageHeightError = if (openAi) sizeError != null else imageHeight.toIntOrNull() !in 512..2048
    val imageStepsError = !openAi && imageSteps.toIntOrNull() !in 1..50
    val imageScaleError = !openAi && imageScale.toDoubleOrNull()?.let { it !in 0.1..10.0 } != false

    ModelSectionHeader("绘画参数", appearance, actions = {})
    ModelFieldGroup(appearance) {
        ModelInlineField(
            label = "宽度",
            value = imageWidth,
            placeholder = if (openAi) "1024" else "832",
            appearance = appearance,
            scrollState = scrollState,
            imeBottomPx = imeBottomPx,
            keyboardType = KeyboardType.Number,
            isError = imageWidthError,
        ) { raw ->
            imageWidth = raw.filter(Char::isDigit).take(4)
            val width = imageWidth.toIntOrNull()
            val height = imageHeight.toIntOrNull()
            if (width != null && height != null && imageSizeError(form.provider, width, height) == null) {
                onUpdate(form.copy(imageSettings = form.imageSettings.copy(width = width, height = height)))
            }
        }
        ModelFieldDivider(appearance)
        ModelInlineField(
            label = "高度",
            value = imageHeight,
            placeholder = if (openAi) "1536" else "1216",
            appearance = appearance,
            scrollState = scrollState,
            imeBottomPx = imeBottomPx,
            keyboardType = KeyboardType.Number,
            isError = imageHeightError,
        ) { raw ->
            imageHeight = raw.filter(Char::isDigit).take(4)
            val width = imageWidth.toIntOrNull()
            val height = imageHeight.toIntOrNull()
            if (width != null && height != null && imageSizeError(form.provider, width, height) == null) {
                onUpdate(form.copy(imageSettings = form.imageSettings.copy(width = width, height = height)))
            }
        }
        ModelFieldDivider(appearance)
        if (openAi) {
            ImageOutputSelector(
                label = "质量",
                selected = form.imageSettings.quality,
                options = ImageQuality.entries,
                optionLabel = ImageQuality::label,
                appearance = appearance,
            ) { quality ->
                onUpdate(form.copy(imageSettings = form.imageSettings.copy(quality = quality)))
            }
            ModelFieldDivider(appearance)
            ImageOutputSelector(
                label = "背景",
                selected = form.imageSettings.background,
                options = ImageBackground.entries,
                optionLabel = ImageBackground::label,
                appearance = appearance,
            ) { background ->
                onUpdate(form.copy(imageSettings = form.imageSettings.copy(background = background)))
            }
        } else {
            ModelInlineField(
                label = "步数",
                value = imageSteps,
                placeholder = "28",
                appearance = appearance,
                scrollState = scrollState,
                imeBottomPx = imeBottomPx,
                keyboardType = KeyboardType.Number,
                isError = imageStepsError,
            ) { raw ->
                imageSteps = raw.filter(Char::isDigit).take(2)
                imageSteps.toIntOrNull()?.takeIf { it in 1..50 }?.let { value ->
                    onUpdate(form.copy(imageSettings = form.imageSettings.copy(steps = value)))
                }
            }
            ModelFieldDivider(appearance)
            ModelInlineField(
                label = "提示词相关性",
                value = imageScale,
                placeholder = "5.0",
                appearance = appearance,
                scrollState = scrollState,
                imeBottomPx = imeBottomPx,
                keyboardType = KeyboardType.Decimal,
                isError = imageScaleError,
            ) { raw ->
                imageScale = raw.filter { char -> char.isDigit() || char == '.' }.take(5)
                imageScale.toDoubleOrNull()?.takeIf { it in 0.1..10.0 }?.let { value ->
                    onUpdate(form.copy(imageSettings = form.imageSettings.copy(scale = value)))
                }
            }
            ModelFieldDivider(appearance)
            NovelAiSamplerSelector(
                selectedApiValue = NovelAiSamplerCatalog.normalizeApiValue(form.imageSettings.sampler),
                appearance = appearance,
                onSelect = { sampler ->
                    onUpdate(
                        form.copy(
                            imageSettings = form.imageSettings.copy(
                                sampler = NovelAiSamplerCatalog.normalizeApiValue(sampler),
                            ),
                        ),
                    )
                },
            )
        }
    }
    val validationMessage = when {
        sizeError != null -> sizeError
        imageStepsError -> "步数需要在 1 到 50 之间。"
        imageScaleError -> "提示词相关性需要在 0.1 到 10 之间。"
        else -> null
    }
    if (validationMessage != null) {
        ModelSectionNote(validationMessage, appearance)
    }
}

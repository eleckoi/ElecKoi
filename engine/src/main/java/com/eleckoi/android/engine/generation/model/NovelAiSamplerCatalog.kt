package com.eleckoi.android.engine.generation.model

/**
 * NovelAI's public sampler names paired with the identifiers accepted by its image API.
 *
 * UI code should expose [displayName]. Persistence and requests must use [apiValue].
 */
data class NovelAiSamplerOption(
    val displayName: String,
    val apiValue: String,
)

object NovelAiSamplerCatalog {
    const val DefaultApiValue: String = "k_euler_ancestral"

    val options: List<NovelAiSamplerOption> = listOf(
        NovelAiSamplerOption(displayName = "DPM++ 2M", apiValue = "k_dpmpp_2m"),
        NovelAiSamplerOption(displayName = "Euler Ancestral", apiValue = DefaultApiValue),
        NovelAiSamplerOption(displayName = "Euler", apiValue = "k_euler"),
        NovelAiSamplerOption(displayName = "DPM2", apiValue = "k_dpm_2"),
        NovelAiSamplerOption(
            displayName = "DPM++ 2S Ancestral",
            apiValue = "k_dpmpp_2s_ancestral",
        ),
        NovelAiSamplerOption(displayName = "DPM++ SDE", apiValue = "k_dpmpp_sde"),
        NovelAiSamplerOption(displayName = "DPM Fast", apiValue = "k_dpm_fast"),
        NovelAiSamplerOption(displayName = "DDIM", apiValue = "ddim_v3"),
    )

    fun normalizeApiValue(value: String?): String {
        val candidate = value?.trim().orEmpty()
        if (candidate.isEmpty()) return DefaultApiValue
        return options.firstOrNull { option ->
            option.apiValue.equals(candidate, ignoreCase = true) ||
                option.displayName.equals(candidate, ignoreCase = true)
        }?.apiValue ?: DefaultApiValue
    }

    fun optionFor(value: String?): NovelAiSamplerOption {
        val apiValue = normalizeApiValue(value)
        return options.first { option -> option.apiValue == apiValue }
    }
}

package com.eleckoi.android.engine.workspace.runtime

import com.eleckoi.android.foundation.serialization.ElecKoiPrettyJson
import java.io.File
import java.nio.file.Files
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DeepSeekPluginCompositionManagerTest {
    @Test
    fun `composes base config with bundled provider and context bridges`() {
        val fixture = Fixture()
        try {
            val active = fixture.manager.prepare(fixture.packagedConfig, fixture.deepSeekHome)

            assertEquals(File(fixture.deepSeekHome, "eleckoi/cordis.yml").canonicalFile, active)
            assertTrue(active.readText().contains("- id: sdk-jsonrpc-server"))
            assertFalse(active.readText().contains("- id: llm"))
            assertFalse(active.readText().contains("providers:\n      eleckoi:"))
            assertTrue(active.readText().contains("includeRuntimeContext: false"))
            assertTrue(
                active.readText().indexOf("includeRuntimeContext: false") <
                    active.readText().indexOf("workspaceContext: false"),
            )
            assertTrue(
                active.readText().contains(
                    "path: ./plugins/eleckoi-context-pressure/1.0.0/cordis.yml",
                ),
            )
            assertTrue(
                active.readText().contains(
                    "path: ./plugins/eleckoi-provider-bridge/1.0.0/cordis.yml",
                ),
            )
            assertTrue(
                File(
                    fixture.deepSeekHome,
                    "eleckoi/plugins/eleckoi-context-pressure/1.0.0/context-pressure.mjs",
                ).isFile,
            )
            assertTrue(File(fixture.deepSeekHome, "eleckoi/eleckoi-host-tools.mjs").isFile)
            assertEquals(fixture.originalConfig, fixture.packagedConfig.readText())
        } finally {
            fixture.close()
        }
    }

    @Test
    fun `composes enabled installed plugin from persistent registry`() {
        val fixture = Fixture()
        try {
            val externalRoot = File(fixture.deepSeekHome, "eleckoi/plugins/community-clock/2.0.0")
            assertTrue(externalRoot.mkdirs())
            File(externalRoot, "manifest.json").writeText(
                ElecKoiPrettyJson.encodeToString(
                    DeepSeekPluginManifest(
                        schemaVersion = 1,
                        id = "community-clock",
                        version = "2.0.0",
                        cordisConfig = "cordis.yml",
                        files = listOf("cordis.yml", "index.mjs"),
                    ),
                ),
            )
            File(externalRoot, "cordis.yml").writeText("- id: community-clock\n  name: ./index.mjs\n")
            File(externalRoot, "index.mjs").writeText("export function apply() {}\n")
            File(fixture.deepSeekHome, "eleckoi/enabled-plugins.json").writeText(
                ElecKoiPrettyJson.encodeToString(
                    DeepSeekPluginRegistry(
                        enabled = listOf(DeepSeekPluginSelection("community-clock", "2.0.0")),
                    ),
                ),
            )

            val active = fixture.manager.prepare(fixture.packagedConfig, fixture.deepSeekHome)

            assertTrue(
                active.readText().contains("path: ./plugins/community-clock/2.0.0/cordis.yml"),
            )
        } finally {
            fixture.close()
        }
    }

    @Test
    fun `projects only an absolute automatic compaction threshold into the active config`() {
        val fixture = Fixture()
        try {
            val active = fixture.manager.prepare(
                packagedConfig = fixture.packagedConfig,
                deepSeekHome = fixture.deepSeekHome,
                modelContextWindow = 1_000_000,
                autoCompactTokenLimit = 2_000,
            )

            val composed = active.readText()
            assertTrue(composed.contains("thresholdRatio: 0.002"))
            assertTrue(composed.contains("retainTokens: 0"))
            assertTrue(composed.contains("maxTokens: 8192"))
            assertFalse(composed.contains("retainRatio:"))
            assertEquals(fixture.originalConfig, fixture.packagedConfig.readText())
        } finally {
            fixture.close()
        }
    }

    private class Fixture {
        private val temp = Files.createTempDirectory("deepseek-plugins").toFile()
        private val runtimeConfigRoot = File(temp, "runtime/etc/deepseek").apply { mkdirs() }
        val originalConfig = """
            # Runtime base
            - id: sdk-jsonrpc-server
              name: '@deepseek-ai/dsh-sdk-jsonrpc-server'
            - id: llm
              name: '@deepseek-ai/dsh-llm-pi-ai'
              config:
                providers:
                  eleckoi:
                    api: openai-responses
            - id: eleckoi-host-tools
              name: ./eleckoi-host-tools.mjs
            - id: agent-spine
              name: '@deepseek-ai/dsh-agent-spine-demo'
              config:
                includeHarnessIdentity: false
                workspaceContext: false
            - id: compaction-basic
              name: '@deepseek-ai/dsh-compaction-basic'
              config:
                thresholdRatio: 0.8
                retainRatio: 0.16
                maxTokens: 8192
                compactionRetries: 1
        """.trimIndent() + "\n"
        val packagedConfig = File(runtimeConfigRoot, "cordis.yml").apply { writeText(originalConfig) }
        val deepSeekHome = File(temp, "deepseek-home").apply { mkdirs() }
        val manager = DeepSeekPluginCompositionManager(
            assetReader = { path ->
                when (path) {
                    "dsh-plugins/context-pressure/manifest.json" -> """
                        {
                          "schemaVersion":1,
                          "id":"eleckoi-context-pressure",
                          "version":"1.0.0",
                          "cordisConfig":"cordis.yml",
                          "files":["cordis.yml","context-pressure.mjs"]
                        }
                    """.trimIndent().toByteArray()
                    "dsh-plugins/context-pressure/cordis.yml" -> """
                        - id: eleckoi-session-projection
                          name: '@deepseek-ai/dsh-session-projection'
                        - id: eleckoi-context-pressure-bridge
                          name: ./context-pressure.mjs
                    """.trimIndent().toByteArray()
                    "dsh-plugins/context-pressure/context-pressure.mjs" ->
                        "export function apply() {}\n".toByteArray()
                    "dsh-plugins/provider-bridge/manifest.json" -> """
                        {
                          "schemaVersion":1,
                          "id":"eleckoi-provider-bridge",
                          "version":"1.0.0",
                          "cordisConfig":"cordis.yml",
                          "files":["cordis.yml","provider-bridge.mjs"]
                        }
                    """.trimIndent().toByteArray()
                    "dsh-plugins/provider-bridge/cordis.yml" -> """
                        - id: eleckoi-provider-bridge
                          name: ./provider-bridge.mjs
                    """.trimIndent().toByteArray()
                    "dsh-plugins/provider-bridge/provider-bridge.mjs" ->
                        "export function apply() {}\n".toByteArray()
                    else -> error("unexpected bundled plugin asset: $path")
                }
            },
        )

        init {
            File(runtimeConfigRoot, "eleckoi-host-tools.mjs").writeText("export function apply() {}\n")
        }

        fun close() {
            temp.deleteRecursively()
        }
    }
}

package com.eleckoi.android.app.shell

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleImportDocument
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal class ShellDocumentActions(
    val importCharacters: () -> Unit,
    val exportCharacters: (json: String) -> Unit,
    val importSettingLibrary: (characterId: String) -> Unit,
    val exportSettingLibrary: (fileName: String, json: String) -> Unit,
    val importVariableConfig: (characterId: String) -> Unit,
    val exportVariableConfig: (fileName: String, json: String) -> Unit,
    val importRegexRules: (characterId: String, scope: RegexRuleScope) -> Unit,
    val exportRegexRules: (fileName: String, json: String) -> Unit,
)

@Composable
internal fun rememberShellDocumentActions(
    onCharactersImported: (String) -> Unit,
    onSettingLibraryImported: (characterId: String, json: String) -> Unit,
    onVariableConfigImported: (characterId: String, json: String) -> Unit,
    onRegexRulesImported: (
        characterId: String,
        scope: RegexRuleScope,
        documents: List<RegexRuleImportDocument>,
    ) -> Unit,
): ShellDocumentActions {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentCharactersImported by rememberUpdatedState(onCharactersImported)
    val currentSettingLibraryImported by rememberUpdatedState(onSettingLibraryImported)
    val currentVariableConfigImported by rememberUpdatedState(onVariableConfigImported)
    val currentRegexRulesImported by rememberUpdatedState(onRegexRulesImported)
    var pendingCharactersExport by remember { mutableStateOf("") }
    var pendingSettingLibraryExport by remember { mutableStateOf("") }
    var pendingVariableConfigExport by remember { mutableStateOf("") }
    var pendingSettingLibraryCharacterId by remember { mutableStateOf("") }
    var pendingVariableConfigCharacterId by remember { mutableStateOf("") }
    var pendingRegexCharacterId by remember { mutableStateOf("") }
    var pendingRegexScope by remember { mutableStateOf(RegexRuleScope.Global) }
    var pendingRegexRulesExport by remember { mutableStateOf("") }

    val importCharactersLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            currentCharactersImported(readDocumentText(context, uri))
        }
    }
    val exportCharactersLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            context.contentResolver.openOutputStream(uri)
                ?.bufferedWriter()
                ?.use { it.write(pendingCharactersExport) }
        }
    }
    val importSettingLibraryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val characterId = pendingSettingLibraryCharacterId
        if (characterId.isBlank()) return@rememberLauncherForActivityResult
        scope.launch {
            currentSettingLibraryImported(characterId, readDocumentText(context, uri))
        }
    }
    val exportSettingLibraryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            context.contentResolver.openOutputStream(uri)
                ?.bufferedWriter()
                ?.use { it.write(pendingSettingLibraryExport) }
        }
    }
    val importVariableConfigLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val characterId = pendingVariableConfigCharacterId
        if (characterId.isBlank()) return@rememberLauncherForActivityResult
        scope.launch {
            currentVariableConfigImported(characterId, readDocumentText(context, uri))
        }
    }
    val exportVariableConfigLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            context.contentResolver.openOutputStream(uri)
                ?.bufferedWriter()
                ?.use { it.write(pendingVariableConfigExport) }
        }
    }
    val importRegexRulesLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris ->
        if (uris.isEmpty() || pendingRegexCharacterId.isBlank()) return@rememberLauncherForActivityResult
        scope.launch {
            currentRegexRulesImported(
                pendingRegexCharacterId,
                pendingRegexScope,
                readRegexImportDocuments(context, uris),
            )
        }
    }
    val exportRegexRulesLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(pendingRegexRulesExport) }
        }
    }

    return remember(
        importCharactersLauncher,
        exportCharactersLauncher,
        importSettingLibraryLauncher,
        exportSettingLibraryLauncher,
        importVariableConfigLauncher,
        exportVariableConfigLauncher,
        importRegexRulesLauncher,
        exportRegexRulesLauncher,
    ) {
        ShellDocumentActions(
            importCharacters = { importCharactersLauncher.launch("application/json") },
            exportCharacters = { json ->
                pendingCharactersExport = json
                exportCharactersLauncher.launch("eleckoi-characters.json")
            },
            importSettingLibrary = { characterId ->
                pendingSettingLibraryCharacterId = characterId
                importSettingLibraryLauncher.launch("application/json")
            },
            exportSettingLibrary = { fileName, json ->
                pendingSettingLibraryExport = json
                exportSettingLibraryLauncher.launch(fileName)
            },
            importVariableConfig = { characterId ->
                pendingVariableConfigCharacterId = characterId
                importVariableConfigLauncher.launch("application/json")
            },
            exportVariableConfig = { fileName, json ->
                pendingVariableConfigExport = json
                exportVariableConfigLauncher.launch(fileName)
            },
            importRegexRules = { characterId, regexScope ->
                pendingRegexCharacterId = characterId
                pendingRegexScope = regexScope
                importRegexRulesLauncher.launch(
                    arrayOf("application/json", "text/plain", "application/octet-stream"),
                )
            },
            exportRegexRules = { fileName, json ->
                pendingRegexRulesExport = json
                exportRegexRulesLauncher.launch(fileName)
            },
        )
    }
}

private suspend fun readDocumentText(
    context: android.content.Context,
    uri: android.net.Uri,
): String = withContext(Dispatchers.IO) {
    context.contentResolver.openInputStream(uri)
        ?.bufferedReader()
        ?.use { it.readText() }
        .orEmpty()
}

private suspend fun readRegexImportDocuments(
    context: Context,
    uris: List<Uri>,
): List<RegexRuleImportDocument> = withContext(Dispatchers.IO) {
    uris.mapIndexed { index, uri ->
        val displayName = context.contentResolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME),
            null,
            null,
            null,
        )?.use { cursor ->
            val nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (nameColumn >= 0 && cursor.moveToFirst()) cursor.getString(nameColumn) else null
        }?.trim().orEmpty().ifBlank { "正则文件 ${index + 1}" }
        val json = context.contentResolver.openInputStream(uri)
            ?.bufferedReader()
            ?.use { it.readText() }
            .orEmpty()
        RegexRuleImportDocument(displayName = displayName, json = json)
    }
}

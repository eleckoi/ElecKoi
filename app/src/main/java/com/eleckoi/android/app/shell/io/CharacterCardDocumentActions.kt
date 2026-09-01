package com.eleckoi.android.app.shell

import android.content.ClipData
import android.content.Intent
import android.provider.DocumentsContract
import android.widget.Toast
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
import androidx.core.content.FileProvider
import com.eleckoi.android.feature.characters.transfer.model.ExportedCharacterCard
import com.eleckoi.android.feature.characters.transfer.model.CharacterImportSource
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal class CharacterCardDocumentActions(
    val importCard: () -> Unit,
    val importSillyTavernCard: () -> Unit,
    val saveCard: (ExportedCharacterCard) -> Unit,
    val saveCards: (List<ExportedCharacterCard>) -> Unit,
    val shareOriginal: (ExportedCharacterCard) -> Unit,
    val shareOriginals: (List<ExportedCharacterCard>) -> Unit,
)

@Composable
internal fun rememberCharacterCardDocumentActions(
    onCardsSelected: (List<File>, CharacterImportSource) -> Unit,
): CharacterCardDocumentActions {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentOnCardsSelected by rememberUpdatedState(onCardsSelected)
    var pendingSave by remember { mutableStateOf<ExportedCharacterCard?>(null) }
    var pendingBatchSave by remember { mutableStateOf<List<ExportedCharacterCard>>(emptyList()) }
    var pendingImportSource by remember { mutableStateOf(CharacterImportSource.ElecKoi) }

    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            val outputs = mutableListOf<File>()
            runCatching {
                val directory = File(context.cacheDir, "character_transfer/imports").apply { mkdirs() }
                try {
                    require(uris.size <= MaxCharacterCardCount) { "一次最多导入 $MaxCharacterCardCount 张角色卡" }
                    uris.forEachIndexed { index, uri ->
                        val output = File(
                            directory,
                            "selected-${System.currentTimeMillis()}-$index",
                        )
                        outputs += output
                        context.contentResolver.openInputStream(uri)?.use { input ->
                            output.outputStream().buffered().use { target ->
                                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                                var total = 0L
                                while (true) {
                                    val count = input.read(buffer)
                                    if (count < 0) break
                                    total += count
                                    target.write(buffer, 0, count)
                                    if (total > MaxCharacterCardBytes) break
                                }
                            }
                        } ?: error("无法读取第 ${index + 1} 张角色卡")
                    }
                    currentOnCardsSelected(outputs, pendingImportSource)
                } catch (error: Throwable) {
                    outputs.forEach(File::delete)
                    throw error
                }
            }.onFailure { error ->
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        context,
                        error.message ?: "读取角色卡失败",
                        Toast.LENGTH_LONG,
                    ).show()
                }
            }
        }
    }
    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("image/png"),
    ) { uri ->
        val card = pendingSave
        pendingSave = null
        if (uri == null || card == null) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            runCatching {
                context.contentResolver.openOutputStream(uri)?.use { output ->
                    card.file.inputStream().use { input -> input.copyTo(output) }
                } ?: error("无法保存角色卡")
            }.onFailure { error ->
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        context,
                        error.message ?: "保存角色卡失败",
                        Toast.LENGTH_LONG,
                    ).show()
                }
            }
        }
    }
    val saveFolderLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocumentTree(),
    ) { treeUri ->
        val cards = pendingBatchSave
        pendingBatchSave = emptyList()
        if (treeUri == null || cards.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            val directoryUri = DocumentsContract.buildDocumentUriUsingTree(
                treeUri,
                DocumentsContract.getTreeDocumentId(treeUri),
            )
            val failures = cards.mapNotNull { card ->
                runCatching {
                    val outputUri = DocumentsContract.createDocument(
                        context.contentResolver,
                        directoryUri,
                        "image/png",
                        "${safeCardName(card.name)}.png",
                    ) ?: error("无法创建 ${card.name}.png")
                    context.contentResolver.openOutputStream(outputUri)?.use { output ->
                        card.file.inputStream().use { input -> input.copyTo(output) }
                    } ?: error("无法写入 ${card.name}.png")
                }.exceptionOrNull()
            }
            withContext(Dispatchers.Main) {
                val savedCount = cards.size - failures.size
                val message = when {
                    failures.isEmpty() -> "已保存 ${cards.size} 个角色卡"
                    savedCount > 0 -> "已保存 $savedCount 个，${failures.size} 个失败"
                    else -> failures.firstOrNull()?.message ?: "保存角色卡失败"
                }
                Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            }
        }
    }

    return remember(importLauncher, saveLauncher, saveFolderLauncher, context) {
        CharacterCardDocumentActions(
            importCard = {
                pendingImportSource = CharacterImportSource.ElecKoi
                importLauncher.launch(
                    arrayOf("image/png", "application/json", "application/octet-stream"),
                )
            },
            importSillyTavernCard = {
                pendingImportSource = CharacterImportSource.SillyTavern
                importLauncher.launch(arrayOf("image/png"))
            },
            saveCard = { card ->
                pendingSave = card
                saveLauncher.launch("${safeCardName(card.name)}.png")
            },
            saveCards = { cards ->
                if (cards.isNotEmpty()) {
                    pendingBatchSave = cards
                    saveFolderLauncher.launch(null)
                }
            },
            shareOriginal = { card ->
                shareCharacterCards(context, listOf(card))
            },
            shareOriginals = { cards -> shareCharacterCards(context, cards) },
        )
    }
}

private fun shareCharacterCards(
    context: android.content.Context,
    cards: List<ExportedCharacterCard>,
) {
    if (cards.isEmpty()) return
    val uris = ArrayList(
        cards.map { card ->
            FileProvider.getUriForFile(
                context,
                "${context.packageName}.files",
                card.file,
            )
        },
    )
    val sharedClipData = ClipData.newRawUri(cards.first().name, uris.first()).apply {
        uris.drop(1).forEach { uri -> addItem(ClipData.Item(uri)) }
    }
    val send = Intent(
        if (uris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE,
    ).apply {
        type = "application/octet-stream"
        if (uris.size == 1) {
            putExtra(Intent.EXTRA_STREAM, uris.first())
        } else {
            putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
        }
        clipData = sharedClipData
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val title = if (cards.size == 1) "分享角色卡" else "分享 ${cards.size} 个角色卡"
    context.startActivity(Intent.createChooser(send, title))
}

private fun safeCardName(name: String): String = name
    .replace(Regex("[\\\\/:*?\"<>|]"), "_")
    .trim()
    .ifBlank { "角色" }

private const val MaxCharacterCardBytes = 64L * 1024 * 1024
private const val MaxCharacterCardCount = 50

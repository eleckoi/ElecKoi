package com.eleckoi.android.feature.settings.data.appearance

import android.graphics.Bitmap
import com.eleckoi.android.foundation.design.analyzeAppearanceTheme
import com.eleckoi.android.foundation.storage.JsonFileStore
import com.eleckoi.android.foundation.storage.newId
import com.eleckoi.android.feature.preferences.UiPreferencesRepository
import com.eleckoi.android.foundation.design.AppearanceTheme
import java.io.File
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class AppearanceRepository(
    private val store: JsonFileStore,
    private val preferences: UiPreferencesRepository,
) {
    private val mutationMutex = Mutex()

    suspend fun load(): AppearanceTheme = preferences.appearanceTheme()

    /**
     * A picture the user picked to set the app's colours, and nothing else. It is never painted, so
     * every texture field — the wallpaper path, its opacity, blur and veil — is carried over
     * untouched. The chat wallpaper is chosen on the background page and is a separate decision;
     * binding the two is what made an upload silently repaint every conversation.
     */
    suspend fun savePalette(source: Bitmap): AppearanceTheme {
        val analyzed = analyzeAppearanceTheme(paletteSource = source)
        return mutationMutex.withLock {
            val current = load()
            persist(
                analyzed.copy(
                rootBackgroundImagePath = current.rootBackgroundImagePath,
                rootBackgroundOpacity = current.rootBackgroundOpacity,
                rootBackgroundBlur = current.rootBackgroundBlur,
                rootBackgroundScrim = current.rootBackgroundScrim,
                textureImagePath = current.textureImagePath,
                textureOpacity = current.textureOpacity,
                textureBlur = current.textureBlur,
                textureScrim = current.textureScrim,
                textureScrimAngle = current.textureScrimAngle,
                textureScrimStart = current.textureScrimStart,
                textureScrimMid = current.textureScrimMid,
                textureScrimEnd = current.textureScrimEnd,
                textureScrimStartColor = current.textureScrimStartColor,
                textureScrimEndColor = current.textureScrimEndColor,
                markdownReadingColors = current.markdownReadingColors,
                ),
            )
        }
    }

    /**
     * The wallpaper every character falls back to. Only the veil geometry is measured from it — how
     * much cover each region of *this* picture needs — while the palette stays where the user put
     * it. The two used to be written together, which meant one upload could not answer one question
     * without also answering the other.
     */
    suspend fun saveGlobalBackground(
        bitmap: Bitmap,
        opacity: Float,
        blur: Float,
        scrim: Float,
    ): AppearanceTheme {
        val measured = analyzeAppearanceTheme(paletteSource = bitmap)
        return mutationMutex.withLock {
            val target = store.file("settings", "theme-texture-${newId(10)}.png")
            target.parentFile?.mkdirs()
            target.outputStream().use { output ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
            }
            val saved = try {
                persist(
                    load().copy(
                        textureImagePath = target.absolutePath,
                        textureOpacity = opacity.coerceIn(0f, 1f),
                        textureBlur = blur.coerceIn(0f, 24f),
                        textureScrim = scrim.coerceIn(0f, 1f),
                        textureScrimAngle = measured.textureScrimAngle,
                        textureScrimStart = measured.textureScrimStart,
                        textureScrimMid = measured.textureScrimMid,
                        textureScrimEnd = measured.textureScrimEnd,
                        textureScrimStartColor = measured.textureScrimStartColor,
                        textureScrimEndColor = measured.textureScrimEndColor,
                    ),
                )
            } catch (error: Throwable) {
                target.delete()
                throw error
            }
            cleanupThemeTextures(target)
            saved
        }
    }

    // Adjusting the veil must not re-measure anything: these are the user overruling the analyzer.
    suspend fun saveGlobalBackgroundTuning(opacity: Float, blur: Float, scrim: Float): AppearanceTheme {
        return mutationMutex.withLock {
            persist(
                load().copy(
                    textureOpacity = opacity.coerceIn(0f, 1f),
                    textureBlur = blur.coerceIn(0f, 24f),
                    textureScrim = scrim.coerceIn(0f, 1f),
                ),
            )
        }
    }

    suspend fun clearGlobalBackground(): AppearanceTheme {
        return mutationMutex.withLock {
            val saved = persist(load().copy(textureImagePath = ""))
            cleanupThemeTextures(keep = null)
            saved
        }
    }

    suspend fun saveRootBackground(
        bitmap: Bitmap,
        opacity: Float,
        blur: Float,
        scrim: Float,
    ): AppearanceTheme {
        return mutationMutex.withLock {
            val target = store.file("settings", "root-background-${newId(10)}.png")
            target.parentFile?.mkdirs()
            target.outputStream().use { output ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
            }
            val saved = try {
                persist(
                    load().copy(
                        rootBackgroundImagePath = target.absolutePath,
                        rootBackgroundOpacity = opacity.coerceIn(0f, 1f),
                        rootBackgroundBlur = blur.coerceIn(0f, 24f),
                        rootBackgroundScrim = scrim.coerceIn(0f, 1f),
                    ),
                )
            } catch (error: Throwable) {
                target.delete()
                throw error
            }
            cleanupRootBackgrounds(target)
            saved
        }
    }

    suspend fun saveRootBackgroundTuning(opacity: Float, blur: Float, scrim: Float): AppearanceTheme {
        return mutationMutex.withLock {
            persist(
                load().copy(
                    rootBackgroundOpacity = opacity.coerceIn(0f, 1f),
                    rootBackgroundBlur = blur.coerceIn(0f, 24f),
                    rootBackgroundScrim = scrim.coerceIn(0f, 1f),
                ),
            )
        }
    }

    suspend fun clearRootBackground(): AppearanceTheme {
        return mutationMutex.withLock {
            val defaults = AppearanceTheme()
            val saved = persist(
                load().copy(
                    rootBackgroundImagePath = "",
                    rootBackgroundOpacity = defaults.rootBackgroundOpacity,
                    rootBackgroundBlur = defaults.rootBackgroundBlur,
                    rootBackgroundScrim = defaults.rootBackgroundScrim,
                ),
            )
            cleanupRootBackgrounds(keep = null)
            saved
        }
    }

    suspend fun save(theme: AppearanceTheme): AppearanceTheme {
        return mutationMutex.withLock { persist(theme) }
    }

    suspend fun reset(): AppearanceTheme {
        return mutationMutex.withLock {
            val reset = preferences.resetAppearanceTheme()
            cleanupThemeTextures(keep = null)
            cleanupRootBackgrounds(keep = null)
            reset
        }
    }

    private suspend fun persist(theme: AppearanceTheme): AppearanceTheme =
        preferences.saveAppearanceTheme(theme)

    private fun cleanupThemeTextures(keep: File?) {
        val directory = store.dir("settings")
        val rootPath = directory.canonicalPath
        val keepPath = keep?.canonicalPath
        directory.listFiles { file -> file.isFile && file.name.startsWith("theme-texture-") }
            .orEmpty()
            .filter { file -> file.canonicalPath != keepPath && file.canonicalPath.startsWith(rootPath) }
            .forEach(File::delete)
    }

    private fun cleanupRootBackgrounds(keep: File?) {
        val directory = store.dir("settings")
        val rootPath = directory.canonicalPath
        val keepPath = keep?.canonicalPath
        directory.listFiles { file -> file.isFile && file.name.startsWith("root-background-") }
            .orEmpty()
            .filter { file -> file.canonicalPath != keepPath && file.canonicalPath.startsWith(rootPath) }
            .forEach(File::delete)
    }
}

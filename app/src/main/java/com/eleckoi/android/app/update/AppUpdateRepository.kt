package com.eleckoi.android.app.update

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.appUpdateDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "app_update",
)

internal data class AppUpdateSnapshot(
    val remindersEnabled: Boolean = true,
    val latestRelease: AppRelease? = null,
    val lastCheckedAtMillis: Long = 0L,
    val notifiedTag: String = "",
)

internal class AppUpdateRepository(
    context: Context,
    private val releaseClient: GitHubReleaseClient = GitHubReleaseClient(),
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    private val dataStore = context.applicationContext.appUpdateDataStore

    val snapshot: Flow<AppUpdateSnapshot> = dataStore.data.map(::snapshotFrom)

    suspend fun current(): AppUpdateSnapshot = snapshot.first()

    suspend fun checkForUpdate(): AppUpdateSnapshot {
        val result = releaseClient.latest()
        dataStore.edit { preferences ->
            preferences[Keys.LastCheckedAt] = nowMillis()
            when (result) {
                LatestReleaseResult.NonePublished -> clearRelease(preferences)
                is LatestReleaseResult.Published -> writeRelease(preferences, result.release)
            }
        }
        return current()
    }

    suspend fun setRemindersEnabled(enabled: Boolean) {
        dataStore.edit { preferences -> preferences[Keys.RemindersEnabled] = enabled }
    }

    suspend fun markNotified(tagName: String) {
        dataStore.edit { preferences -> preferences[Keys.NotifiedTag] = tagName }
    }

    private fun snapshotFrom(preferences: Preferences): AppUpdateSnapshot {
        val tagName = preferences[Keys.LatestTag].orEmpty()
        val pageUrl = preferences[Keys.LatestPageUrl].orEmpty()
        val release = if (tagName.isNotBlank() && pageUrl.isNotBlank()) {
            AppRelease(
                tagName = tagName,
                title = preferences[Keys.LatestTitle].orEmpty().ifBlank { tagName },
                pageUrl = pageUrl,
                notes = preferences[Keys.LatestNotes].orEmpty(),
                publishedAt = preferences[Keys.LatestPublishedAt].orEmpty(),
            )
        } else {
            null
        }
        return AppUpdateSnapshot(
            remindersEnabled = preferences[Keys.RemindersEnabled] ?: true,
            latestRelease = release,
            lastCheckedAtMillis = preferences[Keys.LastCheckedAt] ?: 0L,
            notifiedTag = preferences[Keys.NotifiedTag].orEmpty(),
        )
    }

    private fun writeRelease(preferences: MutablePreferences, release: AppRelease) {
        preferences[Keys.LatestTag] = release.tagName
        preferences[Keys.LatestTitle] = release.title
        preferences[Keys.LatestPageUrl] = release.pageUrl
        preferences[Keys.LatestNotes] = release.notes
        preferences[Keys.LatestPublishedAt] = release.publishedAt
    }

    private fun clearRelease(preferences: MutablePreferences) {
        preferences.remove(Keys.LatestTag)
        preferences.remove(Keys.LatestTitle)
        preferences.remove(Keys.LatestPageUrl)
        preferences.remove(Keys.LatestNotes)
        preferences.remove(Keys.LatestPublishedAt)
    }

    private object Keys {
        val RemindersEnabled = booleanPreferencesKey("reminders_enabled")
        val LatestTag = stringPreferencesKey("latest_tag")
        val LatestTitle = stringPreferencesKey("latest_title")
        val LatestPageUrl = stringPreferencesKey("latest_page_url")
        val LatestNotes = stringPreferencesKey("latest_notes")
        val LatestPublishedAt = stringPreferencesKey("latest_published_at")
        val LastCheckedAt = longPreferencesKey("last_checked_at")
        val NotifiedTag = stringPreferencesKey("notified_tag")
    }
}

private typealias MutablePreferences = androidx.datastore.preferences.core.MutablePreferences

package com.eleckoi.android.app.background

import android.annotation.TargetApi
import android.app.Notification
import android.app.Person
import android.content.Context
import android.content.Intent
import android.content.LocusId
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.drawable.Icon
import android.os.Build
import com.eleckoi.android.R
import com.eleckoi.android.app.MainActivity
import com.eleckoi.android.engine.agent.background.AgentRunDescriptor
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/** System-owned conversation identity used by both running and completed Agent notifications. */
@TargetApi(28)
private data class AgentConversationIdentity(
    val person: Person,
    val shortcutId: String?,
)

/** Registers one long-lived Android conversation shortcut per ElecKoi conversation. */
private object AgentConversationIdentityRegistry {
    private const val AvatarSizePx = 192
    private val publishedShortcutIds = ConcurrentHashMap.newKeySet<String>()

    @TargetApi(28)
    fun prepare(context: Context, descriptor: AgentRunDescriptor): AgentConversationIdentity {
        val avatar = loadAvatar(context, descriptor.avatarPath)
        val person = Person.Builder()
            .setName(descriptor.title)
            .setKey("agent-person:${descriptor.surface}:${descriptor.conversationId}")
            .setBot(true)
            .apply { avatar?.let { setIcon(Icon.createWithAdaptiveBitmap(it)) } }
            .build()
        val shortcutId = if (Build.VERSION.SDK_INT >= 30) {
            publishShortcut(context, descriptor, person, avatar)
        } else {
            null
        }
        return AgentConversationIdentity(person, shortcutId)
    }

    @TargetApi(30)
    private fun publishShortcut(
        context: Context,
        descriptor: AgentRunDescriptor,
        person: Person,
        avatar: Bitmap?,
    ): String? {
        val shortcutId = stableShortcutId(descriptor)
        if (!publishedShortcutIds.add(shortcutId)) return shortcutId
        return runCatching {
            val intent = Intent(context, MainActivity::class.java)
                .setAction(Intent.ACTION_VIEW)
                .putExtra("conversation_id", descriptor.conversationId)
            val shortcut = ShortcutInfo.Builder(context, shortcutId)
                .setShortLabel(descriptor.title.ifBlank { "AI 对话" }.take(40))
                .setLongLabel(descriptor.title.ifBlank { "AI 对话" }.take(80))
                .setIntent(intent)
                .setLongLived(true)
                .setPersons(arrayOf(person))
                .setLocusId(LocusId(shortcutId))
                .apply { avatar?.let { setIcon(Icon.createWithAdaptiveBitmap(it)) } }
                .build()
            context.getSystemService(ShortcutManager::class.java).pushDynamicShortcut(shortcut)
            shortcutId
        }.getOrElse {
            publishedShortcutIds.remove(shortcutId)
            null
        }
    }

    private fun stableShortcutId(descriptor: AgentRunDescriptor): String {
        val source = "${descriptor.surface}:${descriptor.conversationId}"
        val digest = MessageDigest.getInstance("SHA-256").digest(source.toByteArray())
        return "agent-" + digest.take(12).joinToString("") { byte ->
            (byte.toInt() and 0xff).toString(16).padStart(2, '0')
        }
    }

    private fun loadAvatar(context: Context, avatarPath: String): Bitmap? {
        val avatar = avatarPath
            .takeIf(String::isNotBlank)
            ?.let(::File)
            ?.takeIf(File::isFile)
            ?.let { file -> decodeSampledFile(file, AvatarSizePx) }
        val source = avatar ?: decodeSampledResource(
            context,
            R.drawable.whale_maid_app_icon_20260814,
            AvatarSizePx,
        )
        return source?.let { squareCenterCrop(it, AvatarSizePx) }
    }

    private fun decodeSampledFile(file: File, targetSize: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        return BitmapFactory.decodeFile(
            file.absolutePath,
            BitmapFactory.Options().apply {
                inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, targetSize)
            },
        )
    }

    private fun decodeSampledResource(context: Context, resourceId: Int, targetSize: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.resources.openRawResource(resourceId).use { input ->
            BitmapFactory.decodeStream(input, null, bounds)
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, targetSize)
        }
        return context.resources.openRawResource(resourceId).use { input ->
            BitmapFactory.decodeStream(input, null, options)
        }
    }

    private fun sampleSize(width: Int, height: Int, targetSize: Int): Int {
        var sample = 1
        while (width / (sample * 2) >= targetSize && height / (sample * 2) >= targetSize) {
            sample *= 2
        }
        return sample
    }

    private fun squareCenterCrop(source: Bitmap, targetSize: Int): Bitmap {
        val output = Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888)
        val cropSize = minOf(source.width, source.height)
        val left = (source.width - cropSize) / 2
        val top = (source.height - cropSize) / 2
        Canvas(output).drawBitmap(
            source,
            Rect(left, top, left + cropSize, top + cropSize),
            RectF(0f, 0f, targetSize.toFloat(), targetSize.toFloat()),
            Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG),
        )
        return output
    }
}

internal fun Notification.Builder.setAgentConversation(
    context: Context,
    descriptor: AgentRunDescriptor,
    message: String,
    timestamp: Long,
): Notification.Builder {
    if (Build.VERSION.SDK_INT >= 28) {
        val identity = AgentConversationIdentityRegistry.prepare(context, descriptor)
        val currentUser = Person.Builder()
            .setName("用户")
            .setKey("eleckoi-current-user")
            .build()
        setStyle(
            Notification.MessagingStyle(currentUser)
                .addMessage(
                    message,
                    timestamp.takeIf { it > 0L } ?: System.currentTimeMillis(),
                    identity.person,
                )
                .setGroupConversation(false),
        )
        addPerson(identity.person)
        identity.shortcutId?.let(::setShortcutId)
    } else {
        @Suppress("DEPRECATION")
        setStyle(
            Notification.MessagingStyle("用户")
                .addMessage(message, timestamp, descriptor.title),
        )
    }
    return this
}

package com.eleckoi.app;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import org.json.JSONObject;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.Locale;

/** Gives the local Host a readable copy of the archive selected in Android's file picker. */
final class PluginArchiveImport {
    static JSONObject stage(Context context, Uri source) throws Exception {
        if (!ContentResolver.SCHEME_CONTENT.equals(source.getScheme())) {
            throw new IOException("Expected a document from the Android picker");
        }
        ContentResolver resolver = context.getContentResolver();
        String name;
        try (Cursor cursor = resolver.query(source, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            name = cursor != null && cursor.moveToFirst() ? cursor.getString(0) : null;
        }
        String suffix = archiveSuffix(name);
        if (suffix == null) throw new UnsupportedArchive();

        Path directory = new RuntimePaths(context).home.toPath().resolve("plugin-imports");
        Files.createDirectories(directory);
        try (InputStream input = resolver.openInputStream(source)) {
            if (input == null) throw new IOException("Could not open the selected document");
            return new JSONObject().put("name", name).put("path", stageArchive(directory, input, suffix).toString());
        }
    }

    static String archiveSuffix(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".tar.gz")) return ".tar.gz";
        if (lower.endsWith(".tgz")) return ".tgz";
        return null;
    }

    static Path stageArchive(Path directory, InputStream input, String suffix) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        Path temporary = Files.createTempFile(directory, "incoming-", ".part");
        try {
            Files.copy(new DigestInputStream(input, digest), temporary, StandardCopyOption.REPLACE_EXISTING);
            // pnpm can reference local archives after install. Keep a stable path for each set of bytes.
            Path target = directory.resolve(RuntimeInstaller.hex(digest.digest()) + suffix);
            return Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    static final class UnsupportedArchive extends IOException {
        UnsupportedArchive() { super("unsupported-plugin-archive"); }
    }
}

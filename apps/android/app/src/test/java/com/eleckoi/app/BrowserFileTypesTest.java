package com.eleckoi.app;

import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.assertArrayEquals;

public class BrowserFileTypesTest {
    private static final Map<String, String> MIME_BY_EXTENSION = Map.of("html", "text/html", "htm", "text/html", "zip", "application/zip");

    @Test public void mapsFrontendExtensionsAndKeepsExistingMimeTypes() {
        assertArrayEquals(new String[]{"text/html", "application/zip", "image/*"}, BrowserFileTypes.openDocumentTypes(
            new String[]{".html", " .HTM ", ".zip", "application/zip", "image/*"}, MIME_BY_EXTENSION::get));
    }

    @Test public void keepsUnfilteredSelectionWhenAnAcceptedExtensionHasNoSystemMimeType() {
        assertArrayEquals(new String[0], BrowserFileTypes.openDocumentTypes(
            new String[]{"text/html", ".unmapped"}, MIME_BY_EXTENSION::get));
        assertArrayEquals(new String[0], BrowserFileTypes.openDocumentTypes(
            new String[]{"*/*"}, MIME_BY_EXTENSION::get));
    }
}

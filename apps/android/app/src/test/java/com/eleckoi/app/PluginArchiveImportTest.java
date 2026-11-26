package com.eleckoi.app;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.Assert.*;

public final class PluginArchiveImportTest {
    @Rule public final TemporaryFolder temp = new TemporaryFolder();

    @Test public void classifiesPackageNamesByTheirFinalSuffix() {
        assertEquals(".tgz", PluginArchiveImport.archiveSuffix("自定义插件.TGZ"));
        assertEquals(".tar.gz", PluginArchiveImport.archiveSuffix("Plugin.tar.GZ"));
        assertNull(PluginArchiveImport.archiveSuffix("plugin.tgz.zip"));
        assertNull(PluginArchiveImport.archiveSuffix(null));
    }

    @Test public void keepsOriginalBytesAndAStableHostPath() throws Exception {
        Path directory = temp.getRoot().toPath();
        byte[] first = {1, 2, 3};
        byte[] updated = {4, 5, 6};
        for (String suffix : new String[]{".tgz", ".tar.gz"}) {
            Path firstPath = PluginArchiveImport.stageArchive(directory, new ByteArrayInputStream(first), suffix);
            assertEquals(directory, firstPath.getParent());
            assertTrue(firstPath.getFileName().toString().endsWith(suffix));
            assertEquals(firstPath, PluginArchiveImport.stageArchive(directory, new ByteArrayInputStream(first), suffix));
            Path updatedPath = PluginArchiveImport.stageArchive(directory, new ByteArrayInputStream(updated), suffix);
            assertNotEquals(firstPath, updatedPath);
            assertArrayEquals(first, Files.readAllBytes(firstPath));
            assertArrayEquals(updated, Files.readAllBytes(updatedPath));
        }
    }

    @Test public void failedReadLeavesNoPartialPackage() throws Exception {
        Path directory = temp.getRoot().toPath();
        InputStream broken = new InputStream() {
            @Override public int read() throws IOException { throw new IOException("Incomplete read"); }
        };
        assertThrows(IOException.class, () -> PluginArchiveImport.stageArchive(directory, broken, ".tgz"));
        try (var staged = Files.list(directory)) {
            assertEquals(0, staged.count());
        }
    }
}

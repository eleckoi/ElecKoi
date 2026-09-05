package com.eleckoi.android.foundation.storage

import java.io.File
import java.nio.file.Files
import java.nio.file.LinkOption.NOFOLLOW_LINKS
import java.nio.file.SimpleFileVisitor
import java.nio.file.FileVisitResult
import java.nio.file.Path
import java.nio.file.attribute.BasicFileAttributes
import java.io.IOException

/** Deletes only a direct child owned by this store. Failures must reach the deletion caller. */
fun deleteOwnedFile(root: File, file: File) {
    val path = ownedChild(root, file)
    require(!Files.isDirectory(path, NOFOLLOW_LINKS)) { "不能把目录当作文件删除：$file" }
    Files.deleteIfExists(path)
}

/** Does not follow directory symlinks, including links inside the owned directory. */
fun deleteOwnedDirectory(root: File, directory: File) {
    val path = ownedChild(root, directory)
    if (!Files.exists(path, NOFOLLOW_LINKS)) return
    Files.walkFileTree(path, object : SimpleFileVisitor<Path>() {
        override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
            Files.delete(file)
            return FileVisitResult.CONTINUE
        }

        override fun postVisitDirectory(dir: Path, error: IOException?): FileVisitResult {
            if (error != null) throw error
            Files.delete(dir)
            return FileVisitResult.CONTINUE
        }
    })
}

private fun ownedChild(root: File, file: File): Path {
    val directory = root.canonicalFile
    val candidate = file.absoluteFile.normalize()
    require(candidate.parentFile?.canonicalFile == directory) { "删除路径不属于指定目录：$file" }
    // Resolve the parent only: unlinking a symlink must never delete its external target.
    return File(directory, candidate.name).toPath()
}

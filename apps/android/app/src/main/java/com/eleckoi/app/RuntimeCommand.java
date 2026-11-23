package com.eleckoi.app;

import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.*;

final class RuntimeCommand {
    static ProcessBuilder create(android.content.Context context, RuntimePaths paths, RuntimeInstaller.Installation installation, boolean profileStartup) throws Exception {
        return create(context, paths, installation, profileStartup, false);
    }
    static ProcessBuilder create(android.content.Context context, RuntimePaths paths, RuntimeInstaller.Installation installation, boolean profileStartup, boolean disableUserPlugins) throws Exception {
        JSONObject config = new JSONObject()
            .put("schemaVersion", 1)
            .put("runtimeDataRoot", paths.data.getAbsolutePath())
            .put("homeRoot", paths.home.getAbsolutePath())
            .put("workspaceRoot", paths.workspace.getAbsolutePath())
            .put("productDatabasePath", new File(paths.data, "eleckoi.db").getAbsolutePath())
            .put("productMediaRoot", paths.media.getAbsolutePath())
            .put("resourceRoot", new File(installation.app, "resources/dsh").getAbsolutePath());
        if (BuildConfig.DEBUG && "standard".equals(BuildConfig.BROWSER_VARIANT)) {
            File renderer = developmentRenderer(context);
            if (renderer != null) config.put("clientDirectory", renderer.getAbsolutePath());
        }
        Files.write(paths.config.toPath(), config.toString().getBytes(StandardCharsets.UTF_8));
        File launcher = paths.nativeExecutable("libeleckoi_node.so");
        File loader = paths.nativeExecutable("libeleckoi_glibc_portable.so");
        File glibc = new File(installation.rootfs, "usr/glibc");
        java.nio.file.Path resolver = new File(glibc, "etc/resolv.conf").toPath();
        Files.createDirectories(resolver.getParent());
        if (!Files.isSymbolicLink(resolver) || !Files.readSymbolicLink(resolver).equals(paths.resolver.toPath())) {
            Files.deleteIfExists(resolver);
            Files.createSymbolicLink(resolver, paths.resolver.toPath());
        }
        List<String> args = new ArrayList<>(Arrays.asList(launcher.getAbsolutePath(), "--report-exclude-network"));
        String entrypoint = new File(installation.app, "bin/eleckoi-host.mjs").getAbsolutePath();
        if (profileStartup && (context.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            File startupEntry = new File(paths.temp, "startup-profile.mjs");
            try (java.io.InputStream source = context.getAssets().open("startup-profile.mjs")) {
                Files.write(startupEntry.toPath(), RuntimeInstaller.readText(source).getBytes(StandardCharsets.UTF_8));
            }
            entrypoint = startupEntry.getAbsolutePath();
        }
        args.addAll(Arrays.asList(entrypoint, "--config", paths.config.getAbsolutePath()));
        if (disableUserPlugins) args.add("--disable-user-plugins");
        ProcessBuilder builder = new ProcessBuilder(args).directory(paths.workspace);
        Map<String,String> env = builder.environment(); env.clear();
        env.put("ELECKOI_GLIBC_ROOT", installation.rootfs.getAbsolutePath());
        env.put("ELECKOI_GLIBC_LOADER", loader.getAbsolutePath());
        env.put("ELECKOI_GLIBC_LIBRARIES", new File(glibc, "lib").getAbsolutePath() + ":"
            + new File(installation.rootfs, "usr/lib/aarch64-linux-gnu").getAbsolutePath());
        env.put("ELECKOI_GLIBC_EXEC_SHIM", new File(glibc, "lib/libeleckoi_glibc_exec.so").getAbsolutePath());
        env.put("ELECKOI_NODE_PAYLOAD", new File(installation.rootfs, installation.nodeExecutable.substring(1)).getAbsolutePath());
        env.put("ELECKOI_NODE_BOOTSTRAP", new File(installation.app, "bin/android-node-bootstrap.cjs").getAbsolutePath());
        env.put("ELECKOI_LINUX_ROOTFS", installation.rootfs.getAbsolutePath());
        env.put("ELECKOI_RUNTIME_ROOT", paths.root.getAbsolutePath());
        env.put("ELECKOI_NATIVE_DIRECTORY", paths.nativeLibraries.getAbsolutePath());
        env.put("ELECKOI_RESOLVER", paths.resolver.getAbsolutePath());
        env.put("ELECKOI_HOST_ENTRYPOINT", new File(installation.app, "bin/eleckoi-host.mjs").getAbsolutePath());
        env.put("HOME", paths.home.getAbsolutePath()); env.put("DSH_HOME", paths.home.getAbsolutePath());
        env.put("DSH_TELEMETRY_DISABLED", "1"); env.put("LANG", "C.UTF-8"); env.put("LC_ALL", "C.UTF-8");
        env.put("PATH", new File(installation.rootfs, "usr/bin").getAbsolutePath() + ":"
            + new File(installation.rootfs, "usr/sbin").getAbsolutePath() + ":/system/bin");
        env.put("GIT_EXEC_PATH", new File(installation.rootfs, "usr/lib/git-core").getAbsolutePath());
        env.put("GIT_TEMPLATE_DIR", new File(installation.rootfs, "usr/share/git-core/templates").getAbsolutePath());
        env.put("GIT_SSL_CAINFO", new File(installation.rootfs, "etc/ssl/certs/ca-certificates.crt").getAbsolutePath());
        env.put("GIT_CONFIG_NOSYSTEM", "1");
        env.put("GIT_TERMINAL_PROMPT", "0");
        env.put("TMPDIR", paths.temp.getAbsolutePath());
        return builder;
    }

    /** ADB can supply a renderer for this exact debug APK without touching the installed runtime. */
    private static File developmentRenderer(android.content.Context context) throws Exception {
        String apk = context.getApplicationInfo().sourceDir;
        String installation = RuntimeInstaller.hex(MessageDigest.getInstance("SHA-256")
            .digest(apk.getBytes(StandardCharsets.UTF_8)));
        File cache = new File(context.getCacheDir(), "eleckoi-dev-web");
        File active = new File(cache, "active");
        try {
            if (!active.isFile()) return null;
            String[] selection;
            try (java.io.InputStream input = new java.io.FileInputStream(active)) {
                selection = RuntimeInstaller.readText(input).trim().split(" ");
            }
            if (selection.length != 2 || !installation.equals(selection[0])
                || !selection[1].matches("renderer-[a-f0-9]{16}")) return null;
            File renderer = new File(cache, selection[1]);
            if (new File(renderer, "dsh.html").isFile()) return renderer;
            android.util.Log.w("ElecKoi", "Development renderer was evicted. Using the packaged renderer.");
        } catch (java.io.IOException error) {
            android.util.Log.w("ElecKoi", "Could not read the development renderer selection.", error);
        }
        return null;
    }
}

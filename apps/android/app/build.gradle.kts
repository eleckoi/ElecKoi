import groovy.json.JsonSlurper
import java.security.MessageDigest

abstract class PrepareCompatBridgeTask : DefaultTask() {
    @get:InputFile abstract val facade: RegularFileProperty
    @get:InputFile abstract val diagnostics: RegularFileProperty
    @get:OutputDirectory abstract val outputDirectory: DirectoryProperty
    @TaskAction fun prepare() {
        val output = outputDirectory.file("eleckoi-browser/platform-facade.js").get().asFile
        output.parentFile.mkdirs()
        facade.get().asFile.copyTo(output, overwrite = true)
        diagnostics.get().asFile.copyTo(output.parentFile.resolve("browser-diagnostics.js"), overwrite = true)
    }
}

plugins { id("com.android.application") }
val gecko = JsonSlurper().parse(rootProject.file("geckoview.lock.json")) as Map<*, *>
check(gecko["schemaVersion"] == 1 && gecko["channel"] == "stable") { "Unsupported GeckoView lock" }
val runtimeAssets = providers.gradleProperty("unifiedRuntimeAssetsDir")
    .map { rootProject.file(it) }.getOrElse(rootProject.file("runtime-assets"))
val releaseSigningValues = listOf("ELECKOI_RELEASE_STORE_FILE", "ELECKOI_RELEASE_STORE_PASSWORD",
    "ELECKOI_RELEASE_KEY_ALIAS", "ELECKOI_RELEASE_KEY_PASSWORD").associateWith { name ->
    providers.environmentVariable(name).orElse(providers.gradleProperty(name)).orNull?.trim()?.takeIf { it.isNotEmpty() }
}
val releaseSigningConfigured = releaseSigningValues.values.all { it != null }
android {
    namespace = "com.eleckoi.app"
    compileSdk { version = release(37) { minorApiLevel = 2 } }
    defaultConfig {
        applicationId = "com.eleckoi.app"
        minSdk = 27
        targetSdk = 35
        versionCode = 10
        versionName = "0.2.15"
        ndk { abiFilters += "arm64-v8a" }
    }
    flavorDimensions += "browser"
    productFlavors {
        create("standard") { dimension = "browser"; buildConfigField("String", "BROWSER_VARIANT", "\"standard\"") }
        create("compat") {
            dimension = "browser"
            buildConfigField("String", "BROWSER_VARIANT", "\"compat\"")
            buildConfigField("String", "GECKOVIEW_VERSION", "\"${gecko["version"]}\"")
        }
    }
    buildFeatures { buildConfig = true; resValues = true }
    sourceSets.getByName("main").assets.directories += runtimeAssets.absolutePath
    androidResources { noCompress += "archive" }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    packaging { jniLibs {
        useLegacyPackaging = true
        keepDebugSymbols += (gecko["native"] as List<Map<String,Any>>).map { "**/" + (it["path"] as String).substringAfterLast('/') }
    } }
    signingConfigs {
        create("release") {
            if (releaseSigningConfigured) {
                storeFile = file(checkNotNull(releaseSigningValues["ELECKOI_RELEASE_STORE_FILE"]))
                storePassword = checkNotNull(releaseSigningValues["ELECKOI_RELEASE_STORE_PASSWORD"])
                keyAlias = checkNotNull(releaseSigningValues["ELECKOI_RELEASE_KEY_ALIAS"])
                keyPassword = checkNotNull(releaseSigningValues["ELECKOI_RELEASE_KEY_PASSWORD"])
            }
        }
    }
    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "ElecKoi 开发版")
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
dependencies {
    implementation("androidx.core:core:1.13.1")
    "standardImplementation"("androidx.webkit:webkit:1.12.1")
    "compatImplementation"("${gecko["group"]}:${gecko["artifact"]}:${gecko["version"]}")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}

val verifyReleaseSigning = tasks.register("verifyReleaseSigning") {
    group = "verification"
    doLast {
        val missing = releaseSigningValues.filterValues { it == null }.keys
        check(missing.isEmpty()) { "Release signing is not configured. Set: ${missing.joinToString()}." }
        check(file(checkNotNull(releaseSigningValues["ELECKOI_RELEASE_STORE_FILE"])).isFile) { "Release keystore is missing." }
    }
}
tasks.matching { it.name in listOf("packageStandardRelease", "bundleStandardRelease", "packageCompatRelease", "bundleCompatRelease") }.configureEach {
    dependsOn(verifyReleaseSigning)
}

val prepareCompatBridge = tasks.register<PrepareCompatBridgeTask>("prepareCompatBridge") {
    facade.set(layout.projectDirectory.file("src/main/assets/platform-facade.js"))
    diagnostics.set(layout.projectDirectory.file("src/main/assets/browser-diagnostics.js"))
    outputDirectory.set(layout.buildDirectory.dir("generated/compatBrowserAssets"))
}
androidComponents.onVariants(androidComponents.selector().withFlavor("browser" to "compat")) { variant ->
    variant.sources.assets?.addGeneratedSourceDirectory(prepareCompatBridge) { it.outputDirectory }
}

listOf("Debug", "Release").forEach { buildType ->
    val check = tasks.register("verifyCompat${buildType}Gecko") {
        doLast {
            val artifact = configurations.getByName("compat${buildType}RuntimeClasspath").resolvedConfiguration.resolvedArtifacts.single {
                it.moduleVersion.id.group == gecko["group"] && it.name == gecko["artifact"] && it.moduleVersion.id.version == gecko["version"]
            }
            val digest = MessageDigest.getInstance("SHA-256")
            artifact.file.inputStream().use { stream ->
                val buffer = ByteArray(65536); while(true) { val count=stream.read(buffer); if(count<0) break; digest.update(buffer,0,count) }
            }
            check(digest.digest().joinToString("") { "%02x".format(it) } == gecko["sha256"]) { "GeckoView artifact checksum mismatch" }
        }
    }
    tasks.matching { it.name == "preCompat${buildType}Build" }.configureEach { dependsOn(check) }
}

val verifyRuntimeAssets = tasks.register("verifyRuntimeAssets") {
    group = "verification"
    inputs.dir(runtimeAssets)
    doLast {
        val manifestFile = runtimeAssets.resolve("runtime/manifest.json")
        check(manifestFile.isFile) { "Missing unified Host assets: $manifestFile. Stage ARM64 rootfs, Node and real Host before acceptance." }
        val manifest = JsonSlurper().parse(manifestFile) as Map<*, *>
        check(manifest["schemaVersion"] == 1 && manifest["architecture"] == "arm64-v8a" && manifest["protocolVersion"] == 1
            && manifest["nodeExecutable"] == "/usr/bin/node" && manifest["hostEntrypoint"] == "/eleckoi/app/bin/eleckoi-host.mjs") { "Unsupported runtime manifest" }
        val archives = manifest["archives"] as? List<*> ?: error("Runtime archives missing")
        val expected = listOf("runtime/rootfs.archive" to "rootfs", "runtime/node.archive" to "rootfs",
            "runtime/git.archive" to "rootfs", "runtime/app.archive" to "app")
        check(archives.size == expected.size) { "Runtime requires rootfs, Node, Git and Host archives" }
        archives.forEachIndexed { index, value ->
            val archive = value as Map<*, *>
            val asset = archive["asset"] as? String ?: error("Archive asset missing")
            check(asset == expected[index].first && archive["target"] == expected[index].second) { "Unexpected runtime archive: $asset" }
            val file = runtimeAssets.resolve(asset).canonicalFile
            check(file.toPath().startsWith(runtimeAssets.canonicalFile.toPath()) && file.isFile) { "Missing archive $asset" }
            val digest = archive["sha256"] as? String ?: error("Missing SHA-256 for $asset")
            check(digest.matches(Regex("[a-f0-9]{64}"))) { "Invalid SHA-256 for $asset" }
            check((archive["bytes"] as? Number)?.toLong() == file.length()) { "Runtime size mismatch: $asset" }
            check((archive["unpackedBytes"] as? Number)?.toLong()?.let { it > 0 } == true) { "Missing unpacked runtime size: $asset" }
            val sha256 = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) { val count = input.read(buffer); if (count < 0) break; sha256.update(buffer, 0, count) }
            }
            check(sha256.digest().joinToString("") { "%02x".format(it) } == digest) { "Runtime checksum mismatch: $asset" }
        }
    }
}

tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach {
    dependsOn(verifyRuntimeAssets)
}

afterEvaluate {
    listOf("standard", "compat").forEach { flavor -> listOf("Debug", "Release").forEach { buildType ->
        val variant = flavor.replaceFirstChar { it.uppercase() } + buildType
        val outputDirectory = layout.buildDirectory.dir("outputs/apk/$flavor/${buildType.lowercase()}")
        val descriptorName = if (flavor == "standard") "android-update.json" else "android-update-compat.json"
        val verification = tasks.register<Exec>("verify${variant}Apk") {
            group = "verification"
            dependsOn("package$variant")
            doFirst {
                val directory = outputDirectory.get().asFile.canonicalFile
                val metadata = JsonSlurper().parse(directory.resolve("output-metadata.json")) as Map<*, *>
                val elements = metadata["elements"] as? List<*> ?: error("APK output metadata is missing elements")
                check(elements.size == 1) { "Expected one Android APK output" }
                val output = (elements.single() as Map<*, *>)["outputFile"] as? String ?: error("APK output file is missing")
                val apk = directory.resolve(output).canonicalFile
                check(apk.parentFile == directory && apk.isFile && apk.extension == "apk") { "Invalid APK output file" }
                commandLine("python", rootProject.file("../../scripts/android-runtime/check-apk.py"), apk, "--variant", flavor)
            }
        }
        if (buildType == "Release") {
          val descriptor = tasks.register<Exec>("write${variant}UpdateDescriptor") {
            dependsOn(verification)
            inputs.file(outputDirectory.map { it.file("output-metadata.json") })
            outputs.file(outputDirectory.map { it.file(descriptorName) })
            outputs.upToDateWhen { false }
            commandLine("node", rootProject.file("../../scripts/android-runtime/create-update-descriptor.mjs"),
                outputDirectory.get().file("output-metadata.json").asFile, outputDirectory.get().file(descriptorName).asFile, flavor)
          }
          tasks.named("assemble$variant").configure { finalizedBy(descriptor) }
        } else {
          tasks.named("assemble$variant").configure { finalizedBy(verification) }
        }
    } }
}

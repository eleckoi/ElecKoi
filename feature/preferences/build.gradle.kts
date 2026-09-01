plugins {
    id("eleckoi.android.library")
    id("eleckoi.android.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.eleckoi.android.feature.preferences"
}

dependencies {
    implementation(project(":foundation:design"))
    implementation(project(":foundation:serialization"))

    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.datastore:datastore-preferences:1.2.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
}

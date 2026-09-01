plugins {
    id("eleckoi.android.library")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.eleckoi.android.sdk.author"
}

dependencies {
    api(project(":engine"))
    implementation(project(":foundation:serialization"))
    implementation(project(":foundation:storage"))

    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.webkit:webkit:1.16.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

}

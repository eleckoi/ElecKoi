plugins {
    id("eleckoi.android.library")
}

android {
    namespace = "com.eleckoi.android.foundation.diagnostics"
}

dependencies {
    implementation("androidx.annotation:annotation:1.10.0")
    implementation("androidx.collection:collection-ktx:1.5.0")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}

plugins {
    id("eleckoi.android.library")
    id("eleckoi.android.compose")
}

android {
    namespace = "com.eleckoi.android.feature.agenttools"
}

dependencies {
    implementation(project(":feature:conversation"))
    implementation(project(":feature:modelconfig"))
    implementation(project(":engine"))
    implementation(project(":foundation:design"))

    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}

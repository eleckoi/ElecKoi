plugins {
    id("eleckoi.android.library")
    id("eleckoi.android.compose")
}

android {
    namespace = "com.eleckoi.android.feature.settings"
}

dependencies {
    implementation(project(":feature:studio"))
    implementation(project(":feature:conversation"))
    implementation(project(":feature:appfont"))
    implementation(project(":feature:characters"))
    implementation(project(":feature:modelconfig"))
    implementation(project(":feature:preferences"))
    implementation(project(":engine"))
    implementation(project(":foundation:design"))
    implementation(project(":foundation:diagnostics"))
    implementation(project(":foundation:storage"))

    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.10.0")
    implementation("io.coil-kt.coil3:coil-compose:3.5.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("sh.calvin.reorderable:reorderable:3.1.0")
}

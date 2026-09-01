plugins {
    id("eleckoi.android.library")
}

android {
    namespace = "com.eleckoi.android.foundation.paging"
}

dependencies {
    implementation("androidx.paging:paging-runtime:3.5.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}

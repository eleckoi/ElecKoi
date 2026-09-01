plugins {
    id("eleckoi.android.library")
}

android {
    namespace = "com.eleckoi.android.foundation.network"
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("org.json:json:20240303")
}

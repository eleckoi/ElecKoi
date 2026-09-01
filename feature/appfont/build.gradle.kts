plugins {
    id("eleckoi.android.library")
    id("eleckoi.android.compose")
}

android {
    namespace = "com.eleckoi.android.feature.appfont"
}

dependencies {
    implementation("androidx.compose.material3:material3")
    implementation("androidx.datastore:datastore-preferences:1.2.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}

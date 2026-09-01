plugins {
    id("eleckoi.android.library")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.eleckoi.android.foundation.storage"
}

ksp {
    arg("room.schemaLocation", file("schemas").absolutePath)
}

dependencies {
    api("androidx.paging:paging-runtime:3.5.0")
    api("androidx.room:room-runtime:2.8.4")
    api("androidx.room:room-ktx:2.8.4")
    api("androidx.room:room-paging:2.8.4")
    ksp("androidx.room:room-compiler:2.8.4")
    testImplementation("org.json:json:20240303")
}

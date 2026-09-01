plugins {
    id("eleckoi.android.library")
}

android {
    namespace = "com.eleckoi.android.compatibility.mvu"
}

dependencies {
    implementation(project(":engine"))
    implementation(project(":foundation:storage"))

    testImplementation("org.json:json:20240303")
}

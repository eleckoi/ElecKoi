# Android HTTP client

The Android shell uses unmodified Maven artifacts for its local Host notification connection:

- OkHttp 4.12.0 (`com.squareup.okhttp3:okhttp`), Square, Inc. and contributors, Apache-2.0. Source: https://github.com/square/okhttp/tree/parent-4.12.0
- Okio / Okio JVM 3.6.0, Square, Inc. and contributors, Apache-2.0. Source: https://github.com/square/okio/tree/parent-3.6.0
- Kotlin standard library 2.2.10 and JDK7/JDK8 adapters 1.9.10, JetBrains and contributors, Apache-2.0. Source: https://github.com/JetBrains/kotlin

The accompanying license files are distributed with both Android browser variants. MockWebServer 4.12.0 is used only by local tests and is not included in the application.

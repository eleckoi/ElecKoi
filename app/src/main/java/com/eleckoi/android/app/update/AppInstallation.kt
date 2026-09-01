package com.eleckoi.android.app.update

import android.content.Context

internal fun Context.installedVersionName(): String = runCatching {
    packageManager.getPackageInfo(packageName, 0).versionName
}.getOrNull().orEmpty().ifBlank { "0.0.0" }

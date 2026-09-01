package com.eleckoi.android.foundation.network

import java.net.Proxy
import java.util.concurrent.TimeUnit
import okhttp3.Dns
import okhttp3.EventListener
import okhttp3.OkHttpClient

object SecureModelHttpClientFactory {
    fun create(
        explicitProxy: Proxy?,
        connectTimeoutMillis: Int,
        readTimeoutMillis: Int,
        eventListenerFactory: EventListener.Factory? = null,
    ): OkHttpClient = OkHttpClient.Builder()
        .dns(if (explicitProxy == null) SecureModelDns else Dns.SYSTEM)
        .apply { explicitProxy?.let(::proxy) }
        .apply { eventListenerFactory?.let(::eventListenerFactory) }
        .connectTimeout(connectTimeoutMillis.toLong(), TimeUnit.MILLISECONDS)
        .writeTimeout(readTimeoutMillis.toLong(), TimeUnit.MILLISECONDS)
        .readTimeout(readTimeoutMillis.toLong(), TimeUnit.MILLISECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .build()
}

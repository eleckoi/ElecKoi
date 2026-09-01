package com.eleckoi.android.foundation.network

import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.IDN
import java.net.InetAddress
import java.net.Proxy
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import okhttp3.Dns
import org.json.JSONObject

/**
 * Resolves public model-provider hosts through certificate-verified DNS-over-HTTPS.
 *
 * Some mobile and router DNS servers return interception addresses whose certificates do not
 * match the requested provider hostname. The model request still performs normal TLS hostname
 * verification; this resolver only supplies the destination IP address.
 */
internal object SecureModelDns : Dns {
    private data class CacheEntry(
        val addresses: List<InetAddress>,
        val expiresAtMillis: Long,
    )

    private val cache = ConcurrentHashMap<String, CacheEntry>()

    override fun lookup(hostname: String): List<InetAddress> {
        val normalized = runCatching { IDN.toASCII(hostname.trim()).lowercase() }
            .getOrDefault(hostname.trim().lowercase())
        if (shouldUseSystemResolver(normalized)) return Dns.SYSTEM.lookup(hostname)

        val now = System.currentTimeMillis()
        cache[normalized]
            ?.takeIf { it.expiresAtMillis > now }
            ?.let { return it.addresses }

        val secure = DohEndpoints.firstNotNullOfOrNull { endpoint ->
            runCatching { query(endpoint, normalized) }
                .getOrNull()
                ?.takeIf(List<InetAddress>::isNotEmpty)
        }
        if (!secure.isNullOrEmpty()) {
            cache[normalized] = CacheEntry(
                addresses = secure,
                expiresAtMillis = now + CacheLifetimeMillis,
            )
            return secure
        }
        return Dns.SYSTEM.lookup(hostname)
    }

    private fun query(endpoint: String, hostname: String): List<InetAddress> {
        val encoded = URLEncoder.encode(hostname, Charsets.UTF_8.name())
        val connection = URL("$endpoint?name=$encoded&type=A")
            .openConnection(Proxy.NO_PROXY) as HttpURLConnection
        return try {
            connection.connectTimeout = DohConnectTimeoutMillis
            connection.readTimeout = DohReadTimeoutMillis
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/dns-json")
            if (connection.responseCode !in 200..299) return emptyList()
            val body = readBoundedBody(connection)
            val answers = JSONObject(body).optJSONArray("Answer") ?: return emptyList()
            buildList {
                for (index in 0 until answers.length()) {
                    val answer = answers.optJSONObject(index) ?: continue
                    if (answer.optInt("type") != ARecordType) continue
                    val value = answer.optString("data").trim()
                    if (!Ipv4.matches(value)) continue
                    add(InetAddress.getByName(value))
                }
            }.distinctBy(InetAddress::getHostAddress)
        } finally {
            connection.disconnect()
        }
    }

    private fun readBoundedBody(connection: HttpURLConnection): String {
        val output = StringBuilder()
        InputStreamReader(connection.inputStream, Charsets.UTF_8).use { reader ->
            val buffer = CharArray(2 * 1024)
            while (true) {
                val count = reader.read(buffer)
                if (count < 0) break
                require(output.length + count <= MaxDohResponseChars) { "安全 DNS 响应过大" }
                output.append(buffer, 0, count)
            }
        }
        return output.toString()
    }

    private fun shouldUseSystemResolver(hostname: String): Boolean {
        if (hostname.isBlank() || hostname == "localhost" || hostname.endsWith(".local")) return true
        if (!hostname.contains('.')) return true
        return Ipv4.matches(hostname) || hostname.contains(':')
    }

    private const val ARecordType = 1
    private const val DohConnectTimeoutMillis = 3_000
    private const val DohReadTimeoutMillis = 4_000
    private const val MaxDohResponseChars = 128 * 1024
    private const val CacheLifetimeMillis = 5 * 60 * 1_000L
    private val Ipv4 = Regex("^(?:\\d{1,3}\\.){3}\\d{1,3}$")
    private val DohEndpoints = listOf(
        "https://dns.alidns.com/resolve",
        "https://doh.pub/dns-query",
    )
}

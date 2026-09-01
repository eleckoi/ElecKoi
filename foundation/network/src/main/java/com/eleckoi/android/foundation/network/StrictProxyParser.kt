package com.eleckoi.android.foundation.network

import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URI

object StrictProxyParser {
    fun parse(value: String): Proxy? {
        val text = value.trim()
        if (text.isEmpty()) return null
        val uri = runCatching { URI(text) }
            .getOrElse { throw IllegalArgumentException("代理地址格式无效", it) }
        require(uri.isAbsolute && !uri.host.isNullOrBlank()) { "代理地址必须包含协议和主机" }
        require(uri.userInfo == null) { "暂不支持在代理 URL 中填写账号" }
        require(uri.query == null && uri.fragment == null) { "代理地址不能包含查询参数或片段" }
        require(uri.rawPath.isNullOrEmpty() || uri.rawPath == "/") { "代理地址不能包含路径" }
        require(uri.port == -1 || uri.port in 1..65_535) { "代理端口无效" }

        val type = when (uri.scheme?.lowercase()) {
            "http", "https" -> Proxy.Type.HTTP
            "socks", "socks5" -> Proxy.Type.SOCKS
            else -> throw IllegalArgumentException("代理仅支持 HTTP、HTTPS 或 SOCKS5")
        }
        val port = when {
            uri.port > 0 -> uri.port
            type == Proxy.Type.SOCKS -> 1080
            else -> 8080
        }
        return Proxy(type, InetSocketAddress.createUnresolved(uri.host, port))
    }
}

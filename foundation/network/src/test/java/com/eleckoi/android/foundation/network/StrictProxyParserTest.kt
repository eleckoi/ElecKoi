package com.eleckoi.android.foundation.network

import java.net.InetSocketAddress
import java.net.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class StrictProxyParserTest {
    @Test
    fun `parses supported proxy endpoints without resolving dns`() {
        assertNull(StrictProxyParser.parse("  "))
        val proxy = StrictProxyParser.parse("socks5://proxy.example:1081")!!
        assertEquals(Proxy.Type.SOCKS, proxy.type())
        val address = proxy.address() as InetSocketAddress
        assertEquals("proxy.example", address.hostString)
        assertEquals(1081, address.port)
        assertEquals(true, address.isUnresolved)
    }

    @Test
    fun `rejects malformed ambiguous or credential bearing proxy values`() {
        listOf(
            "not-a-proxy",
            "ftp://proxy.example:21",
            "http://user:pass@proxy.example:8080",
            "http://proxy.example:8080/path",
            "http://proxy.example:8080?target=other",
            "http://proxy.example:99999",
        ).forEach { value ->
            assertThrows(IllegalArgumentException::class.java) { StrictProxyParser.parse(value) }
        }
    }
}

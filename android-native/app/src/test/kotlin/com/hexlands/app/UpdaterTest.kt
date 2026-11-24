package com.hexlands.app

import com.hexlands.app.update.UpdateInfo
import com.hexlands.app.update.Updater
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.nio.file.Files

/** The update check reads GitHub's release answer; the download goes through a local server here, so nothing real is fetched. */
class UpdaterTest {
    private val repo = "vivekmuralee07/Hexlands"
    private fun release(tag: String = "app-1042", draft: Boolean = false, pre: Boolean = false, asset: String = "hexlands-test.apk", host: String = "https://github.com/$repo/releases/download/$tag/") = """
        {"tag_name":"$tag","draft":$draft,"prerelease":$pre,"body":"Undo and counter-offers\n\nMore text","assets":[
          {"name":"other.zip","size":5,"browser_download_url":"${host}other.zip"},
          {"name":"$asset","size":1234567,"browser_download_url":"$host$asset"}]}
    """.trimIndent()

    @Test fun readsTheNewestRelease() {
        val info = Updater.parseRelease(release(), repo)!!
        assertEquals(1042, info.versionCode)
        assertEquals(1234567L, info.sizeBytes)
        assertEquals("https://github.com/$repo/releases/download/app-1042/hexlands-test.apk", info.apkUrl)
        assertTrue(info.notes.startsWith("Undo and counter-offers"))
    }

    @Test fun githubSpellsTheRepositoryNameInItsOwnCapitals() {
        // The app is configured with the lower-case name; GitHub's download links use the real one (VivekMuralee07).
        val real = release(host = "https://github.com/VivekMuralee07/Hexlands/releases/download/app-1049/", tag = "app-1049")
        assertEquals(1049, Updater.parseRelease(real, repo)!!.versionCode)
    }

    @Test fun ignoresReleasesThatAreNotOursOrNotFinished() {
        assertNull("a draft", Updater.parseRelease(release(draft = true), repo))
        assertNull("a pre-release", Updater.parseRelease(release(pre = true), repo))
        assertNull("another kind of tag", Updater.parseRelease(release(tag = "v2.0"), repo))
        assertNull("no APK attached", Updater.parseRelease(release(asset = "notes.txt"), repo))
        assertNull("an APK from somewhere else", Updater.parseRelease(release(host = "https://evil.example.com/"), repo))
        assertNull("another repository's release", Updater.parseRelease(release(host = "https://github.com/someone/else/releases/download/app-1042/"), repo))
        assertNull("not JSON", Updater.parseRelease("<html>", repo))
    }

    @Test fun onlyANewerNumberIsAnUpdate() {
        val latest = UpdateInfo(1042, "", "https://x", 0)
        assertEquals(latest, Updater.newerThan(1041, latest))
        assertNull("the same build", Updater.newerThan(1042, latest))
        assertNull("an older release", Updater.newerThan(1050, latest))
        assertNull("no release", Updater.newerThan(100, null))
    }

    /** A tiny web server on a free port that answers every request with [bytes] (or just [status]); [advertise] is the length it announces. */
    private class Server(val bytes: ByteArray, val status: Int = 200, val advertise: Long = bytes.size.toLong()) : AutoCloseable {
        private val socket = ServerSocket(0, 5, InetAddress.getByName("127.0.0.1"))
        val url = "http://127.0.0.1:${socket.localPort}/apk"
        private val thread = Thread {
            while (!socket.isClosed) {
                val c = try { socket.accept() } catch (e: Exception) { break }
                c.use {
                    val input = it.getInputStream().bufferedReader()
                    while (true) { val line = input.readLine() ?: break; if (line.isEmpty()) break }   // read the request up to its blank line
                    val out = it.getOutputStream()
                    if (status == 200) { out.write("HTTP/1.1 200 OK\r\nContent-Length: $advertise\r\nConnection: close\r\n\r\n".toByteArray()); out.write(bytes) }
                    else out.write("HTTP/1.1 $status Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
                    out.flush()
                }
            }
        }.apply { isDaemon = true; start() }
        override fun close() { socket.close() }
    }

    @Test fun downloadsWithProgressAndSavesTheFileOnlyWhenComplete() = runBlocking {
        val bytes = ByteArray(600_000) { (it % 251).toByte() }
        val dir = Files.createTempDirectory("updates").toFile()
        Server(bytes).use { server ->
            val steps = Updater.download(OkHttpClient(), UpdateInfo(2000, "", server.url, bytes.size.toLong()), dir).toList()
            assertTrue("every step worked", steps.all { it.isSuccess })
            val percents = steps.map { it.getOrThrow().first }
            assertEquals("ends at 100", 100, percents.last())
            assertEquals("never goes backwards", percents.sorted(), percents)
            val file = steps.last().getOrThrow().second
            assertNotNull(file)
            assertTrue("the bytes are the same", bytes.contentEquals(file!!.readBytes()))
            assertEquals("hexlands-test.apk", file.name)
            assertFalse("no half-finished file is left", File(dir, "hexlands-test.apk.part").exists())
            dir.deleteRecursively()
        }
        Unit
    }

    @Test fun aCutShortOrRefusedDownloadFailsAndLeavesNothingToInstall() = runBlocking {
        val dir = Files.createTempDirectory("updates").toFile()
        val bytes = ByteArray(1000) { 7 }
        Server(bytes).use { cut -> Server(bytes, status = 404).use { gone ->
            val short = Updater.download(OkHttpClient(), UpdateInfo(2000, "", cut.url, 5000), dir).toList()   // GitHub says 5000 bytes, only 1000 arrive
            assertTrue(short.last().isFailure)
            assertTrue(short.last().exceptionOrNull()!!.message!!.contains("cut short"))
            val missing = Updater.download(OkHttpClient(), UpdateInfo(2000, "", gone.url, 0), dir).toList()
            assertTrue(missing.last().isFailure)
            assertFalse("nothing to install", File(dir, "hexlands-test.apk").exists())
            assertFalse(File(dir, "hexlands-test.apk.part").exists())
        } }
        dir.deleteRecursively()
        Unit
    }
}

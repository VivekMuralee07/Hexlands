package com.hexlands.app

import com.hexlands.app.net.Board
import com.hexlands.app.net.GameState
import com.hexlands.app.net.HexApi
import com.hexlands.app.net.Session
import com.hexlands.app.net.StreamEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.put
import org.junit.Assume.assumeTrue
import java.io.File
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.URL

/**
 * The game server for the tests: `android-native/tools/test-server.js`, which is the real server plus a few /__test/ endpoints that force dice,
 * hand out cards and so on. It runs on a free port with an in-memory database, so nothing is stored. The test is skipped when node is missing.
 */
class TestServer private constructor(val base: String, private val process: Process) : AutoCloseable {
    companion object {
        fun startOrSkip(): TestServer {
            val root = generateSequence(File("").absoluteFile) { it.parentFile }.firstOrNull { File(it, "server.js").exists() && File(it, "game.js").exists() }
            assumeTrue("the game server (server.js) was not found above ${File("").absolutePath}", root != null)
            val node = runCatching { ProcessBuilder("node", "--version").redirectErrorStream(true).start().also { it.waitFor() }.exitValue() == 0 }.getOrDefault(false)
            assumeTrue("node is not installed", node)
            val port = ServerSocket(0).use { it.localPort }
            val pb = ProcessBuilder("node", "android-native/tools/test-server.js").directory(root).redirectErrorStream(true)
            pb.environment().apply { put("PORT", port.toString()); put("DB_PATH", ":memory:"); put("BOT_DELAY_MS", "0") }
            val process = pb.start()
            Thread { process.inputStream.bufferedReader().forEachLine { } }.apply { isDaemon = true; start() }   // keep the pipe empty
            val base = "http://127.0.0.1:$port"
            val until = System.currentTimeMillis() + 20_000
            while (System.currentTimeMillis() < until) {
                if (runCatching { (URL("$base/healthz").openConnection() as HttpURLConnection).responseCode == 200 }.getOrDefault(false)) break
                Thread.sleep(100)
            }
            return TestServer(base, process)
        }
    }

    /** Calls one of the /__test/ endpoints (see test-server.js) with a JSON body. */
    fun force(path: String, body: JsonObject) {
        val c = URL("$base/__test/$path").openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.doOutput = true; c.setRequestProperty("Content-Type", "application/json")
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        check(c.responseCode == 200) { "test endpoint $path answered ${c.responseCode}: ${c.errorStream?.bufferedReader()?.readText()}" }
    }

    override fun close() { process.destroy() }
}

/** Collects the live stream of a session: the newest board and state, and why the room closed, if it did. */
class Watcher(api: HexApi, session: Session, scope: CoroutineScope) {
    val state = MutableStateFlow<GameState?>(null)
    val board = MutableStateFlow<Board?>(null)
    val closed = MutableStateFlow<String?>(null)

    init {
        api.events(session).onEach {
            when (it) {
                is StreamEvent.StateMsg -> state.value = it.state
                is StreamEvent.BoardMsg -> board.value = it.board
                is StreamEvent.Closed -> closed.value = it.reason
                else -> {}
            }
        }.launchIn(scope)
    }

    suspend fun until(timeoutMs: Long = 15_000, what: String = "the state", pred: (GameState) -> Boolean): GameState =
        try { withTimeout(timeoutMs) { state.first { it != null && pred(it) }!! } }
        catch (e: kotlinx.coroutines.TimeoutCancellationException) { throw AssertionError("timed out waiting for $what; last state: phase=${state.value?.phase} turn=${state.value?.turn} sub=${state.value?.subphase}") }
}

/** Plays the opening turns for the player with the server's legal spots, until the main game begins. */
suspend fun playSetup(api: HexApi, session: Session, w: Watcher) {
    while (true) {
        val s = w.until(timeoutMs = 20_000, what = "my setup turn or the main game") { it.phase == "main" || (it.phase == "setup" && it.turn == it.you) }
        if (s.phase == "main") return
        val legal = s.legal!!
        if (s.setup!!.expect == "settlement") api.act(session, "settle") { put("vertex", legal.settlements.first()) }
        else api.act(session, "road") { put("edge", legal.roads.first()) }
        delay(30)   // let the next state arrive so the same turn is not answered twice
    }
}

/** If a seven was rolled and this player must discard, discards that many cards (the first kinds found) and says so. */
suspend fun discardIfAsked(api: HexApi, session: Session, s: GameState): Boolean {
    val need = s.pendingDiscards[s.you.toString()] ?: 0
    if (s.subphase != "discard" || need == 0) return false
    val give = mutableMapOf<String, Int>(); var left = need
    for (k in com.hexlands.app.net.RESOURCES) { val n = minOf(left, s.hand(k)); if (n > 0) { give[k] = n; left -= n } }
    api.act(session, "discard") { put("res", kotlinx.serialization.json.buildJsonObject { give.forEach { (k, n) -> put(k, n) } }) }
    return true
}

private fun GameState.hand(k: String) = me?.res?.get(k) ?: 0

/** Waits for this player's next turn that starts after turn number [after] (and answers a discard if a bot's seven asks for one). */
suspend fun nextOwnTurn(api: HexApi, session: Session, w: Watcher, after: Int = 0): GameState {
    while (true) {
        val s = w.until(timeoutMs = 60_000, what = "my next turn (or a discard)") {
            (it.phase == "main" && it.turn == it.you && !it.rolled && it.subphase == null && it.turnNumber > after) || (it.subphase == "discard" && (it.pendingDiscards[it.you.toString()] ?: 0) > 0)
        }
        if (discardIfAsked(api, session, s)) { delay(100); continue }
        return s
    }
}

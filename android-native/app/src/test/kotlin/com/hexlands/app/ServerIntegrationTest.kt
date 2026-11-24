package com.hexlands.app

import com.hexlands.app.net.ApiException
import com.hexlands.app.net.Board
import com.hexlands.app.net.GameState
import com.hexlands.app.net.HexApi
import com.hexlands.app.net.RESOURCES
import com.hexlands.app.net.hand
import com.hexlands.app.net.Session
import com.hexlands.app.net.StreamEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.URL

/**
 * Plays against the real game server (the Node program in the repository root), through the same Kotlin API the app uses.
 * It starts `node server.js` on a free port with an in-memory database, so nothing is stored. Skipped when `node` is not installed.
 */
class ServerIntegrationTest {
    private lateinit var server: TestServer
    private lateinit var api: HexApi
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val pid = "a".repeat(32)

    @Before
    fun startServer() { server = TestServer.startOrSkip(); api = HexApi(server.base, pid) }

    @After
    fun stopServer() { scope.cancel(); if (::server.isInitialized) server.close() }

    @Test
    fun playsThroughSetupAndTheFirstTurnsAgainstBots() = runBlocking {
        val room = api.create("Kira", public = false)
        assertEquals(5, room.code.length)
        val session = Session(room.code, room.token)
        val w = Watcher(api, session, scope)

        val lobby = w.until(what = "the waiting room") { it.phase == "lobby" }
        assertEquals(1, lobby.players.size); assertEquals("Kira", lobby.players[0].name); assertTrue(lobby.players[0].host)
        val board = withTimeout(5_000) { w.board.first { it != null }!! }
        assertEquals(19, board.tiles.size); assertEquals(54, board.vertices.size); assertEquals(72, board.edges.size)
        assertTrue("every hex has six corners", board.tiles.all { it.vertices.size == 6 })
        assertTrue("a harbour list", board.ports.isNotEmpty())

        api.act(session, "fillBots") { put("level", "easy") }
        w.until(what = "bots to sit down") { it.players.size == 4 }
        api.act(session, "start")

        // Setup: the app asks the server where it may build (legal) and never has to know the rules.
        var placed = 0
        while (true) {
            val s = w.until(timeoutMs = 20_000, what = "my setup turn or the main game") { it.phase == "main" || (it.phase == "setup" && it.turn == it.you) }
            if (s.phase == "main") break
            val legal = s.legal!!
            if (s.setup!!.expect == "settlement") {
                assertTrue("settlement spots are offered", legal.settlements.isNotEmpty())
                api.act(session, "settle") { put("vertex", legal.settlements.first()) }
            } else {
                assertTrue("road spots are offered", legal.roads.isNotEmpty())
                api.act(session, "road") { put("edge", legal.roads.first()) }
            }
            placed++
            delay(30)   // let the next state arrive so the same turn is not answered twice
        }
        assertEquals("two settlements and two roads", 4, placed)

        // The main game: roll, deal with a seven if there is one, end the turn; a few times round. A bot's seven can ask me to discard at any time.
        suspend fun discardIfAsked(s: GameState): Boolean {
            val need = s.pendingDiscards[s.you.toString()] ?: 0
            if (s.subphase != "discard" || need == 0) return false
            val give = mutableMapOf<String, Int>(); var left = need
            for (k in RESOURCES) { val n = minOf(left, s.hand(k)); if (n > 0) { give[k] = n; left -= n } }
            api.act(session, "discard") { put("res", kotlinx.serialization.json.buildJsonObject { give.forEach { (k, n) -> put(k, n) } }) }
            return true
        }
        suspend fun myTurnToRoll(): GameState {
            while (true) {
                val s = w.until(timeoutMs = 30_000, what = "my turn to roll (or a discard)") {
                    (it.phase == "main" && it.turn == it.you && !it.rolled && it.subphase == null) || (it.subphase == "discard" && (it.pendingDiscards[it.you.toString()] ?: 0) > 0)
                }
                if (discardIfAsked(s)) { delay(100); continue }
                return s
            }
        }
        var turns = 0
        while (turns < 3) {
            myTurnToRoll()
            api.act(session, "roll")
            var s = w.until(what = "the roll") { it.rolled }
            assertNotNull(s.dice); assertEquals(2, s.dice!!.size)
            // a seven: everyone discards, then I move the robber (choosing whom to steal from if there is a choice)
            while (s.subphase != null) {
                if (!discardIfAsked(s) && s.subphase == "robber" && s.turn == s.you) {
                    val tile = s.robberOptions!!.first()
                    val victims = board.tiles[tile].vertices.mapNotNull { s.buildings[it.toString()]?.p }.filter { it != s.you }.distinct()
                    api.act(session, "robber") { put("tile", tile); if (victims.isNotEmpty()) put("victim", victims.first()) }
                }
                delay(100)
                val before = s
                s = w.until(what = "the seven to be settled") { it != before && it.rolled }
            }
            val turnBefore = s.turnNumber
            api.act(session, "endTurn")
            turns++
            w.until(what = "the turn to pass") { it.turnNumber > turnBefore }
        }
        assertTrue("the game moved on", w.state.value!!.turnNumber >= 4)
        Unit
    }

    @Test
    fun theServersReasonComesBackAsAnError() = runBlocking {
        val room = api.create("Kira", public = false)
        val session = Session(room.code, room.token)
        try { api.act(session, "roll"); fail("rolling in the waiting room must be refused") }
        catch (e: ApiException) { assertTrue(e.message!!.isNotBlank()); assertEquals(400, e.status) }
        try { api.join("ZZZZZ", "Ivo"); fail("an unknown room must be refused") }
        catch (e: ApiException) { assertTrue(e.message!!.contains("No room")) }
    }

    @Test
    fun aSpectatorSeesTheGameWithoutAHandAndLearnsWhenItEnds() = runBlocking {
        val room = api.create("Kira", public = false)
        val session = Session(room.code, room.token)
        val player = Watcher(api, session, scope)
        player.until { it.phase == "lobby" }
        try { api.watch(room.code); fail("nothing to watch in the waiting room") } catch (e: ApiException) { assertTrue(e.message!!.contains("not started")) }
        api.act(session, "fillBots") { put("level", "easy") }
        api.act(session, "start")
        val spec = api.watch(room.code)
        assertTrue(spec.spectator)
        val watcher = Watcher(api, Session(room.code, spec.token, spectator = true), scope)
        val s = watcher.until(what = "the spectator view") { it.spectator }
        assertEquals(-1, s.you); assertNull(s.me)
        assertTrue(s.players.all { it.res == null })
        // the only person leaves: the game ends and the spectator is told
        api.leave(session)
        withTimeout(10_000) { watcher.closed.first { it != null } }
        assertEquals("empty", watcher.closed.value)
    }

    @Test
    fun theRoomListParses() = runBlocking {
        val rooms = api.rooms()
        assertTrue(rooms.rooms.isEmpty() && rooms.live.isEmpty() || rooms.rooms.isNotEmpty() || rooms.live.isNotEmpty())
    }

    @Test
    fun everyMapOfTheWebGameCanBeChosenInTheWaitingRoom() = runBlocking {
        val list = api.maps().maps
        // the 15 countries and Classic, plus the special maps (Blue Flame Cup, Hidden Vault, Hay Hollows, US 2.0)
        val keys = list.map { it.key }.toSet()
        for (k in listOf("classic", "india", "usa", "uk", "australia", "japan", "italy", "brazil", "france", "spain", "germany", "china", "canada", "mexico", "argentina", "newzealand", "flamecup", "hiddenvault", "hayhollows", "us2")) {
            assertTrue("the server offers $k", k in keys)
        }
        assertEquals("every map has a name and a description", 0, list.count { it.name.isBlank() || it.blurb.isBlank() })
        assertEquals(setOf("countries", "misc"), list.map { it.category }.toSet())

        val room = api.create("Kira", public = false)
        val session = Session(room.code, room.token)
        val w = Watcher(api, session, scope)
        w.until(what = "the waiting room") { it.phase == "lobby" }
        for (m in list) {
            api.act(session, "setMap") { put("preset", m.key) }
            val board = withTimeout(15_000) { w.board.first { it != null && it.key == m.key }!! }
            assertTrue("${m.key} has land", board.tiles.isNotEmpty() && board.vertices.isNotEmpty() && board.edges.isNotEmpty())
            assertEquals(m.name, board.name)
        }
    }

    @Test
    fun theHostSetsTheGameRulesAndPicksTheExactPreviewedMap() = runBlocking {
        val room = api.create("Kira", public = false)
        val session = Session(room.code, room.token)
        val w = Watcher(api, session, scope)
        w.until(what = "the waiting room") { it.phase == "lobby" }

        // the rules: same options and limits as the web game
        api.act(session, "setOptions") { putJsonObject("opts") { put("vpTarget", 12) } }
        api.act(session, "setOptions") { putJsonObject("opts") { put("discardLimit", 9) } }
        api.act(session, "setOptions") { putJsonObject("opts") { put("discardMode", "four") } }
        api.act(session, "setOptions") { putJsonObject("opts") { put("timer", 30) } }
        api.act(session, "setOptions") { putJsonObject("opts") { put("friendlyRobber", true) } }
        api.act(session, "setOptions") { putJsonObject("opts") { put("balancedDice", true) } }
        val s = w.until(what = "the new rules") { it.vpTarget == 12 && it.opts.balancedDice }
        assertEquals(9, s.opts.discardLimit); assertEquals("four", s.opts.discardMode); assertEquals(30, s.opts.timer); assertTrue(s.opts.friendlyRobber)
        try { api.act(session, "setOptions") { putJsonObject("opts") { put("timer", 20) } }; fail("20 seconds is not a timer setting") } catch (e: ApiException) { assertTrue(e.message!!.contains("timer")) }

        // the preview of a map is the map the room gets
        val pv = api.preview("japan")
        api.act(session, "setMap") { put("preset", "japan"); put("seed", pv.seed) }
        val board = withTimeout(15_000) { w.board.first { it != null && it.key == "japan" }!! }
        assertEquals(pv.board.tiles.map { it.terrain to it.number }, board.tiles.map { it.terrain to it.number })
        assertEquals(pv.board.ports, board.ports)
    }
}

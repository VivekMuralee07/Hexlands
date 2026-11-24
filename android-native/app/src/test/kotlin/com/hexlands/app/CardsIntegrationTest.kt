package com.hexlands.app

import com.hexlands.app.net.ApiException
import com.hexlands.app.net.HexApi
import com.hexlands.app.net.Session
import com.hexlands.app.net.hand
import com.hexlands.app.net.myPlayer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/** The Heist card and the diamond, played end to end against the real server (with a few rigged situations from test-server.js). */
class CardsIntegrationTest {
    private lateinit var server: TestServer
    private lateinit var api: HexApi
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Before fun start() { server = TestServer.startOrSkip(); api = HexApi(server.base, "b".repeat(32)) }
    @After fun stop() { scope.cancel(); if (::server.isInitialized) server.close() }

    private fun rig(path: String, code: String, build: JsonObjectBuilder.() -> Unit) = server.force(path, buildJsonObject { put("code", code); build() })

    /** A game against three bots, played through setup. */
    private suspend fun mainGame(): Pair<Session, Watcher> {
        val room = api.create("Kira", public = false)
        val session = Session(room.code, room.token)
        val w = Watcher(api, session, scope)
        w.until { it.phase == "lobby" }
        api.act(session, "fillBots") { put("level", "easy") }
        w.until(what = "the bots") { it.players.size == 4 }
        api.act(session, "start")
        playSetup(api, session, w)
        return session to w
    }

    @Test fun theHeistCardIsBoughtAfterThreeCitiesAndStealsASettlementNextTurn() = runBlocking {
        val (session, w) = mainGame()
        var s = nextOwnTurn(api, session, w)
        val me = s.you
        assertEquals("the server tells the app what the card needs", 3, s.heist!!.need)
        assertTrue("two settlements, no cities yet", s.myPlayer()!!.pieces.city == 4)

        // not before three cities
        rig("dice", session.code) { put("dice", buildJsonArray { add(buildJsonArray { add(2); add(4) }) }) }   // a six: no robber
        api.act(session, "roll"); s = w.until(what = "the roll") { it.rolled }
        rig("grant", session.code) { put("seat", me); putJsonObject("res") { put("wood", 1); put("brick", 1); put("sheep", 2); put("wheat", 1); put("ore", 1) } }
        try { api.act(session, "buyHeist"); fail("three cities are needed first") } catch (e: ApiException) { assertTrue(e.message!!, e.message!!.contains("3 cities")) }

        rig("pieces", session.code) { put("seat", me); putJsonObject("pieces") { put("city", 1) } }   // as if three cities were built
        api.act(session, "buyHeist")
        s = w.until(what = "the card in hand") { it.me?.heistBought == true }
        assertTrue(s.me!!.dev.any { it.type == "heist" && it.fresh })
        val target = s.buildings.entries.first { it.value.p != me && it.value.type == "settlement" }.key.toInt()
        try { api.act(session, "playDev") { put("card", "heist"); put("vertex", target) }; fail("not the turn it was bought") }
        catch (e: ApiException) { assertTrue(e.message!!, e.message!!.contains("next turn")) }
        try { api.act(session, "buyHeist"); fail("only one per game") } catch (e: ApiException) { assertTrue(e.message!!.contains("one Heist")) }

        api.act(session, "endTurn")
        s = nextOwnTurn(api, session, w, after = s.turnNumber)
        assertTrue("the card is ready now", s.me!!.dev.any { it.type == "heist" && !it.fresh })
        api.act(session, "playDev") { put("card", "heist"); put("vertex", target) }
        s = w.until(what = "the settlement to change hands") { it.buildings[target.toString()]?.p == me }
        assertTrue("the card is used up", s.me!!.dev.none { it.type == "heist" })
        assertTrue(s.devPlayed)
    }

    @Test fun theDiamondOpensAndThePlayerChoosesCardsFromTheBank() = runBlocking {
        val (session, w) = mainGame()
        val s0 = w.until(what = "the main game") { it.phase == "main" }
        val me = s0.you
        rig("diamond", session.code) { put("seat", me); put("count", 3) }
        api.act(session, "chat") { put("text", "hello") }   // any action sends the new state
        var s = w.until(what = "the diamond") { it.subphase == "diamond" && (it.pendingDiamond[it.you.toString()] ?: 0) == 3 }
        assertEquals(3, s.pendingDiamond[me.toString()])
        try { api.act(session, "diamond") { put("res", buildJsonArray { add("wood") }) }; fail("three cards are owed") }
        catch (e: ApiException) { assertTrue(e.message!!, e.message!!.contains("Pick 3")) }
        val before = s.hand("wood") + s.hand("ore")
        api.act(session, "diamond") { put("res", buildJsonArray { add("wood"); add("wood"); add("ore") }) }
        s = w.until(what = "the diamond to close") { it.subphase == null }
        assertEquals("three more cards", before + 3, s.hand("wood") + s.hand("ore"))
        assertNull(s.pendingDiamond[me.toString()])
    }
}

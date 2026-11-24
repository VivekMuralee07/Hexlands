package com.hexlands.app

import com.hexlands.app.net.Board
import com.hexlands.app.net.Building
import com.hexlands.app.net.GameState
import com.hexlands.app.net.HexJson
import com.hexlands.app.net.LastRoll
import com.hexlands.app.ui.gainFlights
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Which cards fly after a roll, and from which tile: the same rule as the web game's flyGains. */
class GainFlightsTest {
    private fun text(name: String) = checkNotNull(javaClass.getResourceAsStream("/fixtures/$name.json")).bufferedReader().readText()
    private val board = HexJson.decodeFromString(Board.serializer(), text("board"))
    private val base = HexJson.decodeFromString(GameState.serializer(), text("lobby"))
    // a forest tile with a number, a corner of it, and the dice that make that number
    private val forest = board.tiles.first { it.terrain == "forest" && it.number != null && it.number != 7 }
    private val n = forest.number!!
    private val dice = if (n <= 7) listOf(1, n - 1) else listOf(6, n - 6)
    private fun game(gains: List<Map<String, Int>?>, robber: Int = -1, sum: List<Int> = dice) = base.copy(
        buildings = mapOf(forest.vertices[0].toString() to Building(p = 0, type = "settlement")),
        lastRoll = LastRoll(sum, gains, seq = 1), robber = robber,
    )

    @Test fun eachCardStartsOnTheTilePaidFromAndEndsAtThePlayer() {
        val f = gainFlights(board, game(listOf(mapOf("wood" to 2))))
        assertEquals(2, f.size)
        assertTrue(f.all { it.res == "wood" && it.player == 0 && it.tile == forest.id })
        assertTrue("the cards set off one after another, after the dice", f[0].delayMs > 0 && f[1].delayMs > f[0].delayMs)
    }

    @Test fun aSevenPaysNothing() {
        assertTrue(gainFlights(board, game(listOf(mapOf("wood" to 2)), sum = listOf(3, 4))).isEmpty())
    }

    @Test fun aTileWithTheRobberOnItPaysNothingFromThere() {
        val f = gainFlights(board, game(listOf(mapOf("wood" to 1)), robber = forest.id))
        assertEquals(1, f.size); assertNull("the source cannot be told, so the card starts in the middle", f[0].tile)
    }

    @Test fun noMoreThanSixOfAKindAndTwentyFourInAll() {
        val f = gainFlights(board, game(listOf(mapOf("wood" to 9)))) 
        assertEquals(6, f.size)
        val many = gainFlights(board, game(List(4) { mapOf("wood" to 6, "brick" to 6, "sheep" to 6) }))
        assertTrue(many.size <= 24)
    }
}

package com.hexlands.app

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.hexlands.app.net.Board
import com.hexlands.app.net.GameState
import com.hexlands.app.net.HexJson
import com.hexlands.app.ui.BoardCanvas
import com.hexlands.app.ui.HexlandsTheme
import org.junit.Assert.assertTrue
import com.hexlands.app.ui.Tap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.math.min

/** A finger on a glowing spot must pick that spot, and a finger on empty sea must pick nothing. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class BoardTapTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    private fun text(name: String) = checkNotNull(javaClass.getResourceAsStream("/fixtures/$name.json")).bufferedReader().readText()
    private val board = HexJson.decodeFromString(Board.serializer(), text("board"))
    private fun state(name: String) = HexJson.decodeFromString(GameState.serializer(), text(name))

    // The canvas is 300 x 500 dp at 3x: 900 x 1500 px. The board is fitted to it with the same maths as BoardCanvas.
    private val w = 900f
    private val h = 1500f
    private val xs = board.vertices.map { it.x } + board.ports.map { it.x }
    private val ys = board.vertices.map { it.y } + board.ports.map { it.y }
    private val minX = xs.min() - 0.9; private val maxX = xs.max() + 0.9
    private val minY = ys.min() - 0.9; private val maxY = ys.max() + 0.9
    private val k = min(w / (maxX - minX).toFloat(), h / (maxY - minY).toFloat())
    private fun px(x: Double, y: Double) = Offset(w / 2 + ((x - (minX + maxX) / 2) * k).toFloat(), h / 2 + ((y - (minY + maxY) / 2) * k).toFloat())

    private var tapped: Tap? = null

    private fun show(g: GameState, corners: Set<Int>, roads: Set<Int>, hexes: Set<Int>) {
        tapped = null
        rule.setContent {
            HexlandsTheme { Box(Modifier.size(300.dp, 500.dp)) { BoardCanvas(board, g, corners, roads, hexes, null, { tapped = it }, animate = false) } }
        }
        rule.waitForIdle()
    }

    private fun tapAt(o: Offset) { rule.onRoot().performTouchInput { click(o) }; rule.waitForIdle() }

    @Test fun aCornerIsPickedWhereYouTouchIt() {
        val g = state("setup")
        val spots = g.legal!!.settlements
        show(g, spots.toSet(), emptySet(), emptySet())
        for (id in listOf(spots.first(), spots[spots.size / 2], spots.last())) {
            val v = board.vertices[id]
            tapAt(px(v.x, v.y) + Offset(4f, -3f))   // a little off-centre, like a finger
            assertEquals(Tap.Corner(id), tapped)
            tapped = null
        }
    }

    @Test fun aRoadIsPickedWhereYouTouchItsMiddle() {
        val g = state("main")
        val roads = g.legal!!.roads
        show(g, emptySet(), roads.toSet(), emptySet())
        val id = roads.first(); val e = board.edges[id]
        val a = board.vertices[e.v[0]]; val b = board.vertices[e.v[1]]
        tapAt(px((a.x + b.x) / 2, (a.y + b.y) / 2))
        assertEquals(Tap.Road(id), tapped)
    }

    @Test fun aHexIsPickedForTheRobber() {
        val g = state("main")
        val hex = board.tiles[5]
        show(g, emptySet(), emptySet(), setOf(5, 6))
        tapAt(px(hex.x, hex.y))
        assertEquals(Tap.Hex(5), tapped)
    }

    @Test fun emptySeaAndSpotsThatAreNotLegalPickNothing() {
        val g = state("setup")
        val legal = g.legal!!.settlements.toSet()
        show(g, legal, emptySet(), emptySet())
        tapAt(Offset(20f, 20f))   // a corner of the sea
        assertNull(tapped)
        val notLegal = board.vertices.first { it.id !in legal }   // a corner next to a settlement is not offered
        tapAt(px(notLegal.x, notLegal.y))
        assertNull("a corner that is not glowing cannot be picked", tapped)
    }
}

/** The whole two-tap flow on the real game screen: a first tap shows the preview and its hint, a second tap on the same spot places it. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class TwoTapPlacementTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()
    private fun text(name: String) = checkNotNull(javaClass.getResourceAsStream("/fixtures/$name.json")).bufferedReader().readText()
    private val board = HexJson.decodeFromString(Board.serializer(), text("board"))

    @Test fun tappingASpotTwiceGoesThroughPreviewThenPlace() {
        val g = HexJson.decodeFromString(GameState.serializer(), text("setup"))
        val ui = UiState(session = com.hexlands.app.net.Session("K7QXM", "t", false), board = board, game = g)
        val vm = GameViewModel(androidx.test.core.app.ApplicationProvider.getApplicationContext())
        rule.setContent { androidx.compose.runtime.CompositionLocalProvider(com.hexlands.app.ui.LocalAnimate provides false) { HexlandsTheme { com.hexlands.app.ui.GameScreen(ui, g, vm, animate = false) } } }
        rule.waitForIdle()
        val node = rule.onNodeWithTag("board")
        val size = node.fetchSemanticsNode().size
        val xs = board.vertices.map { it.x } + board.ports.map { it.x }; val ys = board.vertices.map { it.y } + board.ports.map { it.y }
        val minX = xs.min() - 0.9; val maxX = xs.max() + 0.9; val minY = ys.min() - 0.9; val maxY = ys.max() + 0.9
        val k = min(size.width / (maxX - minX).toFloat(), size.height / (maxY - minY).toFloat())
        val v = board.vertices[g.legal!!.settlements.first()]
        val at = Offset(size.width / 2f + ((v.x - (minX + maxX) / 2) * k).toFloat(), size.height / 2f + ((v.y - (minY + maxY) / 2) * k).toFloat())

        node.performTouchInput { click(at) }; rule.waitForIdle()
        rule.onNodeWithText("Tap it again to build a settlement").assertExists()
        node.performTouchInput { click(at) }; rule.waitForIdle()
        rule.onNodeWithText("Tap it again to build a settlement").assertDoesNotExist()
    }
}

/** Draws the board of every map the web game has (Classic, the countries, the special maps) and keeps a picture of each in app/build/screens/maps/. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class AllMapsTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()
    private fun text(name: String) = checkNotNull(javaClass.getResourceAsStream("/fixtures/$name.json")) { "run tools/make-fixtures.js" }.bufferedReader().readText()

    @Test fun everyMapDrawsAndIsFitToTheScreen() {
        val keys = HexJson.decodeFromString(com.hexlands.app.net.MapsReply.serializer(), text("maps")).maps.map { it.key }
        assertTrue("all maps are there", keys.size >= 19)
        val game = HexJson.decodeFromString(GameState.serializer(), text("lobby"))   // no pieces on the board, so any map can be shown with it
        var board by androidx.compose.runtime.mutableStateOf(HexJson.decodeFromString(Board.serializer(), text("map_${keys.first()}")))
        rule.setContent {
            androidx.compose.runtime.CompositionLocalProvider(com.hexlands.app.ui.LocalAnimate provides false) {
                HexlandsTheme { Box(Modifier.size(411.dp, 700.dp)) { BoardCanvas(board, game, emptySet(), emptySet(), emptySet(), null, {}, animate = false) } }
            }
        }
        val dir = java.io.File("build/screens/maps").also { it.mkdirs() }
        for (k in keys) {
            board = HexJson.decodeFromString(Board.serializer(), text("map_$k"))
            rule.waitForIdle()
            assertTrue("$k has land", board.tiles.any { it.terrain != "fog" })
            val view = rule.activity.window.decorView
            val bmp = android.graphics.Bitmap.createBitmap(view.width, view.height, android.graphics.Bitmap.Config.ARGB_8888)
            view.draw(android.graphics.Canvas(bmp))
            java.io.File(dir, "$k.png").outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 90, it) }
        }
    }
}

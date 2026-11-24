package com.hexlands.app

import android.app.Application
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import com.hexlands.app.net.Board
import com.hexlands.app.net.GameState
import com.hexlands.app.net.HexJson
import com.hexlands.app.net.Session
import com.hexlands.app.ui.BoardCanvas
import com.hexlands.app.ui.DiamondBody
import com.hexlands.app.ui.GameScreen
import com.hexlands.app.ui.Tap
import com.hexlands.app.ui.HexlandsTheme
import com.hexlands.app.ui.HomeScreen
import com.hexlands.app.ui.LobbyScreen
import com.hexlands.app.ui.Navy
import com.hexlands.app.ui.ResultsBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * Draws the real screens on the JVM (Robolectric, no phone needed) from real game data written by tools/make-fixtures.js, and saves
 * a picture of each in app/build/screens/. Open them to see what a player sees. The test also checks that nothing crashes while drawing.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class ScreenshotTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    private val app: Application get() = ApplicationProvider.getApplicationContext()
    private fun text(name: String) = checkNotNull(javaClass.getResourceAsStream("/fixtures/$name.json")) { "run tools/make-fixtures.js" }.bufferedReader().readText()
    private fun state(name: String) = HexJson.decodeFromString(GameState.serializer(), text(name))
    private val board get() = HexJson.decodeFromString(Board.serializer(), text("board"))

    private fun shot(name: String, content: @Composable () -> Unit) {
        rule.setContent { androidx.compose.runtime.CompositionLocalProvider(com.hexlands.app.ui.LocalAnimate provides false) { HexlandsTheme { Box(Modifier.fillMaxSize().background(Navy)) { content() } } } }
        rule.waitForIdle()
        // Draw the activity's window onto a bitmap (Robolectric has real graphics, so this is what a phone would show).
        val view = rule.activity.window.decorView
        val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bmp))
        assertTrue("drawn at phone size", bmp.width > 800 && bmp.height > 1600)
        val dir = File("build/screens").also { it.mkdirs() }
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun ui(game: GameState, spectator: Boolean = false, board: Board = this.board) =
        UiState(session = Session("K7QXM", "t", spectator), board = board, game = game)

    @Test fun home() = shot("home") { HomeScreen(UiState(), GameViewModel(app)) }

    @Test fun lobby() = shot("lobby") { LobbyScreen(state("lobby"), GameViewModel(app)) }

    @Test fun setupFirstSettlement() {
        val g = state("setup")
        assertEquals("the server offers corners", true, g.legal!!.settlements.size > 20)
        shot("setup") { GameScreen(ui(g), g, GameViewModel(app), animate = false) }
    }

    @Test fun mainGameMyTurn() {
        val g = state("main")
        assertEquals("setup is over", "main", g.phase)
        shot("main") { GameScreen(ui(g), g, GameViewModel(app), animate = false) }
    }

    @Test fun resultsAtTheEnd() {
        val base = state("ended")
        val points = listOf(10, 6, 7, 5)   // the fixture game is only a few turns old: give the finished game believable scores
        val g = base.copy(players = base.players.mapIndexed { i, p -> p.copy(vp = points[i]) }, turnNumber = 87)
        shot("ended") { ResultsBody(g, spectating = false) }
    }

    @Test fun spectatorView() {
        val g = state("spectator")
        shot("spectator") { GameScreen(ui(g, spectator = true), g, GameViewModel(app), animate = false) }
    }

    @Test fun hiddenVaultWithTheDiamondAndTheBlueFlameCup() {
        val b = HexJson.decodeFromString(Board.serializer(), text("board_vault"))
        val g = state("vault")
        assertTrue("the diamond and the cup are uncovered", b.tiles.any { it.terrain == "diamond" } && b.tiles.any { it.terrain == "goblet" } && b.tiles.any { it.terrain == "fog" })
        shot("vault") { GameScreen(ui(g, board = b), g, GameViewModel(app), animate = false) }
    }

    @Test fun theDiamondPicker() {
        val g = state("diamond")
        shot("diamond") { DiamondBody(g, 3, listOf("wood", "ore"), {}, {}) }
    }

    @Test fun heistTargetsGlowOnOpponentSettlements() {
        val g = state("heist")
        val targets = g.buildings.filter { (_, b) -> b.p != g.you && b.type == "settlement" }.keys.map { it.toInt() }.toSet()
        assertTrue("opponents have settlements", targets.size >= 3)
        shot("heist") { BoardCanvas(board, g, targets, emptySet(), emptySet(), Tap.Corner(targets.first()), {}, animate = false) }
    }

    @Test fun aTappedSpotShowsTheSmallPieceYouWouldPlace() {
        val g = state("setup")
        val spot = g.legal!!.settlements.first()
        shot("preview") { BoardCanvas(board, g, g.legal!!.settlements.toSet(), emptySet(), emptySet(), Tap.Corner(spot), {}, animate = false, previewKind = "settlement") }
    }

    @Test fun theTradePanelShowsWhatYouWantWhatYouGiveAndTheBankRates() {
        val g = state("main")
        shot("trade") { GameScreen(ui(g), g, GameViewModel(app), animate = false, tradeOpenAtStart = true) }
        rule.onNodeWithText("Tap what you want above").assertExists()
        rule.onNodeWithText("Pick what you want, then what you give.").assertExists()
    }

    @Test fun theBuyCardButtonAppearsWhenYouCanPayForIt() {
        val rich = state("main")   // 3 wood, 3 brick, 2 sheep, 3 wheat, 3 ore: a development card is affordable
        shot("buy-yes") { GameScreen(ui(rich), rich, GameViewModel(app), animate = false) }
        rule.onNodeWithText("Buy card").assertExists()
    }

    @Test fun noBuyButtonsWithoutTheCards() {
        val rich = state("main")
        val poor = rich.copy(me = rich.me!!.copy(res = emptyMap()))
        shot("buy-no") { GameScreen(ui(poor), poor, GameViewModel(app), animate = false) }
        rule.onNodeWithText("Buy card").assertDoesNotExist()
        rule.onNodeWithText("Buy Heist card").assertDoesNotExist()
    }
}

package com.hexlands.app

import android.app.Application
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.hexlands.app.net.Board
import com.hexlands.app.net.GameState
import com.hexlands.app.net.HexJson
import com.hexlands.app.net.Session
import com.hexlands.app.ui.BoardCanvas
import com.hexlands.app.ui.DiamondBody
import com.hexlands.app.ui.GameOptions
import com.hexlands.app.ui.GameScreen
import com.hexlands.app.ui.Tap
import com.hexlands.app.ui.HexlandsTheme
import com.hexlands.app.ui.HomeScreen
import com.hexlands.app.ui.LeaderboardScreen
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

    @Test fun home() {
        shot("home") { HomeScreen(UiState(), GameViewModel(app)) }
        rule.onNodeWithContentDescription("How to play: tutorial and rules").assertExists()
        rule.onNodeWithContentDescription("Sound effects on").assertExists()
        rule.onNodeWithContentDescription("Music on").assertExists()
    }

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

    @Test fun theBuyOptionAppearsInTheTradePanelWhenYouCanPayForIt() {
        val rich = state("main")   // 3 wood, 3 brick, 2 sheep, 3 wheat, 3 ore: a development card is affordable
        shot("buy-yes") { GameScreen(ui(rich), rich, GameViewModel(app), animate = false, tradeOpenAtStart = true) }
        rule.onNodeWithText("Development card").assertExists()
    }

    @Test fun noBuyOptionWithoutTheCards() {
        val rich = state("main")
        val poor = rich.copy(me = rich.me!!.copy(res = emptyMap()))
        shot("buy-no") { GameScreen(ui(poor), poor, GameViewModel(app), animate = false, tradeOpenAtStart = true) }
        rule.onNodeWithText("Development card").assertDoesNotExist()
        rule.onNodeWithText("Heist card").assertDoesNotExist()
    }

    @Test fun thereIsNoBuyButtonOutsideTheTradePanel() {
        val rich = state("main")
        shot("main-no-buy") { GameScreen(ui(rich), rich, GameViewModel(app), animate = false) }
        rule.onNodeWithText("Buy card").assertDoesNotExist()
        rule.onNodeWithContentDescription("End your turn").assertExists()
    }

    @Test fun theMoveTimerShowsTheTimeLeftAndWhoseStepItIs() {
        val g = state("main").copy(timer = com.hexlands.app.net.TimerView(setting = 30, limit = 30, left = 20000.0))
        shot("clock") { GameScreen(ui(g), g, GameViewModel(app), animate = false) }
        rule.onAllNodesWithText("0:20").onFirst().assertExists()
        rule.onNodeWithText("You").assertExists()
    }

    @Test fun noClockWhenTheTimerIsOff() {
        val g = state("main")
        shot("no-clock") { GameScreen(ui(g), g, GameViewModel(app), animate = false) }
        rule.onNodeWithContentDescription("20 seconds left for You").assertDoesNotExist()
    }

    @Test fun aBotPlayingYourSeatOffersToGiveItBack() {
        val g0 = state("main")
        val g = g0.copy(players = g0.players.mapIndexed { i, p -> if (i == g0.you) p.copy(takenOver = "idle") else p })
        shot("away") { GameScreen(ui(g), g, GameViewModel(app), animate = false) }
        rule.onNodeWithText("Take back control").assertExists()
        rule.onNodeWithText("A bot is playing for you because you were away.").assertExists()
    }

    @Test fun theWaitingRoomShowsTheGameRules() {
        val g = state("lobby")
        shot("lobby-rules") { GameOptions(g, host = true, vm = GameViewModel(app)) }
        rule.onNodeWithText("Points to win").assertExists()
        rule.onNodeWithText("Move timer").assertExists()
        rule.onNodeWithText("Friendly robber").assertExists()
        rule.onNodeWithText("Balanced dice").assertExists()
    }

    @Test fun theMapWindowListsEveryMapWithAPreview() {
        val maps = HexJson.decodeFromString(com.hexlands.app.net.MapsReply.serializer(), text("maps")).maps
        val previews = maps.associate { it.key to com.hexlands.app.net.PreviewReply(5, HexJson.decodeFromString(Board.serializer(), text("map_${it.key}"))) }
        shot("map-chooser") { com.hexlands.app.ui.MapChooser(maps, "china", previews, onWant = {}, onUse = { _, _ -> }, modifier = androidx.compose.ui.Modifier.padding(12.dp)) }
        rule.onNodeWithText("Countries (15)").assertExists()
        rule.onNodeWithText("China").assertExists()
        rule.onNodeWithText("Draw this map again").assertExists()   // China is the map in use
    }

    @Test fun settlementsAndCitiesAreDrawnAsSolidPieces() {
        val g0 = state("main")
        // every other building becomes a city, so the picture shows both pieces for each player colour
        val g = g0.copy(buildings = g0.buildings.entries.mapIndexed { i, (k, b) -> k to (if (i % 2 == 0) b.copy(type = "city") else b) }.toMap())
        assertTrue("both kinds are there", g.buildings.values.any { it.type == "city" } && g.buildings.values.any { it.type == "settlement" })
        shot("pieces") { BoardCanvas(board, g, emptySet(), emptySet(), emptySet(), null, {}, animate = false) }
    }

    @Test fun aSevenMakesYouPickCardsFromYourHandWithNoWindow() {
        val g0 = state("main")   // 14 cards in hand
        val g = g0.copy(rolled = true, subphase = "discard", pendingDiscards = mapOf(g0.you.toString() to 7))
        shot("discard") { GameScreen(ui(g), g, GameViewModel(app), animate = false) }
        rule.onNodeWithText("The robber strikes!").assertExists()
        rule.onNodeWithText("0 of 7").assertExists()
        rule.onAllNodes(androidx.compose.ui.test.hasContentDescription("Wood", substring = true)).onFirst().performClick()   // tap the Wood card in the hand
        rule.waitForIdle()
        rule.onNodeWithText("1 of 7").assertExists()
        rule.onNodeWithContentDescription("Discard the picked cards").assertExists()
    }

    @Test fun theInfoWindowHasTheFullRulesCostsPointsAndSettings() {
        val g = state("main")
        shot("info") { com.hexlands.app.ui.InfoDialog(g, onClose = {}, onTutorial = {}) }
        rule.onNodeWithText("▶ Watch the animated tutorial").assertExists()
        rule.onNodeWithText("Goal").assertExists()
        rule.onNodeWithText("Costs").performClick(); rule.waitForIdle()
        rule.onNodeWithText("Heist card").assertExists()
        rule.onNodeWithText("Points").performClick(); rule.waitForIdle()
        rule.onNodeWithText("Longest Road").assertExists()
        rule.onNodeWithText("This game").performClick(); rule.waitForIdle()
        rule.onNodeWithText("Points to win: ${g.vpTarget}").assertExists()
    }

    @Test fun theRulesTextShowsTheResourcesAsPictures() {
        shot("rules") { androidx.compose.foundation.layout.Box(androidx.compose.ui.Modifier.padding(12.dp)) { com.hexlands.app.ui.RulesText() } }
        rule.onNodeWithText("Rolling a 7").assertExists()
        rule.onNodeWithText("Desert makes nothing.").assertExists()
    }

    private val lbSample = com.hexlands.app.net.LbReply(
        enabled = true, mode = "all", sort = "wins", total = 5, minGames = 3,
        rows = listOf(
            com.hexlands.app.net.LbRow(rank = 1, name = "Aarav", wins = 14, losses = 6, games = 20, winRate = 70, avgVp = 8.4, bestVp = 12, form = listOf(1, 1, 1, 0, 1), streak = 3, lastPlayed = System.currentTimeMillis() - 3 * 3600_000L, favMap = "India"),
            com.hexlands.app.net.LbRow(rank = 2, name = "Meera", wins = 9, losses = 9, games = 18, winRate = 50, avgVp = 7.1, bestVp = 11, form = listOf(0, 1, 0, 0, 1), streak = 0, lastPlayed = System.currentTimeMillis() - 26 * 3600_000L, favMap = "Classic Island"),
            com.hexlands.app.net.LbRow(rank = 3, name = "Vivek", wins = 7, losses = 8, games = 15, winRate = 47, avgVp = 6.9, bestVp = 10, form = listOf(1, 0), streak = 1, you = true, lastPlayed = System.currentTimeMillis() - 600_000L, favMap = "China"),
        ),
        summary = com.hexlands.app.net.LbSummary(games = 31, players = 5, avgTurns = 74, topMap = "Classic Island"),
        bots = com.hexlands.app.net.LbBots(games = 12, botWins = 5, levels = listOf(
            com.hexlands.app.net.LbBotLevel("easy", 6, 1, 5, 17, 5.2, 8), com.hexlands.app.net.LbBotLevel("medium", 4, 2, 2, 50, 7.0, 10), com.hexlands.app.net.LbBotLevel("hard", 2, 2, 0, 100, 10.0, 11))),
    )

    @Test fun theLeaderboardShowsStandingRankedPlayersAndBots() {
        shot("leaderboard") { LeaderboardScreen(UiState(lb = lbSample, lbMode = "all"), GameViewModel(app), onBack = {}, onRecent = {}) }
        rule.onNodeWithText("Leaderboard").assertExists()
        rule.onNodeWithText("Rank #3 of 5").assertExists()
        rule.onNodeWithText("Aarav").assertExists()
        rule.onNodeWithText("Bots").assertExists()
        rule.onNodeWithText("Rank and player").assertExists()
    }

    @Test fun myRecentGamesListsTheLastGames() {
        val now = System.currentTimeMillis()
        val r = com.hexlands.app.net.RecentReply(true, listOf(
            com.hexlands.app.net.RecentGame(id = 2, at = now - 3600_000L, map = "India", turns = 61, target = 10, seats = 4, humans = 2, ranked = true, vp = 10, won = true),
            com.hexlands.app.net.RecentGame(id = 1, at = now - 90_000_000L, map = "Classic Island", turns = 80, target = 10, seats = 4, humans = 1, vp = 7, won = false, winner = com.hexlands.app.net.RecentWinner("A bot", 10, "hard")),
        ))
        shot("recent") { com.hexlands.app.ui.RecentGamesScreen(UiState(recent = r), GameViewModel(app), onBack = {}) }
        rule.onNodeWithText("Won · 10 of 10 points").assertExists()
        rule.onNodeWithText("Hard bot won with 10").assertExists()
    }

    @Test fun whereTheRobberMayGoIsShownByGlowingCirclesInsideThoseHexes() {
        val g0 = state("main")
        val spots = board.tiles.filter { it.terrain != "desert" && it.id != g0.robber }.map { it.id }
        val g = g0.copy(rolled = true, subphase = "robber", robberOptions = spots, dice = listOf(3, 4))
        shot("robber") { GameScreen(ui(g), g, GameViewModel(app), animate = false) }
        rule.onNodeWithText("Move the robber: tap a glowing circle").assertExists()
    }

    @Test fun cardsFlyFromTheTilesToThePlayersAndThenAreGone() {
        rule.mainClock.autoAdvance = false
        val flights = listOf(
            com.hexlands.app.ui.GainFlight("wood", 0, 3, delayMs = 0), com.hexlands.app.ui.GainFlight("ore", 0, 5, delayMs = 400),
        )
        rule.setContent {
            HexlandsTheme { Box(Modifier.fillMaxSize().background(Navy)) {
                com.hexlands.app.ui.GainFlights(flights, from = { androidx.compose.ui.geometry.Offset(300f, 1200f) }, to = { androidx.compose.ui.geometry.Offset(300f, 100f) })
            } }
        }
        rule.mainClock.advanceTimeBy(1_000)          // mid-flight: the first card is on its way, the second has just started
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Wood").assertExists()
        rule.mainClock.advanceTimeBy(3_000)          // all landed
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Wood").assertDoesNotExist()
    }

    @Test fun aMessageSaysTheRobberStrikesWhenA7IsRolled() {
        val g = state("main").copy(dice = listOf(3, 4))
        shot("strike") { GameScreen(ui(g), g, GameViewModel(app), animate = false, strikeAtStart = true) }
        rule.onNodeWithText("The robber strikes!").assertExists()
        rule.onNodeWithText("A 7 was rolled: nobody collects.").assertExists()
    }

    @Test fun howToPlayHasTheAnimatedTutorialAndTheRulesInWords() {
        val record = com.hexlands.app.tutorial.TutorialRecord.parse(File("src/main/assets/tutorial.json").readText())
        shot("howto") { com.hexlands.app.ui.HowToPlayScreen(record, onClose = {}) }
        rule.onNodeWithText("Watch the tutorial").assertExists()
        rule.onNodeWithText("Hexlands is played on an island of hex tiles. Each tile produces one resource.").assertExists()   // the first caption of the tutorial
        rule.onNodeWithText("Read the rules").performClick(); rule.waitForIdle()
        rule.onNodeWithText("Goal").assertExists()
        rule.onNodeWithText("Setup").assertExists()
    }
}

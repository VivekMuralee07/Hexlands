package com.hexlands.app

import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.hexlands.app.tutorial.TutorialRecord
import com.hexlands.app.tutorial.buildChapters
import com.hexlands.app.ui.HexlandsTheme
import com.hexlands.app.ui.LocalAnimate
import com.hexlands.app.ui.Navy
import com.hexlands.app.ui.TutorialScreen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

private fun loadRecord() = TutorialRecord.parse(File("src/main/assets/tutorial.json").readText())

/** The tutorial is the web game's tutorial: same recording, same chapters, same captions. No Android needed to check that. */
class TutorialScriptTest {
    @Test fun theRecordedGameAndTheChaptersAreThere() {
        val r = loadRecord()
        assertEquals(3, r.players.size); assertTrue(r.board.tiles.size >= 19)
        val chapters = buildChapters(r)
        assertEquals("15 chapters, like the web tutorial", 15, chapters.size)
        for (c in chapters) {
            assertTrue("${c.title} has steps", c.steps.isNotEmpty())
            for (s in c.steps) {
                assertTrue("a caption in ${c.title}", s.caption.isNotBlank()); assertTrue("frames in ${c.title}", s.frames.isNotEmpty()); assertTrue(s.durMs > 0)
                assertEquals("frames are in time order", s.frames.map { it.atMs }, s.frames.map { it.atMs }.sorted())
                for (f in s.frames) {
                    val sc = f.scene
                    (sc.glowTiles + sc.flights.mapNotNull { (it.from as? com.hexlands.app.tutorial.Anchor.Tile)?.id }).forEach { assertTrue("tile $it exists", it in r.board.tiles.indices) }
                    sc.spotCorners.forEach { assertTrue("corner $it exists", it in r.board.vertices.indices) }
                    sc.spotEdges.forEach { assertTrue("edge $it exists", it in r.board.edges.indices) }
                    sc.moment.b.keys.forEach { assertTrue(it.toInt() in r.board.vertices.indices) }
                    sc.moment.r.keys.forEach { assertTrue(it.toInt() in r.board.edges.indices) }
                }
            }
        }
    }

    @Test fun theCaptionsAreTheWebTutorialsCaptions() {
        val web = File("../../tutorial.js").takeIf { it.exists() }?.readText() ?: return   // run from the repository: the web file is two folders up
        // the fixed captions in tutorial.js, in order (the one with ${...} in it is made from the harbour of the recording, so it is left out)
        val fromWeb = Regex("""\bcap: '((?:[^'\\]|\\.)*)'""").findAll(web).map { it.groupValues[1].replace("\\'", "'") }.toList() +
            Regex("""\bcap: "((?:[^"\\]|\\.)*)"""").findAll(web).map { it.groupValues[1] }.toList()
        val mine = buildChapters(loadRecord()).flatMap { c -> c.steps.map { it.caption } }.toSet()
        assertTrue("found the web captions", fromWeb.size >= 30)
        val missing = fromWeb.filter { it !in mine }
        assertEquals("every web caption is in the app's tutorial: $missing", 0, missing.size)
    }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class TutorialScreensTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Test fun eachKindOfStepDrawsAndShowsItsCaption() {
        val record = loadRecord()
        val chapters = buildChapters(record)
        var ch by mutableIntStateOf(0); var st by mutableIntStateOf(0)
        rule.setContent {
            CompositionLocalProvider(LocalAnimate provides false) {
                HexlandsTheme { Box(Modifier.fillMaxSize().background(Navy)) { key(ch, st) { TutorialScreen(record, onClose = {}, startChapter = ch, startStep = st) } } }
            }
        }
        val dir = File("build/screens/tutorial").also { it.mkdirs() }
        // a picture of every step, so the whole tutorial can be looked through
        for ((ci, c) in chapters.withIndex()) for ((si, s) in c.steps.withIndex()) {
            ch = ci; st = si; rule.waitForIdle()
            rule.onNodeWithText(s.caption).assertExists()
            val view = rule.activity.window.decorView
            val bmp = android.graphics.Bitmap.createBitmap(view.width, view.height, android.graphics.Bitmap.Config.ARGB_8888)
            view.draw(android.graphics.Canvas(bmp))
            assertFalse("something is drawn", bmp.width == 0)
            File(dir, "%02d-%d.png".format(ci + 1, si + 1)).outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 80, it) }
        }
    }
}
